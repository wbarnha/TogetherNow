import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Bell, BellOff, Cake, Gift, HeartHandshake, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { MilestoneDialog } from "@/components/app/MilestoneDialog";
import { OwnerBadge } from "@/components/app/OwnerBadge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/app/store";
import { daysUntil, nextOccurrence, toISODate } from "@/lib/app/time";
import { buildMilestoneReminders } from "@/lib/app/milestone-reminders";
import { ensureNotificationPermission, syncReminders } from "@/lib/app/reminders";
import type { Milestone } from "@/lib/app/types";

export const Route = createFileRoute("/milestones")({
  head: () => ({
    meta: [
      { title: "Dates that matter — Together Now" },
      {
        name: "description",
        content:
          "Birthdays, anniversaries, and the day you met — with countdowns so nothing slips by.",
      },
      { property: "og:title", content: "Dates that matter — Together Now" },
      {
        property: "og:description",
        content: "Countdowns to every birthday, anniversary, and milestone.",
      },
    ],
  }),
  component: MilestonesPage,
});

const ICONS = {
  birthday: Cake,
  anniversary: HeartHandshake,
  "first-met": Sparkles,
  custom: Gift,
} as const;

export function milestoneNext(m: Milestone) {
  const next = m.recurring ? nextOccurrence(m.date) : new Date(`${m.date}T00:00:00`);
  const iso = toISODate(next);
  const days = daysUntil(iso);
  const years = m.recurring ? next.getFullYear() - Number(m.date.split("-")[0]) : null;
  return { next, iso, days, years };
}

function MilestonesPage() {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);

  const reminders = useMemo(() => buildMilestoneReminders(state), [state]);
  const nextByMilestone = useMemo(() => {
    const map = new Map<string, (typeof reminders)[number]>();
    for (const r of reminders) if (!map.has(r.milestoneId)) map.set(r.milestoneId, r);
    return map;
  }, [reminders]);

  const enableNotifications = async () => {
    const perm = await ensureNotificationPermission();
    if (perm === "granted") {
      await syncReminders(state);
      toast.success("Reminders are on", {
        description: `${reminders.length} nudge${reminders.length === 1 ? "" : "s"} scheduled on this device.`,
      });
    } else if (perm === "denied") {
      toast.error("Notifications are blocked", {
        description: "Enable them for Together Now in your phone's settings.",
      });
    } else {
      toast("Install the app to get notifications", {
        description: "Reminders fire on your phone; the browser preview can't send them.",
      });
    }
  };

  const sorted = useMemo(() => {
    return [...state.milestones]
      .map((m) => ({ m, ...milestoneNext(m) }))
      .filter((x) => x.m.recurring || x.days >= 0)
      .sort((a, b) => a.days - b.days);
  }, [state.milestones]);

  const past = useMemo(
    () =>
      state.milestones
        .map((m) => ({ m, ...milestoneNext(m) }))
        .filter((x) => !x.m.recurring && x.days < 0)
        .sort((a, b) => b.days - a.days),
    [state.milestones],
  );

  return (
    <AppShell
      title="Dates"
      subtitle="The ones you can't afford to forget."
      action={
        <Button
          size="icon"
          className="rounded-2xl"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-5" />
        </Button>
      }
    >
      {sorted.length === 0 && past.length === 0 ? (
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="w-full rounded-3xl border border-dashed border-border bg-card/50 p-8 text-sm text-muted-foreground"
        >
          Add their birthday, your anniversary, the day you met.
        </button>
      ) : null}

      {state.milestones.length > 0 ? (
        <section className="space-y-3 rounded-3xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Reminders</h2>
              <p className="text-xs text-muted-foreground">
                {reminders.length
                  ? `${reminders.length} nudge${reminders.length === 1 ? "" : "s"} queued at ${String(state.reminderHour ?? 9).padStart(2, "0")}:00 your time.`
                  : "Nothing queued — turn reminders on for a date below."}
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={enableNotifications}>
              <Bell className="size-4" /> Turn on
            </Button>
          </div>
          {reminders.slice(0, 3).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-2xl bg-muted/40 px-3 py-2 text-xs"
            >
              <span className="truncate pr-2">{r.body}</span>
              <span className="shrink-0 text-muted-foreground">
                {format(r.at, "d MMM, h a")}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <div className="space-y-3">
        {sorted.map(({ m, days, years, next }) => {
          const Icon = ICONS[m.kind];
          const nextReminder = nextByMilestone.get(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setEditing(m);
                setOpen(true);
              }}
              className="flex w-full items-center gap-4 rounded-3xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-sm"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.title}</p>
                <p className="text-xs text-muted-foreground">
                  {format(next, "EEE d MMM yyyy")}
                  {years && years > 0 ? ` · turns ${years}` : ""}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {m.remindersOff || !nextReminder ? (
                    <>
                      <BellOff className="size-3" /> No reminder
                    </>
                  ) : (
                    <>
                      <Bell className="size-3" /> Reminder {format(nextReminder.at, "d MMM, h a")}
                    </>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl leading-none font-semibold text-primary">
                  {days === 0 ? "Today" : days}
                </p>
                {days !== 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {days === 1 ? "day away" : "days away"}
                  </p>
                ) : null}
                <OwnerBadge
                  owner={m.owner}
                  meName={state.me.name}
                  themName={state.them.name}
                  className="mt-1"
                />
              </div>
            </button>
          );
        })}
      </div>

      {past.length > 0 ? (
        <section className="space-y-3 pt-2">
          <h2 className="px-1 font-display text-lg font-semibold text-muted-foreground">
            Already passed
          </h2>
          {past.map(({ m, next }) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setEditing(m);
                setOpen(true);
              }}
              className="flex w-full items-center justify-between rounded-3xl border border-border bg-card/60 p-4 text-left"
            >
              <span className="truncate text-sm">{m.title}</span>
              <span className="text-xs text-muted-foreground">{format(next, "d MMM yyyy")}</span>
            </button>
          ))}
        </section>
      ) : null}

      <MilestoneDialog open={open} onOpenChange={setOpen} editing={editing} />
    </AppShell>
  );
}
