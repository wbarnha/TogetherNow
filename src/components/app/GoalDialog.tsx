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
import { defaultCurrency } from "@/lib/app/money";
import type { SavingsGoal } from "@/lib/app/types";

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

export function GoalDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: SavingsGoal | null;
}) {
  const { state, upsertGoal, removeGoal } = useStore();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [deadline, setDeadline] = useState("");
  const [monthlyMe, setMonthlyMe] = useState("");
  const [monthlyThem, setMonthlyThem] = useState("");
  const [tripId, setTripId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setTarget(editing?.target != null ? String(editing.target) : "");
    setCurrency(editing?.currency ?? defaultCurrency(state));
    setDeadline(editing?.deadline ?? "");
    setMonthlyMe(editing?.monthlyByMe ? String(editing.monthlyByMe) : "");
    setMonthlyThem(editing?.monthlyByThem ? String(editing.monthlyByThem) : "");
    setTripId(editing?.tripId ?? "");
    setNotes(editing?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const myName = state.me.name || "Me";
  const theirName = state.them.name || "Them";

  const save = () => {
    if (!title.trim() || num(target) <= 0) return;
    upsertGoal({
      id: editing?.id ?? newId(),
      title: title.trim(),
      target: num(target),
      currency,
      deadline: deadline || undefined,
      savedByMe: editing?.savedByMe ?? 0,
      savedByThem: editing?.savedByThem ?? 0,
      monthlyByMe: num(monthlyMe),
      monthlyByThem: num(monthlyThem),
      tripId: tripId || undefined,
      notes: notes.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editing ? "Edit goal" : "New savings goal"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-title">Saving for</Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summer visit"
              className="rounded-2xl"
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Target</Label>
              <Input
                id="goal-target"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="1200"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-currency">Currency</Label>
              <select
                id="goal-currency"
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

          <div className="space-y-1.5">
            <Label htmlFor="goal-deadline">Needed by</Label>
            <Input
              id="goal-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="rounded-2xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-mm">{myName} / month</Label>
              <Input
                id="goal-mm"
                inputMode="decimal"
                value={monthlyMe}
                onChange={(e) => setMonthlyMe(e.target.value)}
                placeholder="150"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-mt">{theirName} / month</Label>
              <Input
                id="goal-mt"
                inputMode="decimal"
                value={monthlyThem}
                onChange={(e) => setMonthlyThem(e.target.value)}
                placeholder="150"
                className="rounded-2xl"
              />
            </div>
          </div>

          {state.trips.length ? (
            <div className="space-y-1.5">
              <Label htmlFor="goal-trip">Link to a trip</Label>
              <select
                id="goal-trip"
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
            <Label htmlFor="goal-notes">Notes</Label>
            <Textarea
              id="goal-notes"
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
                removeGoal(editing.id);
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
