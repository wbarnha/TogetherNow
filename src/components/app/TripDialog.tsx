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
import { CURRENCIES, TRIP_STATUS } from "@/lib/app/travel";
import type { Owner, Trip } from "@/lib/app/types";
import { cn } from "@/lib/utils";

const num = (v: string) => {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) ? n : undefined;
};

export function TripDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: Trip | null;
}) {
  const { state, upsertTrip, removeTrip } = useStore();
  const [title, setTitle] = useState("");
  const [traveller, setTraveller] = useState<Owner>("me");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<Trip["status"]>("idea");
  const [currency, setCurrency] = useState("USD");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setTraveller(editing?.traveller ?? "me");
    setOrigin(editing?.origin ?? "");
    setDestination(editing?.destination ?? "");
    setStartDate(editing?.startDate ?? "");
    setEndDate(editing?.endDate ?? "");
    setStatus(editing?.status ?? "idea");
    setCurrency(editing?.currency ?? "USD");
    setBudget(editing?.budget != null ? String(editing.budget) : "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const travellers: { value: Owner; label: string }[] = [
    { value: "me", label: state.me.name || "Me" },
    { value: "them", label: state.them.name || "Them" },
    { value: "us", label: "Meet halfway" },
  ];

  const save = () => {
    if (!origin.trim() && !destination.trim() && !title.trim()) return;
    upsertTrip({
      id: editing?.id ?? newId(),
      title: title.trim() || `${origin.trim() || "Home"} → ${destination.trim() || "Them"}`,
      traveller,
      origin: origin.trim(),
      destination: destination.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status,
      currency,
      budget: num(budget),
      savedByMe: editing?.savedByMe ?? 0,
      savedByThem: editing?.savedByThem ?? 0,
      notes: notes.trim() || undefined,
      options: editing?.options ?? [],
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editing ? "Edit trip" : "New trip"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="trip-title">Name</Label>
            <Input
              id="trip-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Spring visit"
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Who&apos;s travelling</Label>
            <div className="flex gap-2">
              {travellers.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTraveller(t.value)}
                  className={cn(
                    "flex-1 rounded-2xl border px-2 py-2 text-sm transition-colors",
                    traveller === t.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trip-from">From</Label>
              <Input
                id="trip-from"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Chicago"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trip-to">To</Label>
              <Input
                id="trip-to"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Lisbon"
                className="rounded-2xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trip-start">Leaves</Label>
              <Input
                id="trip-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trip-end">Comes back</Label>
              <Input
                id="trip-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-2xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex gap-2">
              {TRIP_STATUS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatus(s.id)}
                  className={cn(
                    "flex-1 rounded-2xl border px-2 py-2 text-sm transition-colors",
                    status === s.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trip-budget">Budget</Label>
              <Input
                id="trip-budget"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="900"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trip-currency">Currency</Label>
              <select
                id="trip-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm"
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
            <Label htmlFor="trip-notes">Notes</Label>
            <Textarea
              id="trip-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Visa runs out in May, prefer non-red-eye flights…"
              className="rounded-2xl"
            />
          </div>
        </div>

        <DialogFooter className="flex-row gap-2">
          {editing ? (
            <Button
              variant="outline"
              size="icon"
              className="rounded-2xl"
              aria-label="Delete trip"
              onClick={() => {
                removeTrip(editing.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          <Button className="flex-1 rounded-2xl" onClick={save}>
            {editing ? "Save trip" : "Add trip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
