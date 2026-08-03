import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newId, useStore } from "@/lib/app/store";
import { CURRENCIES } from "@/lib/app/travel";
import { EXPENSE_CATEGORIES, defaultCurrency, todayISO } from "@/lib/app/money";
import type { Expense, ExpenseCategory, SplitMode } from "@/lib/app/types";
import { cn } from "@/lib/utils";

export function ExpenseDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: Expense | null;
}) {
  const { state, upsertExpense, removeExpense } = useStore();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(todayISO());
  const [paidBy, setPaidBy] = useState<"me" | "them">("me");
  const [split, setSplit] = useState<SplitMode>("even");
  const [myPercent, setMyPercent] = useState("50");
  const [category, setCategory] = useState<ExpenseCategory>("travel");
  const [tripId, setTripId] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setAmount(editing?.amount != null ? String(editing.amount) : "");
    setCurrency(editing?.currency ?? defaultCurrency(state));
    setDate(editing?.date ?? todayISO());
    setPaidBy(editing?.paidBy ?? "me");
    setSplit(editing?.split ?? "even");
    setMyPercent(String(editing?.myPercent ?? 50));
    setCategory(editing?.category ?? "travel");
    setTripId(editing?.tripId ?? "");
    setNotes(editing?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const myName = state.me.name || "Me";
  const theirName = state.them.name || "Them";

  const splitOptions: { id: SplitMode; label: string }[] = [
    { id: "even", label: "50 / 50" },
    { id: "mine", label: `All ${myName}` },
    { id: "theirs", label: `All ${theirName}` },
    { id: "custom", label: "Custom" },
  ];

  const save = () => {
    const value = Number(amount);
    if (!title.trim() || !Number.isFinite(value) || value <= 0) return;
    upsertExpense({
      id: editing?.id ?? newId(),
      title: title.trim(),
      amount: Math.round(value * 100) / 100,
      currency,
      date: date || todayISO(),
      paidBy,
      split,
      myPercent: split === "custom" ? Number(myPercent) || 0 : undefined,
      category,
      tripId: tripId || undefined,
      notes: notes.trim() || undefined,
      settled: editing?.settled ?? false,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editing ? "Edit expense" : "Log an expense"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="exp-title">What was it</Label>
            <Input
              id="exp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Flight to see you"
              className="rounded-2xl"
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Amount</Label>
              <Input
                id="exp-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="240"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-currency">Currency</Label>
              <select
                id="exp-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-9 rounded-2xl border border-input bg-transparent px-3 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Paid by</Label>
              <div className="flex gap-2">
                {(["me", "them"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPaidBy(p)}
                    className={cn(
                      "flex-1 rounded-2xl border px-2 py-2 text-sm transition-colors",
                      paidBy === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {p === "me" ? myName : theirName}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Split</Label>
            <div className="grid grid-cols-2 gap-2">
              {splitOptions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSplit(s.id)}
                  className={cn(
                    "rounded-2xl border px-2 py-2 text-sm transition-colors",
                    split === s.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {split === "custom" ? (
              <div className="flex items-center gap-2 pt-2">
                <Input
                  inputMode="numeric"
                  value={myPercent}
                  onChange={(e) => setMyPercent(e.target.value)}
                  className="w-20 rounded-2xl"
                />
                <span className="text-sm text-muted-foreground">
                  % is {myName}&apos;s share
                </span>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    category === c.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  <span className="mr-1">{c.emoji}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {state.trips.length ? (
            <div className="space-y-1.5">
              <Label htmlFor="exp-trip">Link to a trip</Label>
              <select
                id="exp-trip"
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
                className="h-9 w-full rounded-2xl border border-input bg-transparent px-3 text-sm"
              >
                <option value="">None</option>
                {state.trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="exp-notes">Notes</Label>
            <Textarea
              id="exp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-2xl"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                removeExpense(editing.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={save} className="rounded-2xl">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
