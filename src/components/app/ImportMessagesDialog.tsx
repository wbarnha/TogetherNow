import { useRef, useState } from "react";
import { Loader2, MessagesSquare, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { importErrorMessage, readImportFile } from "@/lib/app/import-file";
import { useStore } from "@/lib/app/store";
import {
  CHAT_SOURCES,
  guessOwners,
  messageId,
  parseChatExport,
  type ChatSourceId,
  type OwnerMap,
  type ParsedExport,
} from "@/lib/app/chat-import";
import type { ChatMessage } from "@/lib/app/types";
import { cn } from "@/lib/utils";

type Staged = { fileName: string; parsed: ParsedExport; owners: OwnerMap };

function sourceName(id: ChatSourceId) {
  return CHAT_SOURCES.find((s) => s.id === id)?.name ?? "Chat export";
}

export function ImportMessagesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { state, importChat } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState<Staged[]>([]);

  const readFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const next: Staged[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await readImportFile(file);
        const parsed = parseChatExport(text, file.name, state.me.name || "Me");
        if (!parsed) {
          toast.error(`Couldn't read ${file.name}`, {
            description: "Use a .txt, .csv, or .json export from the chat app.",
          });
          continue;
        }
        next.push({
          fileName: file.name,
          parsed,
          owners: guessOwners(parsed, state.me.name, state.them.name),
        });
      } catch (err) {
        toast.error(`Couldn't open ${file.name}`, {
          description: importErrorMessage(err, "The file couldn't be read."),
        });
      }
    }
    setStaged((prev) => [...prev, ...next]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const setOwner = (fileName: string, sender: string, owner: "me" | "them") =>
    setStaged((prev) =>
      prev.map((s) =>
        s.fileName === fileName ? { ...s, owners: { ...s.owners, [sender]: owner } } : s,
      ),
    );

  const total = staged.reduce((n, s) => n + s.parsed.messages.length, 0);

  const doImport = () => {
    let added = 0;
    let skipped = 0;
    for (const s of staged) {
      const messages: ChatMessage[] = s.parsed.messages.map((m) => ({
        id: messageId(s.parsed.source, m.at, m.text),
        source: s.parsed.source,
        owner: (s.owners[m.senderName] ?? "them") as "me" | "them",
        senderName: m.senderName,
        text: m.text,
        at: m.at,
      }));
      const times = messages.map((m) => m.at);
      const result = importChat(messages, {
        source: s.parsed.source,
        label: s.fileName,
        firstAt: Math.min(...times),
        lastAt: Math.max(...times),
      });
      added += result.added;
      skipped += result.skipped;
    }
    if (added > 0) {
      toast.success(`${added} message${added === 1 ? "" : "s"} added`, {
        description: skipped
          ? `${skipped} more didn't fit — your archive is at its limit.`
          : "They're merged into your shared history, newest last.",
      });
    } else if (skipped > 0) {
      toast.error("Your archive is full", {
        description: `${skipped} message${skipped === 1 ? "" : "s"} couldn't be added. Remove an older import first.`,
      });
    } else {
      toast("Nothing new", { description: "Those messages were already in your archive." });
    }
    setStaged([]);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setStaged([]);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Import your messages</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".txt,.csv,.json,text/plain,text/csv,application/json"
            multiple
            hidden
            onChange={(e) => void readFiles(e.target.files)}
          />
          <Button
            className="h-14 w-full rounded-2xl"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
            Choose export files
          </Button>
          <p className="text-xs text-muted-foreground">
            Pick one or several files — iMessage, Discord, and Instagram exports are detected
            automatically and merged into a single history. Everything stays on this device.
          </p>

          {staged.length === 0 ? (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
              {CHAT_SOURCES.map((s) => (
                <div key={s.id} className="flex gap-3">
                  <span
                    className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold text-white"
                    style={{ backgroundColor: s.accent }}
                  >
                    {s.name.slice(0, 1)}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{s.name}</span> — {s.how}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {staged.map((s) => (
            <div
              key={s.fileName + s.parsed.messages.length}
              className="space-y-3 rounded-2xl border border-border bg-card p-4"
            >
              <div>
                <p className="truncate text-sm font-medium">{s.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {sourceName(s.parsed.source)} · {s.parsed.messages.length} messages
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Who is who?</Label>
                {s.parsed.senders.map((sender) => (
                  <div key={sender} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{sender}</span>
                    <div className="flex gap-1">
                      {(["me", "them"] as const).map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setOwner(s.fileName, sender, o)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            s.owners[sender] === o
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground",
                          )}
                        >
                          {o === "me" ? state.me.name || "Me" : state.them.name || "Them"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {total ? `${total} messages ready` : ""}
          </span>
          <Button onClick={doImport} disabled={!staged.length}>
            <MessagesSquare className="size-4" /> Add to history
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
