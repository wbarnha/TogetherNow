import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";
import { newId, useStore } from "@/lib/app/store";
import { toISODate } from "@/lib/app/time";
import type { Milestone, MilestoneKind, Owner } from "@/lib/app/types";
import { cn } from "@/lib/utils";

const KINDS: { value: MilestoneKind; label: string }[] = [
  { value: "birthday", label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "first-met", label: "First met" },
  { value: "custom", label: "Something else" },
];

export function MilestoneDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: Milestone | null;
}) {
  const { state, upsertMilestone, removeMilestone } = useStore();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<MilestoneKind>("birthday");
  const [date, setDate] = useState(toISODate(new Date()));
  const [recurring, setRecurring] = useState(true);
  const [owner, setOwner] = useState<Owner>("us");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setKind(editing?.kind ?? "birthday");
    setDate(editing?.date ?? toISODate(new Date()));
    setRecurring(editing?.recurring ?? true);
    setOwner(editing?.owner ?? "us");
  }, [open, editing]);

  const save = () => {
    if (!title.trim()) return;
    upsertMilestone({
      id: editing?.id ?? newId(),
      title: title.trim(),
      kind,
      date,
      recurring,
      owner,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing ? "Edit date" : "New date to remember"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ms-title">Name it</Label>
            <Input
              id="ms-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Her birthday, our anniversary…"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={cn(
                    "rounded-2xl border px-3 py-2 text-sm transition-colors",
                    kind === k.value
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ms-date">Date</Label>
            <Input
              id="ms-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium">Repeats every year</p>
              <p className="text-xs text-muted-foreground">
                Counts the years since the original date
              </p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>

          <div className="space-y-2">
            <Label>Whose is it?</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["us", "me", "them"] as Owner[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOwner(o)}
                  className={cn(
                    "truncate rounded-2xl border px-2 py-2 text-sm transition-colors",
                    owner === o
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {o === "us" ? "Ours" : o === "me" ? state.me.name || "Mine" : state.them.name || "Theirs"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                removeMilestone(editing.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={!title.trim()}>
            {editing ? "Save changes" : "Add date"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}