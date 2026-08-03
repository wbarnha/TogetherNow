import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { CalendarPlus, MessageCircle, Moon, QrCode, Sun } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Onboarding } from "@/components/app/Onboarding";
import { EventDialog } from "@/components/app/EventDialog";
import { MoodWidget } from "@/components/app/MoodWidget";
import { EventCard } from "./calendar";
import { milestoneNext } from "./milestones";
import { Button } from "@/components/ui/button";
import { useNow, useStore } from "@/lib/app/store";
import { callWindow, clockIn, dayIn, gapLabel, hourGap, toISODate, zoneLabel } from "@/lib/app/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Together Now — long-distance couple app" },
      {
        name: "description",
        content:
          "Two clocks, one shared calendar, and countdowns to the dates that matter — built for couples in different time zones.",
      },
      { property: "og:title", content: "Together Now" },
      {
        property: "og:description",
        content: "Two clocks, one shared calendar, and countdowns to the dates that matter.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { state, hydrated } = useStore();
  const now = useNow(15000);
  const [open, setOpen] = useState(false);

  const upcoming = useMemo(() => {
    const today = toISODate(new Date());
    return [...state.events]
      .filter((e) => e.date >= today)
      .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))
      .slice(0, 3);
  }, [state.events]);

  const nextMilestone = useMemo(() => {
    const list = state.milestones
      .map((m) => ({ m, ...milestoneNext(m) }))
      .filter((x) => x.days >= 0)
      .sort((a, b) => a.days - b.days);
    return list[0] ?? null;
  }, [state.milestones]);

  const daysTogether = state.startDate
    ? differenceInCalendarDays(new Date(), parseISO(state.startDate))
    : null;

  if (!hydrated) return <div className="min-h-screen bg-background" />;
  if (!state.onboarded) return <Onboarding />;

  const window = now ? callWindow(state.me.timeZone, state.them.timeZone, now) : null;
  const gap = now ? hourGap(state.me.timeZone, state.them.timeZone, now) : 0;

  return (
    <AppShell
      title={`${state.me.name} & ${state.them.name}`}
      subtitle={
        daysTogether !== null
          ? `Day ${daysTogether.toLocaleString()} together`
          : "Two time zones, one plan"
      }
      action={
        <Button asChild variant="ghost" size="icon" className="rounded-2xl">
          <Link to="/pair" aria-label="Share code">
            <QrCode className="size-5" />
          </Link>
        </Button>
      }
    >
      <section className="grid grid-cols-2 gap-3">
        <ClockCard
          tone="mine"
          name={state.me.name || "You"}
          zone={state.me.timeZone}
          now={now}
        />
        <ClockCard
          tone="theirs"
          name={state.them.name || "Them"}
          zone={state.them.timeZone}
          now={now}
        />
      </section>

      {window ? (
        <div
          className={cn(
            "flex items-center gap-3 rounded-3xl border p-4",
            window.good
              ? "border-ours/30 bg-ours-soft text-ours-foreground"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          {window.good ? <Sun className="size-5 shrink-0" /> : <Moon className="size-5 shrink-0" />}
          <p className="text-sm">
            {window.good
              ? `Good moment to call — you're both awake (${state.them.name || "them"}: ${gapLabel(gap)}).`
              : `Probably a bad moment to call (${state.them.name || "them"}: ${gapLabel(gap)}).`}
          </p>
        </div>
      ) : null}

      <MoodWidget compact />

      {nextMilestone ? (
        <Link
          to="/milestones"
          className="block rounded-3xl bg-primary p-5 text-primary-foreground"
        >
          <p className="text-xs opacity-80">Next big date</p>
          <p className="mt-1 font-display text-2xl font-semibold">{nextMilestone.m.title}</p>
          <p className="mt-1 text-sm opacity-90">
            {nextMilestone.days === 0
              ? "It's today"
              : `${nextMilestone.days} ${nextMilestone.days === 1 ? "day" : "days"} away · ${format(nextMilestone.next, "EEE d MMM")}`}
          </p>
        </Link>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-display text-xl font-semibold">Coming up</h2>
          <Link to="/calendar" className="text-sm font-medium text-primary">
            All plans
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-3xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground"
          >
            Nothing on the calendar yet. Plan your next call or visit.
          </button>
        ) : (
          upcoming.map((e) => (
            <div key={e.id} className="space-y-1">
              <p className="px-1 text-xs text-muted-foreground">
                {format(parseISO(e.date), "EEE d MMM")}
              </p>
              <EventCard event={e} onEdit={() => setOpen(true)} />
            </div>
          ))
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 pb-2">
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 rounded-3xl p-4 text-left"
          onClick={() => setOpen(true)}
        >
          <CalendarPlus className="size-5 text-primary" />
          <span className="font-medium">Add a plan</span>
        </Button>
        <Button asChild variant="outline" className="h-auto flex-col items-start gap-1 rounded-3xl p-4 text-left">
          <Link to="/messages">
            <MessageCircle className="size-5 text-primary" />
            <span className="font-medium">Reach them</span>
          </Link>
        </Button>
      </section>

      <EventDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}

function ClockCard({
  tone,
  name,
  zone,
  now,
}: {
  tone: "mine" | "theirs";
  name: string;
  zone: string;
  now: Date | null;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl p-4",
        tone === "mine" ? "bg-mine-soft text-mine" : "bg-theirs-soft text-theirs",
      )}
    >
      <p className="truncate text-xs font-medium opacity-80">{name}</p>
      <p className="mt-2 font-display text-3xl leading-none font-semibold tabular-nums">
        {now ? clockIn(zone, now) : "—"}
      </p>
      <p className="mt-2 text-[11px] opacity-80">
        {now ? dayIn(zone, now) : ""} · {zoneLabel(zone)}
      </p>
    </div>
  );
}
