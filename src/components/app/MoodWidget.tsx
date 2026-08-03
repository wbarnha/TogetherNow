import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/app/store";
import {
  MOODS,
  moodFor,
  moodOption,
  recentDates,
  todayIn,
  checkInStreak,
  moodsFor,
} from "@/lib/app/mood";
import { cn } from "@/lib/utils";
import type { MoodScore } from "@/lib/app/types";

/**
 * The in-app twin of the home-screen widget: same layout the native
 * iOS/Android widgets render, but tappable for a check-in.
 */
export function MoodWidget({ compact = false }: { compact?: boolean }) {
  const { state, setMood } = useStore();
  const today = todayIn(state.me.timeZone);
  const mine = moodFor(state, "me", today);
  const theirs = moodsFor(state, "them")[0];
  const [note, setNote] = useState(mine?.note ?? "");
  const [noteOpen, setNoteOpen] = useState(false);

  useEffect(() => {
    setNote(mine?.note ?? "");
  }, [mine?.id, mine?.note]);

  const days = recentDates(state.me.timeZone, 7);
  const streak = checkInStreak(state, state.me.timeZone);

  const pick = (score: MoodScore) => {
    setMood(score, note);
    setNoteOpen(true);
    toast.success(`Logged ${moodOption(score)?.label.toLowerCase()} for today`, {
      description: "Send a share code to let them see it.",
    });
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="font-display text-xl font-semibold">How are you today?</h2>
        {streak > 1 ? (
          <span className="text-xs text-muted-foreground">{streak}-day streak</span>
        ) : null}
      </div>

      <div className="mt-3 flex items-stretch gap-1.5">
        {MOODS.map((m) => {
          const active = mine?.score === m.score;
          return (
            <button
              key={m.score}
              type="button"
              onClick={() => pick(m.score)}
              aria-label={m.label}
              aria-pressed={active}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-2xl border py-2.5 transition-colors",
                active
                  ? "border-mine bg-mine-soft text-mine"
                  : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="text-2xl leading-none">{m.emoji}</span>
              <span className="text-[10px] font-medium">{m.label}</span>
            </button>
          );
        })}
      </div>

      {(noteOpen || mine?.note) && mine ? (
        <div className="mt-3 flex gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => setMood(mine.score, note)}
            placeholder="Add a line about your day (optional)"
            className="rounded-2xl"
          />
        </div>
      ) : null}

      {!compact ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-mine-soft p-3 text-mine">
            <p className="truncate text-[11px] font-medium opacity-80">{state.me.name || "You"}</p>
            <p className="mt-1 text-2xl leading-none">{moodOption(mine?.score)?.emoji ?? "➕"}</p>
            <p className="mt-1 text-xs opacity-90">
              {mine ? moodOption(mine.score)?.label : "No check-in yet"}
            </p>
          </div>
          <div className="rounded-2xl bg-theirs-soft p-3 text-theirs">
            <p className="truncate text-[11px] font-medium opacity-80">
              {state.them.name || "Them"}
            </p>
            <p className="mt-1 text-2xl leading-none">{moodOption(theirs?.score)?.emoji ?? "…"}</p>
            <p className="mt-1 truncate text-xs opacity-90">
              {theirs
                ? `${moodOption(theirs.score)?.label} · ${format(parseISO(theirs.date), "d MMM")}`
                : "No check-in yet"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5">
          {days.map((d) => {
            const entry = moodFor(state, "me", d);
            return (
              <span
                key={d}
                title={`${format(parseISO(d), "EEE d MMM")}${entry ? ` · ${moodOption(entry.score)?.label}` : ""}`}
                className={cn(
                  "flex size-7 items-center justify-center rounded-xl text-sm",
                  entry ? "bg-muted" : "border border-dashed border-border",
                )}
              >
                {entry ? moodOption(entry.score)?.emoji : ""}
              </span>
            );
          })}
        </div>
        <Button asChild variant="ghost" size="sm" className="rounded-2xl">
          <Link to="/mood">History</Link>
        </Button>
      </div>
    </section>
  );
}
