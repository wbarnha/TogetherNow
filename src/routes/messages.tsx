import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useStore } from "@/lib/app/store";
import { MESSENGERS } from "@/lib/app/messengers";
import { clockIn } from "@/lib/app/time";
import { useNow } from "@/lib/app/store";
import { History, Settings2, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImportMessagesDialog } from "@/components/app/ImportMessagesDialog";
import { toast } from "sonner";
import { ASSISTANTS, launchAssistant } from "@/lib/app/assistants";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Reach them — Together Now" },
      {
        name: "description",
        content:
          "One tap to your conversation in iMessage, WhatsApp, Discord, Telegram, or Instagram.",
      },
      { property: "og:title", content: "Reach them — Together Now" },
      {
        property: "og:description",
        content: "All the ways you talk, gathered in one place.",
      },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { state } = useStore();
  const now = useNow(30000);
  const [importOpen, setImportOpen] = useState(false);
  const configured = MESSENGERS.filter((m) => (state.them.handles[m.id] ?? "").trim());
  const missing = MESSENGERS.filter((m) => !(state.them.handles[m.id] ?? "").trim());

  return (
    <AppShell
      title="Reach them"
      subtitle={
        now
          ? `It's ${clockIn(state.them.timeZone, now)} where ${state.them.name || "they"} are`
          : "One tap to any conversation"
      }
    >
      <section className="space-y-3 rounded-3xl border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">One shared history</h2>
          <p className="text-xs text-muted-foreground">
            Bring your iMessage, Discord, and Instagram exports into a single searchable timeline —
            {state.chatMessages.length
              ? ` ${state.chatMessages.length} messages so far.`
              : " it all stays on this device."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" /> Import messages
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link to="/history">
              <History className="size-4" /> Open history
            </Link>
          </Button>
        </div>
      </section>

      {configured.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
          Add {state.them.name || "their"} handles in{" "}
          <Link to="/settings" className="font-medium text-primary underline">
            You two
          </Link>{" "}
          and they&apos;ll show up here as one-tap shortcuts.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {configured.map((m) => {
            const handle = (state.them.handles[m.id] ?? "").trim();
            return (
              <a
                key={m.id}
                href={m.link(handle)}
                className="group flex flex-col justify-between rounded-3xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <span
                  className="mb-6 inline-flex size-10 items-center justify-center rounded-2xl text-sm font-semibold text-white"
                  style={{ backgroundColor: m.accent }}
                >
                  {m.name.slice(0, 1)}
                </span>
                <span className="block font-medium">{m.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{handle}</span>
                {m.webFallback ? (
                  <span className="mt-2 block text-[11px] text-muted-foreground">
                    App not installed?{" "}
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(m.webFallback!(handle), "_blank", "noopener");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          window.open(m.webFallback!(handle), "_blank", "noopener");
                      }}
                      className="cursor-pointer underline"
                    >
                      open on web
                    </span>
                  </span>
                ) : null}
              </a>
            );
          })}
        </div>
      )}

      {missing.length > 0 ? (
        <section className="space-y-2 pt-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">Not set up yet</h2>
          <div className="rounded-3xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{missing.map((m) => m.name).join(", ")}</p>
            <Link
              to="/settings"
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary"
            >
              <Settings2 className="size-4" /> Add handles
            </Link>
          </div>
        </section>
      ) : null}

      <section className="space-y-2 pt-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">Think it through with AI</h2>
        <div className="grid grid-cols-2 gap-3">
          {ASSISTANTS.map((assistant) => (
            <button
              key={assistant.id}
              type="button"
              onClick={async () => {
                const prompt = `My partner ${state.them.name || ""} and I are long distance — they're in ${state.them.timeZone} and I'm in ${state.me.timeZone}. Help me think through`;
                await launchAssistant(assistant, prompt);
                toast.success(`${assistant.name} opened`);
              }}
              className="flex flex-col items-start rounded-3xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-md"
            >
              <span
                className="mb-6 inline-flex size-10 items-center justify-center rounded-2xl text-sm font-semibold text-white"
                style={{ backgroundColor: assistant.accent }}
              >
                {assistant.name.slice(0, 1)}
              </span>
              <span className="block font-medium">{assistant.name}</span>
              <span className="block text-xs text-muted-foreground">{assistant.note}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="px-1 pb-2 text-xs leading-relaxed text-muted-foreground">
        These are shortcuts, not inboxes. Apple, Meta, and Discord don&apos;t let other apps read
        your conversations live — history only comes from the exports you import, and it stays on
        this device.
      </p>

      <ImportMessagesDialog open={importOpen} onOpenChange={setImportOpen} />
    </AppShell>
  );
}
