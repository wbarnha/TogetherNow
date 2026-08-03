import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Gamepad2, Plus, Sparkles, Trash2, Tv, Upload } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ImportWatchDialog } from "@/components/app/ImportWatchDialog";
import { Button } from "@/components/ui/button";
import { useStore, newId } from "@/lib/app/store";
import {
  WATCH_SERVICES,
  formatMinutes,
  minutesOf,
  serviceMeta,
  serviceTotals,
  sharedTitles,
  soloTitles,
  weeklyMinutes,
  type WatchService,
} from "@/lib/app/watch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/watch")({
  head: () => ({
    meta: [
      { title: "Watching together — Together Now" },
      {
        name: "description",
        content:
          "One dashboard for your Netflix, Hulu, Steam and Crunchyroll activity next to your partner's, so you always know what to start together.",
      },
      { property: "og:title", content: "Watching together — Together Now" },
      {
        property: "og:description",
        content: "See what you two are watching and playing, side by side.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WatchPage,
});

const ALL = "all" as const;

function WatchPage() {
  const { state, upsertWatchEntry, removeWatchEntry, removeWatchImport } = useStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<WatchService | typeof ALL>(ALL);

  const meName = state.me.name || "You";
  const themName = state.them.name || "Them";

  const entries = state.watchEntries ?? [];
  const visible = useMemo(
    () => entries.filter((e) => filter === ALL || e.service === filter).slice().reverse(),
    [entries, filter],
  );

  const totals = useMemo(() => serviceTotals(entries), [entries]);
  const shared = useMemo(() => sharedTitles(entries).slice(0, 6), [entries]);
  const theirPicks = useMemo(() => soloTitles(entries, "them").slice(0, 5), [entries]);
  const weeks = useMemo(() => weeklyMinutes(entries, 8), [entries]);
  const peak = Math.max(1, ...weeks.map((w) => Math.max(w.mine, w.theirs)));

  const myMinutes = entries.filter((e) => e.owner === "me").reduce((n, e) => n + minutesOf(e), 0);
  const theirMinutes = entries
    .filter((e) => e.owner === "them")
    .reduce((n, e) => n + minutesOf(e), 0);

  const quickAdd = (service: WatchService) => {
    const title = window.prompt(`What did you just watch or play on ${serviceMeta(service).name}?`);
    if (!title?.trim()) return;
    upsertWatchEntry({
      id: newId(),
      service,
      title: title.trim(),
      owner: "me",
      at: Date.now(),
    });
  };

  return (
    <AppShell
      title="Watching"
      subtitle={`${meName} and ${themName}, side by side`}
      action={
        <Button size="sm" className="rounded-2xl" onClick={() => setOpen(true)}>
          <Upload className="size-4" />
          Import
        </Button>
      }
    >
      {entries.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border p-6 text-center">
          <Tv className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-display text-xl">Nothing here yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Import your Netflix, Hulu, Steam or Crunchyroll export and it lands here beside{" "}
            {themName}'s. No accounts linked, nothing leaves your phone.
          </p>
          <Button className="mt-4 rounded-2xl" onClick={() => setOpen(true)}>
            <Upload className="size-4" />
            Import a history file
          </Button>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{meName}</p>
              <p className="font-display text-2xl">{formatMinutes(myMinutes)}</p>
              <p className="text-xs text-muted-foreground">
                {entries.filter((e) => e.owner === "me").length} items
              </p>
            </div>
            <div className="rounded-3xl bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{themName}</p>
              <p className="font-display text-2xl">{formatMinutes(theirMinutes)}</p>
              <p className="text-xs text-muted-foreground">
                {entries.filter((e) => e.owner === "them").length} items
              </p>
            </div>
          </section>

          <section className="rounded-3xl bg-card p-4 shadow-sm">
            <h2 className="font-display text-lg">By service</h2>
            <ul className="mt-3 space-y-3">
              {totals.map((t) => {
                const max = Math.max(1, t.myMinutes, t.theirMinutes);
                return (
                  <li key={t.service.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: t.service.accent }}
                        />
                        {t.service.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatMinutes(t.myMinutes + t.theirMinutes)}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${(t.myMinutes / max) * 100}%` }}
                        />
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-accent-foreground/60"
                          style={{ width: `${(t.theirMinutes / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Top bar is {meName}, bottom is {themName}. Runtime is estimated when an export doesn't
              include it.
            </p>
          </section>

          <section className="rounded-3xl bg-card p-4 shadow-sm">
            <h2 className="font-display text-lg">Last 8 weeks</h2>
            <div className="mt-3 flex items-end justify-between gap-1.5">
              {weeks.map((w) => (
                <div key={w.start} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 rounded-t bg-primary"
                      style={{ height: `${(w.mine / peak) * 100}%` }}
                    />
                    <div
                      className="w-1/2 rounded-t bg-accent-foreground/60"
                      style={{ height: `${(w.theirs / peak) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground">
                    {format(new Date(w.start), "d/M")}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {shared.length > 0 ? (
            <section className="rounded-3xl bg-card p-4 shadow-sm">
              <h2 className="flex items-center gap-2 font-display text-lg">
                <Sparkles className="size-4 text-primary" />
                You're both into
              </h2>
              <ul className="mt-3 space-y-2">
                {shared.map((row) => (
                  <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span
                        className="mr-2 inline-block size-2 rounded-full align-middle"
                        style={{ backgroundColor: serviceMeta(row.service).accent }}
                      />
                      {row.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {row.mine} / {row.theirs}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {theirPicks.length > 0 ? (
            <section className="rounded-3xl bg-card p-4 shadow-sm">
              <h2 className="font-display text-lg">Catch up with {themName}</h2>
              <p className="text-xs text-muted-foreground">
                They've started these and you haven't.
              </p>
              <ul className="mt-3 space-y-2">
                {theirPicks.map((row) => (
                  <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span
                        className="mr-2 inline-block size-2 rounded-full align-middle"
                        style={{ backgroundColor: serviceMeta(row.service).accent }}
                      />
                      {row.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(new Date(row.lastAt), "d MMM")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-3xl bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Recent activity</h2>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {([ALL, ...WATCH_SERVICES.map((s) => s.id)] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    filter === id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {id === ALL ? "All" : serviceMeta(id).name}
                </button>
              ))}
            </div>
            <ul className="mt-3 divide-y divide-border/70">
              {visible.slice(0, 40).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: `${serviceMeta(e.service).accent}22` }}
                  >
                    {serviceMeta(e.service).kind === "play" ? (
                      <Gamepad2 className="size-4" style={{ color: serviceMeta(e.service).accent }} />
                    ) : (
                      <Tv className="size-4" style={{ color: serviceMeta(e.service).accent }} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.owner === "me" ? meName : themName} ·{" "}
                      {format(new Date(e.at), "d MMM yyyy")}
                      {e.detail ? ` · ${e.detail}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${e.title}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeWatchEntry(e.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="rounded-3xl bg-card p-4 shadow-sm">
        <h2 className="font-display text-lg">Log something quickly</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {WATCH_SERVICES.map((s) => (
            <Button
              key={s.id}
              variant="outline"
              size="sm"
              className="rounded-2xl"
              onClick={() => quickAdd(s.id)}
            >
              <Plus className="size-3.5" />
              {s.name}
            </Button>
          ))}
        </div>
      </section>

      {(state.watchImports ?? []).length > 0 ? (
        <section className="rounded-3xl bg-card p-4 shadow-sm">
          <h2 className="font-display text-lg">Imported files</h2>
          <ul className="mt-3 space-y-2">
            {state.watchImports.map((imp) => (
              <li key={imp.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{imp.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {serviceMeta(imp.service).name} · {imp.entryCount} items ·{" "}
                    {imp.owner === "me" ? meName : themName}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-2xl"
                  onClick={() => removeWatchImport(imp.id, true)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ImportWatchDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}
