import { useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarPlus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseIcs, toPlanEvent, type ParsedIcsEvent } from "@/lib/app/ics";
import { icsEventId } from "@/lib/app/ics";
import { useStore } from "@/lib/app/store";
import { zoneLabel } from "@/lib/app/time";
import type { Owner } from "@/lib/app/types";
import { cn } from "@/lib/utils";

const OWNERS: { value: Owner; label: (me: string, them: string) => string }[] = [
  { value: "us", label: () => "Together" },
  { value: "me", label: (me) => me || "Me" },
  { value: "them", label: (_me, them) => them || "Them" },
];

export function ImportIcsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { state, setState } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<"me" | "them">("me");
  const [owner, setOwner] = useState<Owner>("us");
  const [pasted, setPasted] = useState("");

  const zone = anchor === "me" ? state.me.timeZone : state.them.timeZone;

  // Re-read whenever the anchor zone changes so displayed times stay truthful.
  const result = useMemo(() => {
    if (!raw) return null;
    let events: ParsedIcsEvent[] = [];
    try {
      events = parseIcs(raw, zone);
    } catch {
      events = [];
    }
    // Dedupe by stable id within the file itself (repeating series exports).
    const seen = new Set<string>();
    const unique = events.filter((e) => {
      const id = icsEventId(e);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return { events: unique, skipped: events.length - unique.length };
  }, [raw, zone]);

  const parsed = result?.events ?? null;
  const skipped = result?.skipped ?? 0;

  const load = (text: string, label: string) => {
    let count = 0;
    try {
      count = parseIcs(text, zone).length;
    } catch {
      count = 0;
    }
    if (count === 0) {
      toast.error("No events found in that calendar file");
      return;
    }
    setRaw(text);
    setSelected(new Set(parseIcs(text, zone).map(icsEventId)));
    toast.success(`Found ${count} event${count === 1 ? "" : "s"} in ${label}`);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    load(text, file.name);
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(() => {
      setRaw(null);
      setPasted("");
      setSelected(new Set());
    }, 200);
  };

  const chosen = useMemo(
    () => (parsed ?? []).filter((e) => selected.has(icsEventId(e))),
    [parsed, selected],
  );

  const doImport = () => {
    if (chosen.length === 0) return;
    const incoming = chosen.map((e) => toPlanEvent(e, { anchor, owner }));
    setState((prev) => {
      const map = new Map(prev.events.map((e) => [e.id, e]));
      for (const e of incoming) map.set(e.id, e);
      return { ...prev, events: [...map.values()] };
    });
    toast.success(`Added ${incoming.length} event${incoming.length === 1 ? "" : "s"}`);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Import a calendar</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export an <span className="font-medium">.ics</span> file from Apple Calendar,
              Google Calendar or Outlook, then pick it here. Everything stays on this device.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".ics,text/calendar"
              className="hidden"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button className="w-full" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Choose .ics file
            </Button>

            <div className="space-y-2">
              <Label htmlFor="ics-paste">Or paste the calendar text</Label>
              <Textarea
                id="ics-paste"
                rows={4}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="BEGIN:VCALENDAR…"
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={!pasted.trim()}
                onClick={() => load(pasted, "your paste")}
              >
                <CalendarPlus className="size-4" /> Read pasted calendar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>These times are on whose clock?</Label>
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
                    <span className="block text-xs opacity-80">{zoneLabel(zone)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Who are these for?</Label>
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

            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium">
                {selected.size} of {parsed.length} selected
              </p>
              <button
                type="button"
                className="text-xs text-primary underline-offset-2 hover:underline"
                onClick={() =>
                  setSelected(
                    selected.size === parsed.length
                      ? new Set()
                      : new Set(parsed.map(icsEventId)),
                  )
                }
              >
                {selected.size === parsed.length ? "Clear all" : "Select all"}
              </button>
            </div>

            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {parsed.map((e) => {
                const id = icsEventId(e);
                const checked = selected.has(id);
                return (
                  <li key={id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          })
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{e.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {format(parseISO(e.date), "EEE d MMM yyyy")}
                          {e.time ? ` · ${e.time}` : " · all day"}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {skipped > 0 ? (
              <p className="text-xs text-muted-foreground">
                {skipped} repeated entr{skipped === 1 ? "y was" : "ies were"} merged.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {parsed ? (
            <Button onClick={doImport} disabled={chosen.length === 0}>
              Add {chosen.length || ""} to calendar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
