import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Smartphone, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { MoodWidget } from "@/components/app/MoodWidget";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/app/store";
import { MOODS, averageScore, moodOption, moodsFor, todayIn } from "@/lib/app/mood";
import type { MoodScore } from "@/lib/app/types";
import { cn } from "@/lib/utils";

type MoodSearch = { mood?: number };

export const Route = createFileRoute("/mood")({
  validateSearch: (search: Record<string, unknown>): MoodSearch => {
    const n = Number(search["mood"] ?? search["score"]);
    return n >= 1 && n <= 5 ? { mood: Math.round(n) } : {};
  },
  head: () => ({
    meta: [
      { title: "Mood check-ins — Together Now" },
      {
        name: "description",
        content:
          "Log how your day is going and see your partner's latest mood, with home-screen widgets for iOS and Android.",
      },
      { property: "og:title", content: "Mood check-ins — Together Now" },
      {
        property: "og:description",
        content: "Daily mood check-ins for long-distance couples, right on your home screen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MoodPage,
});

function MoodPage() {
  const { state, hydrated, setMood, clearMood } = useStore();
  const search = useSearch({ from: "/mood" });

  // A tap on the home-screen widget deep-links here with ?mood=4
  useEffect(() => {
    if (!hydrated) return;
    const score = search.mood;
    if (score && score >= 1 && score <= 5) {
      setMood(score as MoodScore);
      window.history.replaceState(null, "", "/mood");
    }
  }, [hydrated, search.mood, setMood]);

  const mine = useMemo(() => moodsFor(state, "me"), [state]);
  const theirs = useMemo(() => moodsFor(state, "them"), [state]);
  const avg = averageScore(mine.slice(0, 30));
  const today = todayIn(state.me.timeZone);

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  return (
    <AppShell
      title="Mood"
      subtitle="A daily check-in you can both see"
    >
      <MoodWidget />

      <section className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Smartphone className="size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Add the <span className="font-medium text-foreground">Together Now</span> widget to your
            home screen to check in without opening the app — see{" "}
            <span className="font-medium text-foreground">MOBILE.md</span> for the iOS and Android
            build steps.
          </p>
        </div>
      </section>

      {avg !== null ? (
        <p className="px-1 text-sm text-muted-foreground">
          Your last 30 check-ins average {avg} / 5 ({moodOption(Math.round(avg) as MoodScore)?.label}
          ).
        </p>
      ) : null}

      <MoodList
        title={`${state.me.name || "You"} — history`}
        tone="mine"
        entries={mine}
        onDelete={(date) => clearMood(date)}
        today={today}
      />
      <MoodList
        title={`${state.them.name || "Them"} — history`}
        tone="theirs"
        entries={theirs}
      />
    </AppShell>
  );
}

function MoodList({
  title,
  tone,
  entries,
  onDelete,
  today,
}: {
  title: string;
  tone: "mine" | "theirs";
  entries: ReturnType<typeof moodsFor>;
  onDelete?: (date: string) => void;
  today?: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 font-display text-lg font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border bg-card/50 p-5 text-sm text-muted-foreground">
          {tone === "mine"
            ? "No check-ins yet — tap a face above."
            : "Nothing shared yet. Import their share code to see how they've been."}
        </p>
      ) : (
        entries.slice(0, 30).map((e) => (
          <div
            key={e.id}
            className={cn(
              "flex items-center gap-3 rounded-3xl p-3",
              tone === "mine" ? "bg-mine-soft text-mine" : "bg-theirs-soft text-theirs",
            )}
          >
            <span className="text-2xl leading-none">{moodOption(e.score)?.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {moodOption(e.score)?.label}
                {today === e.date ? " · today" : ""}
              </p>
              <p className="truncate text-xs opacity-80">
                {format(parseISO(e.date), "EEE d MMM")}
                {e.note ? ` · ${e.note}` : ""}
              </p>
            </div>
            {onDelete ? (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-2xl"
                aria-label="Delete check-in"
                onClick={() => onDelete(e.date)}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        ))
      )}
    </section>
  );
}

export { MOODS };