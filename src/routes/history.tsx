import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import { ArrowLeft, MessagesSquare, Search, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ImportMessagesDialog } from "@/components/app/ImportMessagesDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/app/store";
import { CHAT_SOURCES, type ChatSourceId } from "@/lib/app/chat-import";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Your history — Together Now" },
      {
        name: "description",
        content:
          "Every conversation from iMessage, Discord, and Instagram merged into one searchable timeline on your device.",
      },
      { property: "og:title", content: "Your history — Together Now" },
      {
        property: "og:description",
        content: "One timeline for everything you two have said to each other.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

const ALL = "all" as const;

function accentFor(source: ChatSourceId) {
  return CHAT_SOURCES.find((s) => s.id === source)?.accent ?? "#888";
}

function HistoryPage() {
  const { state, removeChatImport } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<ChatSourceId | typeof ALL>(ALL);

  const messages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.chatMessages
      .filter((m) => (source === ALL ? true : m.source === source))
      .filter((m) => (q ? m.text.toLowerCase().includes(q) : true))
      .sort((a, b) => a.at - b.at);
  }, [state.chatMessages, query, source]);

  const counts = useMemo(() => {
    const map = new Map<ChatSourceId, number>();
    for (const m of state.chatMessages) map.set(m.source, (map.get(m.source) ?? 0) + 1);
    return map;
  }, [state.chatMessages]);

  return (
    <AppShell
      title="Your history"
      subtitle="Every conversation, in one place, on this phone."
      action={
        <Button size="icon" className="rounded-2xl" onClick={() => setOpen(true)}>
          <Upload className="size-5" />
        </Button>
      }
    >
      <Link
        to="/messages"
        className="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground"
      >
        <ArrowLeft className="size-3" /> Back to Reach them
      </Link>

      {state.chatMessages.length === 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-3xl border border-dashed border-border bg-card/50 p-8 text-sm text-muted-foreground"
        >
          Import your iMessage, Discord, and Instagram exports to build one shared history.
        </button>
      ) : (
        <>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search everything you two have said"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSource(ALL)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  source === ALL
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                All · {state.chatMessages.length}
              </button>
              {CHAT_SOURCES.filter((s) => counts.get(s.id)).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSource(s.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    source === s.id
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {s.name} · {counts.get(s.id)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {messages.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">Nothing matches that search.</p>
            ) : null}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || !isSameDay(new Date(prev.at), new Date(m.at));
              const mine = m.owner === "me";
              return (
                <div key={m.id}>
                  {newDay ? (
                    <p className="py-3 text-center text-[11px] tracking-wide text-muted-foreground uppercase">
                      {format(new Date(m.at), "EEEE d MMMM yyyy")}
                    </p>
                  ) : null}
                  <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-3xl px-4 py-2.5",
                        mine
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card",
                      )}
                    >
                      <p className="text-sm break-words whitespace-pre-wrap">{m.text}</p>
                      <p
                        className={cn(
                          "mt-1 flex items-center gap-1.5 text-[10px]",
                          mine ? "text-primary-foreground/70" : "text-muted-foreground",
                        )}
                      >
                        <span
                          className="inline-block size-1.5 rounded-full"
                          style={{ backgroundColor: accentFor(m.source) }}
                        />
                        {format(new Date(m.at), "h:mm a")}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {state.chatImports.length > 0 ? (
        <section className="space-y-2 pt-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">Imported files</h2>
          {state.chatImports.map((imp) => (
            <div
              key={imp.id}
              className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{imp.label}</p>
                <p className="text-xs text-muted-foreground">
                  {imp.messageCount} messages · {format(new Date(imp.firstAt), "MMM yyyy")} –{" "}
                  {format(new Date(imp.lastAt), "MMM yyyy")}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => removeChatImport(imp.id, true)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <p className="px-1 pb-2 text-xs leading-relaxed text-muted-foreground">
        <MessagesSquare className="mr-1 inline size-3" />
        Apple, Meta, and Discord don&apos;t let apps read your inbox live, so history comes from the
        exports those apps give you. Nothing leaves this device.
      </p>

      <ImportMessagesDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}