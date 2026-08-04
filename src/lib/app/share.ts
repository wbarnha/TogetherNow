import LZString from "lz-string";

import { migratePlaceIds } from "./migrate-ids";

import {
  LIMITS,
  isRecord,
  isoDate,
  list,
  str,
  strOr,
  timeZone,
  uniqueById,
  validEvent,
  validExpense,
  validGoal,
  validMilestone,
  validMood,
  validPlace,
  validWatchEntry,
} from "./validate";
import type {
  AppState,
  Expense,
  Milestone,
  MoodEntry,
  Place,
  PlanEvent,
  SavingsGoal,
  WatchEntry,
} from "./types";

export type SharePayload = {
  v: 1;
  from: string;
  fromZone: string;
  startDate: string | null;
  events: PlanEvent[];
  milestones: Milestone[];
  moods: MoodEntry[];
  /** the shared "Together" list — shortlisted date ideas */
  places: Place[];
  expenses: Expense[];
  goals: SavingsGoal[];
  /** my recent viewing / playing activity */
  watch: WatchEntry[];
  at: number;
};

const PREFIX = "TN1:";

/** How much of each collection a single code carries. */
const SHARE_CAPS = {
  events: 2_000,
  milestones: 500,
  moods: 30,
  places: 2_000,
  expenses: 2_000,
  goals: 200,
  watch: 200,
} as const;

export function buildShareCode(state: AppState): string {
  const share = state.sharing;
  const payload: SharePayload = {
    v: 1,
    from: state.me.name || "Partner",
    fromZone: state.me.timeZone,
    startDate: state.startDate,
    // things I own or that are shared become "theirs"/"ours" on their device
    events: share.plans
      ? state.events.filter((e) => e.owner !== "them").slice(-SHARE_CAPS.events)
      : [],
    milestones: share.dates
      ? state.milestones.filter((m) => m.owner !== "them").slice(-SHARE_CAPS.milestones)
      : [],
    // my recent mood check-ins so they land as "them" on the other device
    moods: share.moods ? state.moods.filter((m) => m.owner === "me").slice(-SHARE_CAPS.moods) : [],
    places: share.ideas
      ? state.places.filter((p) => p.shortlisted && p.owner !== "them").slice(0, SHARE_CAPS.places)
      : [],
    expenses: share.money ? state.expenses.slice(-SHARE_CAPS.expenses) : [],
    goals: share.money ? state.goals.slice(-SHARE_CAPS.goals) : [],
    watch: share.watch
      ? state.watchEntries.filter((e) => e.owner === "me").slice(-SHARE_CAPS.watch)
      : [],
    at: Date.now(),
  };
  return PREFIX + LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

const UNREADABLE = "That code couldn't be read. Check you copied all of it.";
const NOT_A_CODE = "That doesn't look like a Together Now share code.";

/**
 * Turn a pasted or scanned code into a payload that is safe to merge.
 *
 * A share code is a blob handed over by whoever is on the other end of a QR
 * scan or a chat message, so nothing in it is trusted. Every field goes
 * through {@link validate}: unknown keys are dropped, links are restricted to
 * http(s), sizes are capped, and any single malformed item is discarded
 * without failing the rest of the import.
 */
export function parseShareCode(raw: string): SharePayload {
  if (typeof raw !== "string" || raw.length > LIMITS.shareCode) throw new Error(UNREADABLE);

  const trimmed = raw.trim().replace(/\s+/g, "");
  const body = trimmed.startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : trimmed;
  if (!body) throw new Error(UNREADABLE);

  // lz-string expands aggressively; refuse a payload that decompresses into
  // more JSON than any real archive could contain rather than parsing it.
  const json = LZString.decompressFromEncodedURIComponent(body);
  if (!json) throw new Error(UNREADABLE);
  if (json.length > LIMITS.sharePayload) throw new Error(NOT_A_CODE);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(UNREADABLE);
  }
  if (!isRecord(parsed) || parsed["v"] !== 1) throw new Error(NOT_A_CODE);

  const now = Date.now();
  const payload: SharePayload = {
    v: 1,
    from: strOr(parsed["from"], "Partner", LIMITS.shortText),
    fromZone: timeZone(parsed["fromZone"], "UTC"),
    startDate: isoDate(parsed["startDate"]) ?? null,
    events: uniqueById(list(parsed["events"], SHARE_CAPS.events, (v) => validEvent(v, now))),
    milestones: uniqueById(
      list(parsed["milestones"], SHARE_CAPS.milestones, (v) => validMilestone(v, now)),
    ),
    moods: uniqueById(list(parsed["moods"], SHARE_CAPS.moods, (v) => validMood(v, now))),
    places: uniqueById(list(parsed["places"], SHARE_CAPS.places, (v) => validPlace(v, now))),
    expenses: uniqueById(
      list(parsed["expenses"], SHARE_CAPS.expenses, (v) => validExpense(v, now)),
    ),
    goals: uniqueById(list(parsed["goals"], SHARE_CAPS.goals, (v) => validGoal(v, now))),
    watch: uniqueById(list(parsed["watch"], SHARE_CAPS.watch, (v) => validWatchEntry(v, now))),
    at: now,
  };

  // A code that carried nothing recognisable is far more likely to be a
  // truncated paste than an empty archive, so say so instead of reporting a
  // successful merge of zero items.
  const total =
    payload.events.length +
    payload.milestones.length +
    payload.moods.length +
    payload.places.length +
    payload.expenses.length +
    payload.goals.length +
    payload.watch.length;
  if (total === 0 && !str(parsed["from"], LIMITS.shortText)) throw new Error(NOT_A_CODE);

  return payload;
}

/**
 * Which categories of a code the recipient has agreed to take.
 *
 * A code can carry mood check-ins, spending and viewing history, and the
 * accept screen used to list only plans, dates, ideas and savings goals — so
 * the most personal categories arrived without ever being named. Accepting is
 * now per category, and everything a code contains is disclosed first.
 */
export type AcceptChoices = Record<ShareCategory, boolean>;

export type ShareCategory =
  "events" | "milestones" | "places" | "moods" | "expenses" | "goals" | "watch";

export const SHARE_CATEGORIES: {
  key: ShareCategory;
  label: string;
  /** Worth a second look before accepting. */
  sensitive: boolean;
}[] = [
  { key: "events", label: "Plans", sensitive: false },
  { key: "milestones", label: "Important dates", sensitive: false },
  { key: "places", label: "Together list ideas", sensitive: false },
  { key: "goals", label: "Savings goals", sensitive: false },
  { key: "expenses", label: "Shared expenses", sensitive: true },
  { key: "moods", label: "Daily mood check-ins", sensitive: true },
  { key: "watch", label: "Viewing and playing history", sensitive: true },
];

export const acceptAll = (): AcceptChoices => ({
  events: true,
  milestones: true,
  places: true,
  moods: true,
  expenses: true,
  goals: true,
  watch: true,
});

/** Flip ownership of incoming items to the receiving device's perspective. */
function flip<T extends { owner: "me" | "them" | "us" }>(items: T[]): T[] {
  return items.map((i) => ({ ...i, owner: i.owner === "me" ? "them" : i.owner }) as T);
}

/**
 * Last-write-wins merge on the item id, with one integrity rule: an incoming
 * item can never replace something the receiving device owns.
 *
 * Ids are the only join key here, and a code can claim any id it likes. Without
 * this guard a partner's code — or anything that got hold of one — could
 * silently rewrite the recipient's own plans by reusing their ids.
 */
function mergeById<T extends { id: string; updatedAt: number }>(
  mine: T[],
  incoming: T[],
  isMine: (item: T) => boolean,
  cap: number,
) {
  const map = new Map(mine.map((i) => [i.id, i]));
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!existing) {
      if (map.size >= cap) break;
      map.set(item.id, item);
      added += 1;
    } else if (item.updatedAt > existing.updatedAt && !isMine(existing)) {
      map.set(item.id, item);
      updated += 1;
    }
  }
  return { items: [...map.values()], added, updated };
}

const ownedByMe = (item: { owner: string }) => item.owner === "me";
const paidByMe = (item: { paidBy: string }) => item.paidBy === "me";
/** Goals and expenses are jointly owned, so neither side can lock the other out. */
const neverMine = () => false;

export function applyShareCode(
  state: AppState,
  payload: SharePayload,
  choices: AcceptChoices = acceptAll(),
) {
  const take = <T>(category: ShareCategory, items: T[]): T[] => (choices[category] ? items : []);

  const events = mergeById(
    state.events,
    flip(take("events", payload.events)),
    ownedByMe,
    LIMITS.events,
  );
  const milestones = mergeById(
    state.milestones,
    flip(take("milestones", payload.milestones)),
    ownedByMe,
    LIMITS.milestones,
  );
  const incomingMoods: MoodEntry[] = take("moods", payload.moods).map((m) => ({
    ...m,
    owner: "them",
  }));
  const moods = mergeById(state.moods, incomingMoods, ownedByMe, LIMITS.moods);
  // Normalised first: a partner still on the previous build sends places under
  // the old 32-bit ids, which would miss the copies already here and duplicate
  // every one of them.
  const places = mergeById(
    state.places,
    migratePlaceIds(flip(take("places", payload.places))),
    ownedByMe,
    LIMITS.places,
  );
  // money is two-sided: swap the payer / saver perspective for the receiving device
  const incomingExpenses: Expense[] = take("expenses", payload.expenses).map((e) => ({
    ...e,
    paidBy: e.paidBy === "me" ? "them" : "me",
    split: e.split === "mine" ? "theirs" : e.split === "theirs" ? "mine" : e.split,
    myPercent: e.split === "custom" ? 100 - (e.myPercent ?? 50) : e.myPercent,
  }));
  const expenses = mergeById(state.expenses, incomingExpenses, paidByMe, LIMITS.expenses);
  const incomingGoals: SavingsGoal[] = take("goals", payload.goals).map((g) => ({
    ...g,
    savedByMe: g.savedByThem,
    savedByThem: g.savedByMe,
    monthlyByMe: g.monthlyByThem,
    monthlyByThem: g.monthlyByMe,
  }));
  const goals = mergeById(state.goals, incomingGoals, neverMine, LIMITS.goals);

  const incomingWatch: WatchEntry[] = take("watch", payload.watch).map((e) => ({
    ...e,
    owner: "them",
  }));
  const knownWatch = new Set(state.watchEntries.map((e) => e.id));
  const freshWatch = incomingWatch
    .filter((e) => !knownWatch.has(e.id))
    .slice(0, Math.max(0, LIMITS.watchEntries - state.watchEntries.length));

  const next: AppState = {
    ...state,
    them: {
      ...state.them,
      name: state.them.name || payload.from,
      timeZone: payload.fromZone || state.them.timeZone,
    },
    startDate: state.startDate ?? payload.startDate,
    pairedAt: state.pairedAt ?? Date.now(),
    inviteFailedAt: null,
    lastReceivedAt: Date.now(),
    events: events.items,
    milestones: milestones.items,
    moods: moods.items,
    places: places.items,
    expenses: expenses.items,
    goals: goals.items,
    watchEntries: [...state.watchEntries, ...freshWatch].sort((a, b) => a.at - b.at),
  };
  return {
    state: next,
    summary: {
      from: payload.from,
      added:
        events.added +
        milestones.added +
        places.added +
        moods.added +
        expenses.added +
        goals.added +
        freshWatch.length,
      updated:
        events.updated +
        milestones.updated +
        places.updated +
        moods.updated +
        expenses.updated +
        goals.updated,
    },
  };
}

/** What a code contains, for the accept screen preview. */
/**
 * What a code contains, for the accept screen.
 *
 * Every category the payload can carry is counted, including the ones the old
 * preview left out entirely — a recipient could otherwise take on a partner's
 * mood history without it ever being mentioned.
 */
export function previewShareCode(payload: SharePayload) {
  return {
    from: payload.from,
    fromZone: payload.fromZone,
    startDate: payload.startDate,
    counts: {
      events: payload.events.length,
      milestones: payload.milestones.length,
      places: payload.places.length,
      moods: payload.moods.length,
      expenses: payload.expenses.length,
      goals: payload.goals.length,
      watch: payload.watch.length,
    } satisfies Record<ShareCategory, number>,
  };
}
