import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Share2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { EventDialog } from "@/components/app/EventDialog";
import { ExportIcsDialog } from "@/components/app/ExportIcsDialog";
import { ImportIcsDialog } from "@/components/app/ImportIcsDialog";
import { OwnerBadge } from "@/components/app/OwnerBadge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/app/store";
import { convertWallTime, toISODate, zoneLabel } from "@/lib/app/time";
import type { PlanEvent } from "@/lib/app/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Shared plans — Together Now" },
      {
        name: "description",
        content:
          "A shared calendar for long-distance couples that shows every plan in both of your time zones.",
      },
      { property: "og:title", content: "Shared plans — Together Now" },
      {
        property: "og:description",
        content: "Every plan, shown in both of your local times.",
      },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { state } = useStore();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => toISODate(new Date()));
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editing, setEditing] = useState<PlanEvent | null>(null);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      }),
    [month],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, PlanEvent[]>();
    for (const e of state.events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    return map;
  }, [state.events]);

  const dayEvents = byDate.get(selected) ?? [];

  return (
    <AppShell
      title="Plans"
      subtitle={`${zoneLabel(state.me.timeZone)} · ${zoneLabel(state.them.timeZone)}`}
      action={
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            className="rounded-2xl"
            aria-label="Export calendar file"
            onClick={() => setExportOpen(true)}
          >
            <Share2 className="size-5" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="rounded-2xl"
            aria-label="Import calendar file"
            onClick={() => setImportOpen(true)}
          >
            <CalendarPlus className="size-5" />
          </Button>
          <Button
            size="icon"
            className="rounded-2xl"
            aria-label="New plan"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-5" />
          </Button>
        </div>
      }
    >
      <section className="rounded-3xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="font-display text-lg font-semibold">{format(month, "MMMM yyyy")}</p>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={`${d}${i}`} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const iso = toISODate(day);
            const list = byDate.get(iso) ?? [];
            const isSelected = iso === selected;
            const today = iso === toISODate(new Date());
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(iso)}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl text-sm transition-colors",
                  !isSameMonth(day, month) && "text-muted-foreground/40",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : today
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                )}
              >
                {day.getDate()}
                <span className="flex h-1.5 items-center gap-0.5">
                  {list.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className={cn(
                        "size-1.5 rounded-full",
                        isSelected
                          ? "bg-primary-foreground/80"
                          : e.owner === "me"
                            ? "bg-mine"
                            : e.owner === "them"
                              ? "bg-theirs"
                              : "bg-ours",
                      )}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="px-1 font-display text-xl font-semibold">
          {format(parseISO(selected), "EEEE d MMMM")}
        </h2>
        {dayEvents.length === 0 ? (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="w-full rounded-3xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground"
          >
            Nothing planned. Tap to add something to look forward to.
          </button>
        ) : (
          dayEvents.map((e) => <EventCard key={e.id} event={e} onEdit={() => { setEditing(e); setOpen(true); }} />)
        )}
      </section>

      <EventDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        defaultDate={selected}
      />
      <ImportIcsDialog open={importOpen} onOpenChange={setImportOpen} />
      <ExportIcsDialog open={exportOpen} onOpenChange={setExportOpen} />
    </AppShell>
  );
}

export function EventCard({ event, onEdit }: { event: PlanEvent; onEdit: () => void }) {
  const { state } = useStore();
  const fromZone = event.anchor === "me" ? state.me.timeZone : state.them.timeZone;
  const toZone = event.anchor === "me" ? state.them.timeZone : state.me.timeZone;
  const other = event.time ? convertWallTime(event.date, event.time, fromZone, toZone) : null;
  const mineFirst = event.anchor === "me";

  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full rounded-3xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{event.title}</p>
          {event.notes ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{event.notes}</p>
          ) : null}
        </div>
        <OwnerBadge owner={event.owner} meName={state.me.name} themName={state.them.name} />
      </div>

      {event.time ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <TimeChip
            label={mineFirst ? state.me.name || "You" : state.them.name || "Them"}
            zone={zoneLabel(fromZone)}
            time={to12h(event.time)}
            tone={mineFirst ? "mine" : "theirs"}
          />
          {other ? (
            <TimeChip
              label={mineFirst ? state.them.name || "Them" : state.me.name || "You"}
              zone={zoneLabel(toZone)}
              time={other.time}
              tone={mineFirst ? "theirs" : "mine"}
            />
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

function TimeChip({
  label,
  zone,
  time,
  tone,
}: {
  label: string;
  zone: string;
  time: string;
  tone: "mine" | "theirs";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl px-3 py-2",
        tone === "mine" ? "bg-mine-soft text-mine" : "bg-theirs-soft text-theirs",
      )}
    >
      <p className="text-[11px] opacity-80">
        {label} · {zone}
      </p>
      <p className="text-sm font-semibold">{time}</p>
    </div>
  );
}

function to12h(t: string) {
  const [h, m] = t.split(":").map(Number);
  const hour = h ?? 0;
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}