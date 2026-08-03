import type { AppState, MoodEntry, MoodScore, Owner } from "./types";

export type MoodOption = {
  score: MoodScore;
  emoji: string;
  label: string;
};

export const MOODS: MoodOption[] = [
  { score: 1, emoji: "😞", label: "Rough" },
  { score: 2, emoji: "😕", label: "Low" },
  { score: 3, emoji: "😐", label: "Okay" },
  { score: 4, emoji: "🙂", label: "Good" },
  { score: 5, emoji: "😍", label: "Great" },
];

export function moodOption(score: MoodScore | undefined) {
  return MOODS.find((m) => m.score === score);
}

/** yyyy-MM-dd in a given time zone. */
export function todayIn(timeZone: string, at: Date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export function moodFor(state: AppState, owner: "me" | "them", date: string) {
  return state.moods.find((m) => m.owner === owner && m.date === date);
}

export function moodsFor(state: AppState, owner: "me" | "them") {
  return [...state.moods]
    .filter((m) => m.owner === owner)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Last `days` dates ending today, oldest first. */
export function recentDates(timeZone: string, days: number, at: Date = new Date()) {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(at.getTime() - i * 86400000);
    out.push(todayIn(timeZone, d));
  }
  return out;
}

/** Consecutive days (ending today or yesterday) with a check-in. */
export function checkInStreak(state: AppState, timeZone: string, at: Date = new Date()) {
  const logged = new Set(state.moods.filter((m) => m.owner === "me").map((m) => m.date));
  let streak = 0;
  for (let i = 0; i < 400; i += 1) {
    const date = todayIn(timeZone, new Date(at.getTime() - i * 86400000));
    if (logged.has(date)) streak += 1;
    else if (i > 0) break;
  }
  return streak;
}

export function averageScore(entries: MoodEntry[]) {
  if (entries.length === 0) return null;
  const sum = entries.reduce((acc, e) => acc + e.score, 0);
  return Math.round((sum / entries.length) * 10) / 10;
}

/** What the home-screen widget renders. */
export type WidgetSnapshot = {
  v: 1;
  updatedAt: number;
  couple: string;
  me: { name: string; score: MoodScore | null; emoji: string; label: string; note: string | null };
  them: {
    name: string;
    score: MoodScore | null;
    emoji: string;
    label: string;
    note: string | null;
    date: string | null;
  };
  streak: number;
  next: { title: string; date: string; owner: Owner } | null;
};

export function buildWidgetSnapshot(state: AppState, at: Date = new Date()): WidgetSnapshot {
  const myDate = todayIn(state.me.timeZone, at);
  const mine = moodFor(state, "me", myDate);
  const theirs = moodsFor(state, "them")[0];
  const today = todayIn(state.me.timeZone, at);
  const next = [...state.events]
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))[0];

  return {
    v: 1,
    updatedAt: at.getTime(),
    couple: [state.me.name || "You", state.them.name || "Them"].join(" & "),
    me: {
      name: state.me.name || "You",
      score: mine?.score ?? null,
      emoji: moodOption(mine?.score)?.emoji ?? "➕",
      label: moodOption(mine?.score)?.label ?? "Not yet",
      note: mine?.note ?? null,
    },
    them: {
      name: state.them.name || "Them",
      score: theirs?.score ?? null,
      emoji: moodOption(theirs?.score)?.emoji ?? "…",
      label: moodOption(theirs?.score)?.label ?? "No check-in yet",
      note: theirs?.note ?? null,
      date: theirs?.date ?? null,
    },
    streak: checkInStreak(state, state.me.timeZone, at),
    next: next ? { title: next.title, date: next.date, owner: next.owner } : null,
  };
}
