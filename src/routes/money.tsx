import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, HandCoins, Minus, Pencil, PiggyBank, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { ExpenseDialog } from "@/components/app/ExpenseDialog";
import { GoalDialog } from "@/components/app/GoalDialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useStore } from "@/lib/app/store";
import {
  balances,
  categoryMeta,
  categoryTotals,
  defaultCurrency,
  expenseBalance,
  formatMoney,
  goalProgress,
  monthKey,
  monthLabel,
  monthlyPlan,
  monthlySpend,
  round2,
} from "@/lib/app/money";
import type { Expense, SavingsGoal } from "@/lib/app/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/money")({
  head: () => ({
    meta: [
      { title: "Money together — Together Now" },
      {
        name: "description",
        content:
          "Split what you spend on each other, see who owes who, and save up for the next visit with shared goals and a monthly plan.",
      },
      { property: "og:title", content: "Money together — Together Now" },
      {
        property: "og:description",
        content: "Shared expenses, settle-up balances and savings goals for long distance couples.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MoneyPage,
});

type Tab = "balance" | "goals" | "log";

function MoneyPage() {
  const { state, upsertExpense, upsertGoal } = useStore();
  const [tab, setTab] = useState<Tab>("balance");
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [goalDialog, setGoalDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);

  const myName = state.me.name || "You";
  const theirName = state.them.name || "Them";
  const currency = defaultCurrency(state);

  const open = useMemo(() => state.expenses.filter((e) => !e.settled), [state.expenses]);
  const rows = useMemo(
    () => [...state.expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [state.expenses],
  );
  const nets = useMemo(() => balances(state.expenses), [state.expenses]);
  const thisMonth = monthKey();
  const byCategory = useMemo(
    () => categoryTotals(state.expenses, currency, thisMonth),
    [state.expenses, currency, thisMonth],
  );
  const trend = useMemo(
    () => monthlySpend(state.expenses, currency, 6),
    [state.expenses, currency],
  );
  const plan = useMemo(() => monthlyPlan(state.goals), [state.goals]);
  const monthTotal = byCategory.reduce((s, c) => s + c.amount, 0);
  const peak = Math.max(1, ...trend.map((t) => t.amount));

  const settleAll = () => {
    const ids = open.map((e) => e.id);
    if (!ids.length) return;
    for (const e of open) upsertExpense({ ...e, settled: true });
    toast.success("Squared up", {
      description: `${ids.length} expense${ids.length === 1 ? "" : "s"} marked settled.`,
      action: {
        label: "Undo",
        onClick: () => {
          for (const e of open) upsertExpense({ ...e, settled: false });
        },
      },
    });
  };

  const bump = (goal: SavingsGoal, who: "me" | "them", delta: number) => {
    const next =
      who === "me"
        ? { ...goal, savedByMe: Math.max(0, round2(goal.savedByMe + delta)) }
        : { ...goal, savedByThem: Math.max(0, round2(goal.savedByThem + delta)) };
    upsertGoal(next);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "balance", label: "Balance" },
    { id: "goals", label: "Goals" },
    { id: "log", label: "Spending" },
  ];

  return (
    <AppShell
      title="Money"
      subtitle="Split the distance, save for the next visit"
      action={
        <Button
          size="sm"
          className="rounded-2xl"
          onClick={() => {
            if (tab === "goals") {
              setEditingGoal(null);
              setGoalDialog(true);
            } else {
              setEditingExpense(null);
              setExpenseDialog(true);
            }
          }}
        >
          <Plus className="size-4" />
          {tab === "goals" ? "Goal" : "Expense"}
        </Button>
      }
    >
      <div className="flex gap-2 rounded-2xl bg-muted/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "balance" ? (
        <div className="space-y-4">
          {nets.length ? (
            nets.map((row) => {
              const owedToMe = row.net > 0;
              const amount = Math.abs(row.net);
              return (
                <div key={row.currency} className="rounded-3xl border border-border bg-card p-5">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Open balance · {row.currency}
                  </p>
                  <p className="font-display mt-1 text-3xl font-semibold">
                    {amount === 0 ? "All square" : formatMoney(amount, row.currency)}
                  </p>
                  {amount > 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {owedToMe ? `${theirName} owes ${myName}` : `${myName} owes ${theirName}`}
                    </p>
                  ) : null}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">{myName} paid</p>
                      <p className="font-medium">{formatMoney(row.paidByMe, row.currency)}</p>
                    </div>
                    <div className="rounded-2xl bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">{theirName} paid</p>
                      <p className="font-medium">{formatMoney(row.paidByThem, row.currency)}</p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyCard
              icon={<HandCoins className="size-5" />}
              title="Nothing to settle"
              body="Log a flight, a gift or a delivery you sent and it lands here as a shared balance."
            />
          )}

          {open.length ? (
            <>
              <Button variant="outline" className="w-full rounded-2xl" onClick={settleAll}>
                <Check className="size-4" />
                Mark everything settled
              </Button>
              <div className="space-y-2">
                {open.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    myName={myName}
                    theirName={theirName}
                    onEdit={() => {
                      setEditingExpense(e);
                      setExpenseDialog(true);
                    }}
                    onToggleSettled={() => upsertExpense({ ...e, settled: !e.settled })}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "goals" ? (
        <div className="space-y-4">
          {plan.map((p) => (
            <div key={p.currency} className="rounded-3xl border border-border bg-card p-5">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                Monthly plan · {p.currency}
              </p>
              <p className="font-display mt-1 text-3xl font-semibold">
                {formatMoney(p.total, p.currency)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatMoney(p.me, p.currency)} from {myName} · {formatMoney(p.them, p.currency)}{" "}
                from {theirName}
              </p>
            </div>
          ))}

          {state.goals.length ? (
            state.goals.map((goal) => {
              const p = goalProgress(goal);
              return (
                <div key={goal.id} className="rounded-3xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold">{goal.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatMoney(p.saved, goal.currency)} of{" "}
                        {formatMoney(goal.target, goal.currency)}
                        {p.remaining > 0
                          ? ` · ${formatMoney(p.remaining, goal.currency)} to go`
                          : " · funded 🎉"}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-2xl"
                      onClick={() => {
                        setEditingGoal(goal);
                        setGoalDialog(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>

                  <Progress value={p.percent} className="mt-4 h-2" />

                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {p.neededMonthly != null ? (
                      <p>
                        {p.monthsLeft} month{p.monthsLeft === 1 ? "" : "s"} left ·{" "}
                        {formatMoney(p.neededMonthly, goal.currency)} / month needed
                      </p>
                    ) : null}
                    {p.monthly > 0 ? (
                      <p>
                        Putting away {formatMoney(p.monthly, goal.currency)} / month
                        {p.projectedDate
                          ? ` · funded by ${p.projectedDate.toLocaleDateString(undefined, {
                              month: "short",
                              year: "numeric",
                            })}`
                          : ""}
                      </p>
                    ) : (
                      <p>No monthly contribution set yet.</p>
                    )}
                    {p.remaining > 0 ? (
                      <p className={cn(p.onTrack ? "text-primary" : "text-destructive")}>
                        {p.onTrack ? "On track" : "Behind the pace"}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Contribution
                      label={myName}
                      value={goal.savedByMe}
                      currency={goal.currency}
                      step={goal.monthlyByMe || 25}
                      onBump={(d) => bump(goal, "me", d)}
                    />
                    <Contribution
                      label={theirName}
                      value={goal.savedByThem}
                      currency={goal.currency}
                      step={goal.monthlyByThem || 25}
                      onBump={(d) => bump(goal, "them", d)}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyCard
              icon={<PiggyBank className="size-5" />}
              title="No goals yet"
              body="Set a target for the next visit and we'll work out what each of you needs to put away every month."
            />
          )}
        </div>
      ) : null}

      {tab === "log" ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {monthLabel(thisMonth)}
            </p>
            <p className="font-display mt-1 text-3xl font-semibold">
              {formatMoney(round2(monthTotal), currency)}
            </p>
            <div className="mt-4 flex items-end gap-2">
              {trend.map((t) => (
                <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cn(
                      "w-full rounded-t-lg bg-primary/25",
                      t.month === thisMonth && "bg-primary/60",
                    )}
                    style={{ height: `${Math.max(4, (t.amount / peak) * 72)}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{t.month.slice(5)}</span>
                </div>
              ))}
            </div>
            {byCategory.length ? (
              <ul className="mt-4 space-y-2">
                {byCategory.map((c) => {
                  const meta = categoryMeta(c.category);
                  return (
                    <li key={c.category} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {meta.emoji} {meta.label}
                      </span>
                      <span className="font-medium">{formatMoney(c.amount, currency)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Nothing logged this month yet.</p>
            )}
          </div>

          {rows.length ? (
            <div className="space-y-2">
              {rows.map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
                  myName={myName}
                  theirName={theirName}
                  onEdit={() => {
                    setEditingExpense(e);
                    setExpenseDialog(true);
                  }}
                  onToggleSettled={() => upsertExpense({ ...e, settled: !e.settled })}
                />
              ))}
            </div>
          ) : (
            <EmptyCard
              icon={<HandCoins className="size-5" />}
              title="No expenses yet"
              body="Log what you spend on visits, gifts and shared subscriptions to see where the distance money goes."
            />
          )}
        </div>
      ) : null}

      <ExpenseDialog
        open={expenseDialog}
        onOpenChange={setExpenseDialog}
        editing={editingExpense}
      />
      <GoalDialog open={goalDialog} onOpenChange={setGoalDialog} editing={editingGoal} />
    </AppShell>
  );
}

function ExpenseRow({
  expense,
  myName,
  theirName,
  onEdit,
  onToggleSettled,
}: {
  expense: Expense;
  myName: string;
  theirName: string;
  onEdit: () => void;
  onToggleSettled: () => void;
}) {
  const meta = categoryMeta(expense.category);
  const bal = round2(expenseBalance(expense));
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border bg-card p-3",
        expense.settled && "opacity-60",
      )}
    >
      <span className="text-lg">{meta.emoji}</span>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{expense.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatMoney(expense.amount, expense.currency)} ·{" "}
          {expense.paidBy === "me" ? myName : theirName} paid · {expense.date}
        </p>
      </button>
      <div className="text-right">
        <p
          className={cn(
            "text-sm font-medium",
            expense.settled
              ? "text-muted-foreground"
              : bal >= 0
                ? "text-primary"
                : "text-foreground",
          )}
        >
          {bal === 0
            ? "—"
            : `${bal > 0 ? "+" : "−"}${formatMoney(Math.abs(bal), expense.currency)}`}
        </p>
        <button
          type="button"
          onClick={onToggleSettled}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {expense.settled ? "Reopen" : "Settle"}
        </button>
      </div>
    </div>
  );
}

function Contribution({
  label,
  value,
  currency,
  step,
  onBump,
}: {
  label: string;
  value: number;
  currency: string;
  step: number;
  onBump: (delta: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{formatMoney(value, currency)}</p>
      <div className="mt-2 flex gap-2">
        <Button
          size="icon"
          variant="outline"
          className="size-8 rounded-xl"
          onClick={() => onBump(-step)}
          aria-label={`Remove ${step} from ${label}`}
        >
          <Minus className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="size-8 rounded-xl"
          onClick={() => onBump(step)}
          aria-label={`Add ${step} for ${label}`}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function EmptyCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="font-display mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
