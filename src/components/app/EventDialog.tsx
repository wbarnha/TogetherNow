import { useEffect, useState } from "react";
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
import { Trash2 } from "lucide-react";
import { newId, useStore } from "@/lib/app/store";
import { convertWallTime, toISODate, zoneLabel } from "@/lib/app/time";
import type { Owner, PlanEvent } from "@/lib/app/types";
import { cn } from "@/lib/utils";

const OWNERS: { value: Owner; label: (me: string, them: string) => string }[] = [
  { value: "us", label: () => "Together" },
  { value: "me", label: (me) => me || "Me" },
  { value: "them", label: (_me, them) => them || "Them" },
];

export function EventDialog({
  open,
  onOpenChange,
  editing,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: PlanEvent | null;
  defaultDate?: string;
}) {
  const { state, upsertEvent, removeEvent } = useStore();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate ?? toISODate(new Date()));
  const [time, setTime] = useState("19:00");
  const [anchor, setAnchor] = useState<"me" | "them">("me");
  const [owner, setOwner] = useState<Owner>("us");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setDate(editing?.date ?? defaultDate ?? toISODate(new Date()));
    setTime(editing?.time ?? "19:00");
    setAnchor(editing?.anchor ?? "me");
    setOwner(editing?.owner ?? "us");
    setNotes(editing?.notes ?? "");
  }, [open, editing, defaultDate]);

  const fromZone = anchor === "me" ? state.me.timeZone : state.them.timeZone;
  const toZone = anchor === "me" ? state.them.timeZone : state.me.timeZone;
  const otherName =
    anchor === "me" ? state.them.name || "them" : state.me.name || "you";
  const preview = time ? convertWallTime(date, time, fromZone, toZone) : null;

  const save = () => {
    if (!title.trim()) return;
    upsertEvent({
      id: editing?.id ?? newId(),
      title: title.trim(),
      date,
      time: time || undefined,
      anchor,
      owner,
      notes: notes.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit plan" : "New plan"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ev-title">What is it?</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Movie night, flight home, video call…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ev-date">Date</Label>
              <Input
                id="ev-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-time">Time</Label>
              <Input
                id="ev-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Whose clock is that time on?</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["me", "them"] as const).map((who) => (
                <button
                  key={who}
                  type="button"
                  onClick={() => setAnchor(who)}
                  className={cn(
                    "rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors",
                    anchor === who
                      ? who === "me"
                        ? "border-mine/40 bg-mine-soft text-mine"
                        : "border-theirs/40 bg-theirs-soft text-theirs"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  <span className="block font-medium">
                    {who === "me" ? state.me.name || "My" : state.them.name || "Their"} time
                  </span>
                  <span className="block text-xs opacity-80">
                    {zoneLabel(who === "me" ? state.me.timeZone : state.them.timeZone)}
                  </span>
                </button>
              ))}
            </div>
            {preview ? (
              <p className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                That&apos;s {preview.time} for {otherName} on {preview.day}.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Who is it for?</Label>
            <div className="grid grid-cols-3 gap-2">
              {OWNERS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOwner(o.value)}
                  className={cn(
                    "truncate rounded-2xl border px-2 py-2 text-sm transition-colors",
                    owner === o.value
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {o.label(state.me.name, state.them.name)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-notes">Notes</Label>
            <Textarea
              id="ev-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                removeEvent(editing.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={!title.trim()}>
            {editing ? "Save changes" : "Add plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}