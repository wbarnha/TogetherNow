import { useRef, useState } from "react";
import { Loader2, Tv, Upload } from "lucide-react";
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
  WATCH_SERVICES,
  parseWatchFile,
  serviceMeta,
  watchId,
  type ParsedWatchFile,
  type WatchService,
} from "@/lib/app/watch";
import type { WatchEntry } from "@/lib/app/types";
import { cn } from "@/lib/utils";

type Staged = { fileName: string; parsed: ParsedWatchFile; owner: "me" | "them" };

export function ImportWatchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { state, importWatch } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState<Staged[]>([]);

  const meName = state.me.name || "Me";
  const themName = state.them.name || "Them";

  const readFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const next: Staged[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await readImportFile(file);
        const parsed = parseWatchFile(text, file.name);
        if (!parsed) {
          toast.error(`Couldn't read ${file.name}`, {
            description: "Use a CSV or JSON export with a title (and ideally a date) column.",
          });
          continue;
        }
        next.push({ fileName: file.name, parsed, owner: "me" });
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

  const setService = (fileName: string, service: WatchService) =>
    setStaged((prev) =>
      prev.map((s) => (s.fileName === fileName ? { ...s, parsed: { ...s.parsed, service } } : s)),
    );

  const setOwner = (fileName: string, owner: "me" | "them") =>
    setStaged((prev) => prev.map((s) => (s.fileName === fileName ? { ...s, owner } : s)));

  const total = staged.reduce((n, s) => n + s.parsed.entries.length, 0);

  const doImport = () => {
    let added = 0;
    for (const s of staged) {
      const entries: WatchEntry[] = s.parsed.entries.map((e) => ({
        id: watchId(s.parsed.service, e.at, e.title, e.detail),
        service: s.parsed.service,
        title: e.title,
        detail: e.detail,
        owner: s.owner,
        at: e.at,
        minutes: e.minutes,
      }));
      added += importWatch(entries, {
        service: s.parsed.service,
        label: s.fileName,
        owner: s.owner,
      });
    }
    if (added > 0) {
      toast.success(`${added} item${added === 1 ? "" : "s"} added`, {
        description: "Your shared viewing dashboard is up to date.",
      });
    } else {
      toast("Nothing new", { description: "Those were already on your dashboard." });
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
          <DialogTitle className="font-display text-2xl">Import viewing history</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These services have no live API for personal history, so bring in the export files they
            give you. Everything is parsed and stored on this device only.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json,.txt,text/csv,application/json"
            multiple
            className="hidden"
            onChange={(e) => void readFiles(e.target.files)}
          />
          <Button
            variant="outline"
            className="h-12 w-full rounded-2xl"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Choose export files
          </Button>

          <ul className="space-y-2 rounded-2xl bg-muted/50 p-3 text-xs text-muted-foreground">
            {WATCH_SERVICES.filter((s) => s.id !== "other").map((s) => (
              <li key={s.id} className="flex gap-2">
                <span
                  className="mt-1 size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.accent }}
                />
                <span>
                  <span className="font-medium text-foreground">{s.name}</span> — {s.how}
                </span>
              </li>
            ))}
          </ul>

          {staged.map((s) => (
            <div key={s.fileName} className="space-y-3 rounded-2xl border border-border p-3">
              <div className="flex items-center gap-2">
                <Tv className="size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.parsed.entries.length} item{s.parsed.entries.length === 1 ? "" : "s"} ·{" "}
                    {serviceMeta(s.parsed.service).name}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Service</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {WATCH_SERVICES.map((svc) => (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => setService(s.fileName, svc.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        s.parsed.service === svc.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {svc.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Whose account is this?</Label>
                <div className="mt-1 flex gap-1.5">
                  {(["me", "them"] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOwner(s.fileName, o)}
                      className={cn(
                        "flex-1 rounded-full border px-3 py-1.5 text-xs transition-colors",
                        s.owner === o
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {o === "me" ? meName : themName}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="rounded-2xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="rounded-2xl" disabled={!staged.length} onClick={doImport}>
            Add {total || ""} item{total === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
