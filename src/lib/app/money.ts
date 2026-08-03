import type { AppState, Expense, ExpenseCategory, SavingsGoal } from "./types";
import { formatMoney } from "./travel";

export { formatMoney };

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string; emoji: string }[] = [
  { id: "travel", label: "Travel", emoji: "✈️" },
  { id: "gifts", label: "Gifts", emoji: "🎁" },
  { id: "dates", label: "Dates", emoji: "🍜" },
  { id: "subscriptions", label: "Subscriptions", emoji: "📺" },
  { id: "calls", label: "Phone & data", emoji: "📱" },
  { id: "other", label: "Other", emoji: "🧾" },
];

export function categoryMeta(id: ExpenseCategory) {
  return EXPENSE_CATEGORIES.find((c) => c.id === id) ?? EXPENSE_CATEGORIES[5]!;
}

/** Fraction of an expense that is mine, 0..1. */
export function myShareFraction(e: Expense): number {
  if (e.split === "mine") return 1;
  if (e.split === "theirs") return 0;
  if (e.split === "custom") {
    const p = Math.min(100, Math.max(0, e.myPercent ?? 50));
    return p / 100;
  }
  return 0.5;
}

/**
 * Signed balance for one expense, in its own currency.
 * Positive => they owe me. Negative => I owe them.
 */
export function expenseBalance(e: Expense): number {
  const myShare = e.amount * myShareFraction(e);
  const theirShare = e.amount - myShare;
  return e.paidBy === "me" ? theirShare : -myShare;
}

export type CurrencyBalance = {
  currency: string;
  /** positive => they owe me */
  net: number;
  paidByMe: number;
  paidByThem: number;
  total: number;
};

/** Net who-owes-who per currency across unsettled expenses. */
export function balances(expenses: Expense[]): CurrencyBalance[] {
  const map = new Map<string, CurrencyBalance>();
  for (const e of expenses) {
    if (e.settled) continue;
    const row = map.get(e.currency) ?? {
      currency: e.currency,
      net: 0,
      paidByMe: 0,
      paidByThem: 0,
      total: 0,
    };
    row.net += expenseBalance(e);
    row.total += e.amount;
    if (e.paidBy === "me") row.paidByMe += e.amount;
    else row.paidByThem += e.amount;
    map.set(e.currency, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, net: round2(r.net) }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Totals per category for a month (yyyy-MM) or all time when month is undefined. */
export function categoryTotals(expenses: Expense[], currency: string, month?: string) {
  const totals = new Map<ExpenseCategory, number>();
  for (const e of expenses) {
    if (e.currency !== currency) continue;
    if (month && !e.date.startsWith(month)) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Rolling monthly spend for the last n months, oldest first. */
export function monthlySpend(expenses: Expense[], currency: string, months = 6) {
  const now = new Date();
  const out: { month: string; amount: number }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    const amount = expenses
      .filter((e) => e.currency === currency && e.date.startsWith(key))
      .reduce((sum, e) => sum + e.amount, 0);
    out.push({ month: key, amount: round2(amount) });
  }
  return out;
}

export type GoalProgress = {
  saved: number;
  remaining: number;
  percent: number;
  monthly: number;
  /** whole months left until the deadline, if set */
  monthsLeft?: number | undefined;
  /** what you'd need to put away together each month to make the deadline */
  neededMonthly?: number | undefined;
  /** projected completion date at the current monthly plan */
  projectedDate?: Date | undefined;
  onTrack: boolean;
};

export function goalProgress(goal: SavingsGoal, now = new Date()): GoalProgress {
  const saved = round2(goal.savedByMe + goal.savedByThem);
  const remaining = round2(Math.max(0, goal.target - saved));
  const percent = goal.target > 0 ? Math.min(100, (saved / goal.target) * 100) : 0;
  const monthly = round2(goal.monthlyByMe + goal.monthlyByThem);

  let monthsLeft: number | undefined;
  let neededMonthly: number | undefined;
  if (goal.deadline) {
    const [y, m, d] = goal.deadline.split("-").map(Number);
    if (y && m && d) {
      const due = new Date(y, m - 1, d);
      const diff = (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth());
      monthsLeft = Math.max(0, diff);
      neededMonthly = monthsLeft > 0 ? round2(remaining / monthsLeft) : remaining;
    }
  }

  let projectedDate: Date | undefined;
  if (remaining > 0 && monthly > 0) {
    const monthsNeeded = Math.ceil(remaining / monthly);
    projectedDate = new Date(now.getFullYear(), now.getMonth() + monthsNeeded, now.getDate());
  }

  const onTrack =
    remaining === 0 || (neededMonthly != null ? monthly >= neededMonthly : monthly > 0);

  return { saved, remaining, percent, monthly, monthsLeft, neededMonthly, projectedDate, onTrack };
}

/** Total planned monthly outflow across all goals, grouped by currency. */
export function monthlyPlan(goals: SavingsGoal[]) {
  const map = new Map<string, { currency: string; me: number; them: number }>();
  for (const g of goals) {
    const row = map.get(g.currency) ?? { currency: g.currency, me: 0, them: 0 };
    row.me += g.monthlyByMe;
    row.them += g.monthlyByThem;
    map.set(g.currency, row);
  }
  return [...map.values()].map((r) => ({
    ...r,
    me: round2(r.me),
    them: round2(r.them),
    total: round2(r.me + r.them),
  }));
}

/** Currency to preselect: most recently used, else a trip's, else USD. */
export function defaultCurrency(state: AppState) {
  const recent = [...state.expenses].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (recent) return recent.currency;
  const trip = [...state.trips].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return trip?.currency ?? "USD";
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}
