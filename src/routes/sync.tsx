import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  CheckCircle2,
  ClipboardPaste,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { ImportIcsDialog } from "@/components/app/ImportIcsDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/app/store";
import { zoneLabel } from "@/lib/app/time";
import { SHARING_ITEMS } from "@/lib/app/partner";

export const Route = createFileRoute("/sync")({
  head: () => ({
    meta: [
      { title: "Calendar sync — Together Now" },
      {
        name: "description",
        content:
          "See which calendars are linked on this phone and when you and your partner last exchanged a share code.",
      },
      { property: "og:title", content: "Calendar sync — Together Now" },
      {
        property: "og:description",
        content: "Linked calendars and the latest sync status for both of you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SyncPage,
});

const ago = (t: number | null | undefined) =>
  t ? `${formatDistanceToNow(new Date(t))} ago` : "never";

/** Anything older than a week is worth nudging about. */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

function SyncPage() {
  const { state, setState, hydrated } = useStore();
  const [importOpen, setImportOpen] = useState(false);
  const sources = state.calendarSources;
  const connected = state.pairedAt != null;
  const stale =
    connected && (!state.lastReceivedAt || Date.now() - state.lastReceivedAt > STALE_MS);
  const meName = state.me.name || "You";
  const themName = state.them.name || "Your partner";
  const on = SHARING_ITEMS.filter((i) => state.sharing[i.key]);

  const removeSource = (id: string) => {
    setState((p) => ({
      ...p,
      calendarSources: p.calendarSources.filter((s) => s.id !== id),
    }));
    toast.success("Calendar unlinked", {
      description: "Events already imported stay on your calendar.",
    });
  };

  return (
    <AppShell title="Sync" subtitle="What's linked, and how fresh both sides are.">
      <section className="grid gap-3 sm:grid-cols-2">
        <StatusCard
          tone="mine"
          icon={<ArrowUpFromLine className="size-4" />}
          who={meName}
          headline={state.lastSharedAt ? "Sent your code" : "Nothing sent yet"}
          detail={
            state.lastSharedAt
              ? `Last handed over ${ago(state.lastSharedAt)}`
              : "Share your code so they get your plans."
          }
          zone={state.me.timeZone}
        />
        <StatusCard
          tone="theirs"
          icon={<ArrowDownToLine className="size-4" />}
          who={themName}
          headline={state.lastReceivedAt ? "Merged their code" : "Nothing received yet"}
          detail={
            state.lastReceivedAt
              ? `Last merged ${ago(state.lastReceivedAt)}`
              : "Paste their code to pull their plans in."
          }
          zone={state.them.timeZone}
        />
      </section>

      <section className="space-y-3 rounded-3xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span
            className={stale || !connected ? "mt-0.5 text-muted-foreground" : "mt-0.5 text-primary"}
          >
            {stale || !connected ? (
              <TriangleAlert className="size-5" />
            ) : (
              <CheckCircle2 className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold">
              {!connected
                ? "Not connected yet"
                : stale
                  ? "Time for a fresh swap"
                  : "You two are in sync"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {!connected
                ? "Send an invite to start swapping plans."
                : stale
                  ? `Codes are a snapshot, so swap again to pick up anything ${themName} added.`
                  : `Both sides exchanged a code recently. Sharing ${on.length} of ${SHARING_ITEMS.length} categories.`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SHARING_ITEMS.map((i) => (
            <Badge key={i.key} variant={state.sharing[i.key] ? "secondary" : "outline"}>
              {i.label}
              {state.sharing[i.key] ? "" : " off"}
            </Badge>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild>
            <Link to="/pair">
              <ClipboardPaste className="size-4" /> Swap codes now
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/partner">Change what's shared</Link>
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Linked calendars</h2>
            <p className="text-xs text-muted-foreground">
              Imported .ics files on this phone. Re-import to refresh them.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Plus className="size-4" /> Link
          </Button>
        </div>

        {!hydrated ? null : sources.length === 0 ? (
          <p className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
            No calendars linked yet. Export an .ics from Apple, Google or Outlook Calendar and
            import it here.
          </p>
        ) : (
          <ul className="space-y-2">
            {sources
              .slice()
              .sort((a, b) => b.lastImportAt - a.lastImportAt)
              .map((s) => (
                <li
                  key={s.id}
                  className="flex items-start gap-3 rounded-2xl border border-border p-3"
                >
                  <span className="mt-0.5 text-muted-foreground">
                    <CalendarDays className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.eventCount} event{s.eventCount === 1 ? "" : "s"} ·{" "}
                      {s.owner === "us" ? "Together" : s.owner === "me" ? meName : themName} ·{" "}
                      {s.anchor === "me" ? meName : themName}&apos;s clock
                    </p>
                    <p className="text-xs text-muted-foreground">Imported {ago(s.lastImportAt)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Unlink ${s.label}`}
                    onClick={() => removeSource(s.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <ImportIcsDialog open={importOpen} onOpenChange={setImportOpen} />
    </AppShell>
  );
}

function StatusCard({
  tone,
  icon,
  who,
  headline,
  detail,
  zone,
}: {
  tone: "mine" | "theirs";
  icon: React.ReactNode;
  who: string;
  headline: string;
  detail: string;
  zone: string;
}) {
  return (
    <div
      className={
        tone === "mine"
          ? "space-y-1 rounded-3xl border border-mine/30 bg-mine-soft/60 p-4"
          : "space-y-1 rounded-3xl border border-theirs/30 bg-theirs-soft/60 p-4"
      }
    >
      <div
        className={
          tone === "mine"
            ? "flex items-center gap-2 text-sm font-medium text-mine"
            : "flex items-center gap-2 text-sm font-medium text-theirs"
        }
      >
        {icon}
        {who}
      </div>
      <p className="font-display text-lg font-semibold">{headline}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
      <p className="text-xs text-muted-foreground">{zoneLabel(zone)}</p>
    </div>
  );
}
