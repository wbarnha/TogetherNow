import LZString from "lz-string";
import type { AppState, Expense, Milestone, MoodEntry, PlanEvent, SavingsGoal } from "./types";

export type SharePayload = {
  v: 1;
  from: string;
  fromZone: string;
  startDate: string | null;
  events: PlanEvent[];
  milestones: Milestone[];
  moods?: MoodEntry[];
  expenses?: Expense[];
  goals?: SavingsGoal[];
  at: number;
};

const PREFIX = "TN1:";

export function buildShareCode(state: AppState): string {
  const payload: SharePayload = {
    v: 1,
    from: state.me.name || "Partner",
    fromZone: state.me.timeZone,
    startDate: state.startDate,
    // things I own or that are shared become "theirs"/"ours" on their device
    events: state.events.filter((e) => e.owner !== "them"),
    milestones: state.milestones.filter((m) => m.owner !== "them"),
    // my recent mood check-ins so they land as "them" on the other device
    moods: state.moods.filter((m) => m.owner === "me").slice(-30),
    expenses: state.expenses,
    goals: state.goals,
    at: Date.now(),
  };
  return PREFIX + LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function parseShareCode(raw: string): SharePayload {
  const trimmed = raw.trim().replace(/\s+/g, "");
  const body = trimmed.startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : trimmed;
  const json = LZString.decompressFromEncodedURIComponent(body);
  if (!json) throw new Error("That code couldn't be read. Check you copied all of it.");
  const parsed = JSON.parse(json) as SharePayload;
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.events)) {
    throw new Error("That doesn't look like a Together Now share code.");
  }
  return parsed;
}

/** Flip ownership of incoming items to the receiving device's perspective. */
function flip<T extends { owner: "me" | "them" | "us" }>(items: T[]): T[] {
  return items.map((i) => ({ ...i, owner: i.owner === "me" ? "them" : i.owner }) as T);
}

function mergeById<T extends { id: string; updatedAt: number }>(mine: T[], incoming: T[]) {
  const map = new Map(mine.map((i) => [i.id, i]));
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      added += 1;
    } else if (item.updatedAt > existing.updatedAt) {
      map.set(item.id, item);
      updated += 1;
    }
  }
  return { items: [...map.values()], added, updated };
}

export function applyShareCode(state: AppState, payload: SharePayload) {
  const events = mergeById(state.events, flip(payload.events));
  const milestones = mergeById(state.milestones, flip(payload.milestones));
  const incomingMoods: MoodEntry[] = (payload.moods ?? []).map((m) => ({ ...m, owner: "them" }));
  const moods = mergeById(state.moods, incomingMoods);
  // money is two-sided: swap the payer / saver perspective for the receiving device
  const incomingExpenses: Expense[] = (payload.expenses ?? []).map((e) => ({
    ...e,
    paidBy: e.paidBy === "me" ? "them" : "me",
    split: e.split === "mine" ? "theirs" : e.split === "theirs" ? "mine" : e.split,
    myPercent: e.split === "custom" ? 100 - (e.myPercent ?? 50) : e.myPercent,
  }));
  const expenses = mergeById(state.expenses, incomingExpenses);
  const incomingGoals: SavingsGoal[] = (payload.goals ?? []).map((g) => ({
    ...g,
    savedByMe: g.savedByThem,
    savedByThem: g.savedByMe,
    monthlyByMe: g.monthlyByThem,
    monthlyByThem: g.monthlyByMe,
  }));
  const goals = mergeById(state.goals, incomingGoals);
  const next: AppState = {
    ...state,
    them: {
      ...state.them,
      name: state.them.name || payload.from,
      timeZone: payload.fromZone || state.them.timeZone,
    },
    startDate: state.startDate ?? payload.startDate,
    pairedAt: state.pairedAt ?? Date.now(),
    events: events.items,
    milestones: milestones.items,
    moods: moods.items,
    expenses: expenses.items,
    goals: goals.items,
  };
  return {
    state: next,
    summary: {
      from: payload.from,
      added: events.added + milestones.added + expenses.added + goals.added,
      updated: events.updated + milestones.updated + expenses.updated + goals.updated,
    },
  };
}
