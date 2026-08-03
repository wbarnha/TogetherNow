import { useMemo, useState } from "react";
import { CalendarCheck, Copy, Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { buildIcs, downloadIcs, icsFileName, shareIcs } from "@/lib/app/ics-export";
import { useStore } from "@/lib/app/store";

export function ExportIcsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { state } = useStore();
  const [includeEvents, setIncludeEvents] = useState(true);
  const [includeMilestones, setIncludeMilestones] = useState(true);

  const count =
    (includeEvents ? state.events.length : 0) + (includeMilestones ? state.milestones.length : 0);

  const ics = useMemo(
    () =>
      buildIcs(state, {
        includeEvents,
        includeMilestones,
        calendarName: `${state.me.name || "Us"} & ${state.them.name || "Them"}`,
      }),
    [state, includeEvents, includeMilestones],
  );

  const fileName = icsFileName();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Export calendar</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Save an .ics file you can send to {state.them.name || "your partner"} or open in Apple
          Calendar, Google Calendar or Outlook. Times are written in UTC, so they land correctly in
          every time zone.
        </p>

        <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={includeEvents}
              onCheckedChange={(v) => setIncludeEvents(v === true)}
            />
            <span>
              Plans <span className="text-muted-foreground">({state.events.length})</span>
            </span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={includeMilestones}
              onCheckedChange={(v) => setIncludeMilestones(v === true)}
            />
            <span>
              Dates that matter{" "}
              <span className="text-muted-foreground">
                ({state.milestones.length}, repeating yearly)
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm">
          <CalendarCheck className="size-4 text-muted-foreground" />
          <Label className="font-normal text-muted-foreground">
            {count} {count === 1 ? "entry" : "entries"} · {fileName}
          </Label>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full rounded-2xl"
            disabled={count === 0}
            onClick={async () => {
              const shared = await shareIcs(ics, fileName);
              if (!shared) {
                downloadIcs(ics, fileName);
                toast.success("Calendar file saved");
              }
              onOpenChange(false);
            }}
          >
            <Share2 className="mr-2 size-4" />
            Share or save file
          </Button>
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-2xl"
              disabled={count === 0}
              onClick={() => {
                downloadIcs(ics, fileName);
                toast.success("Calendar file downloaded");
              }}
            >
              <Download className="mr-2 size-4" />
              Download
            </Button>
            <Button
              variant="outline"
              className="flex-1 rounded-2xl"
              disabled={count === 0}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(ics);
                  toast.success("Calendar text copied");
                } catch {
                  toast.error("Couldn't copy — try downloading instead");
                }
              }}
            >
              <Copy className="mr-2 size-4" />
              Copy text
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
