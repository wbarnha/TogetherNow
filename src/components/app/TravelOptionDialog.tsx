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
import { newId, useStore } from "@/lib/app/store";
import { TRAVEL_MODES } from "@/lib/app/travel";
import type { TravelMode, TravelOption, Trip } from "@/lib/app/types";
import { cn } from "@/lib/utils";

const num = (v: string) => {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) ? n : undefined;
};

export function TravelOptionDialog({
  open,
  onOpenChange,
  trip,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trip: Trip;
  editing?: TravelOption | null;
}) {
  const { upsertTrip } = useStore();
  const [mode, setMode] = useState<TravelMode>("flight");
  const [carrier, setCarrier] = useState("");
  const [cost, setCost] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [detail, setDetail] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(editing?.mode ?? "flight");
    setCarrier(editing?.carrier ?? "");
    setCost(editing?.cost != null ? String(editing.cost) : "");
    setHours(editing?.durationMinutes ? String(Math.floor(editing.durationMinutes / 60)) : "");
    setMinutes(editing?.durationMinutes ? String(editing.durationMinutes % 60) : "");
    setDetail(editing?.detail ?? "");
    setUrl(editing?.url ?? "");
  }, [open, editing]);

  const save = () => {
    const duration = (num(hours) ?? 0) * 60 + (num(minutes) ?? 0);
    const option: TravelOption = {
      id: editing?.id ?? newId(),
      mode,
      carrier: carrier.trim() || undefined,
      cost: num(cost),
      durationMinutes: duration > 0 ? duration : undefined,
      detail: detail.trim() || undefined,
      url: url.trim() || undefined,
      chosen: editing?.chosen ?? false,
      updatedAt: Date.now(),
    };
    const exists = trip.options.some((o) => o.id === option.id);
    upsertTrip({
      ...trip,
      options: exists
        ? trip.options.map((o) => (o.id === option.id ? option : o))
        : [...trip.options, option],
    });
    onOpenChange(false);
  };

  const remove = () => {
    if (!editing) return;
    upsertTrip({ ...trip, options: trip.options.filter((o) => o.id !== editing.id) });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editing ? "Edit option" : "Add a way to travel"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>How</Label>
            <div className="flex flex-wrap gap-2">
              {TRAVEL_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "rounded-2xl border px-3 py-1.5 text-sm transition-colors",
                    mode === m.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opt-carrier">Airline / operator</Label>
            <Input
              id="opt-carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="TAP Air Portugal"
              className="rounded-2xl"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="opt-cost">Cost ({trip.currency})</Label>
              <Input
                id="opt-cost"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="640"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opt-hours">Hours</Label>
              <Input
                id="opt-hours"
                inputMode="numeric"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="9"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opt-minutes">Mins</Label>
              <Input
                id="opt-minutes"
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="30"
                className="rounded-2xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opt-detail">Details</Label>
            <Input
              id="opt-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="1 stop in Newark, lands 8am"
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opt-url">Link</Label>
            <Input
              id="opt-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
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
              aria-label="Delete option"
              onClick={remove}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          <Button className="flex-1 rounded-2xl" onClick={save}>
            {editing ? "Save option" : "Add option"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
