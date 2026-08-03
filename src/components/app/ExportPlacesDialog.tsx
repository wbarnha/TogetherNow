import { useMemo, useState } from "react";
import { Copy, Download, MapPin, Share2 } from "lucide-react";
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
import {
  buildPlacesCsv,
  buildPlacesShareText,
  downloadPlacesCsv,
  placesCsvFileName,
  selectPlaces,
  sharePlacesCsv,
} from "@/lib/app/places-export";
import { useStore } from "@/lib/app/store";

export function ExportPlacesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { state } = useStore();
  const [includeWant, setIncludeWant] = useState(true);
  const [includeVisited, setIncludeVisited] = useState(true);

  const wantCount = state.places.filter((p) => !p.visited).length;
  const visitedCount = state.places.length - wantCount;

  const selected = useMemo(
    () => selectPlaces(state.places, { includeWant, includeVisited }),
    [state.places, includeWant, includeVisited],
  );
  const csv = useMemo(() => buildPlacesCsv(selected), [selected]);
  const shareText = useMemo(() => buildPlacesShareText(selected, state), [selected, state]);
  const fileName = placesCsvFileName();
  const count = selected.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Export date ideas</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Save a CSV you can re-import on another device, open in Sheets or Numbers, or copy a
          tidy list to paste straight into a chat with{" "}
          {state.them.name || "your partner"}.
        </p>

        <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={includeWant}
              onCheckedChange={(v) => setIncludeWant(v === true)}
            />
            <span>
              Want to go <span className="text-muted-foreground">({wantCount})</span>
            </span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={includeVisited}
              onCheckedChange={(v) => setIncludeVisited(v === true)}
            />
            <span>
              Been <span className="text-muted-foreground">({visitedCount})</span>
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm">
          <MapPin className="size-4 text-muted-foreground" />
          <Label className="font-normal text-muted-foreground">
            {count} {count === 1 ? "idea" : "ideas"} · {fileName}
          </Label>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full rounded-2xl"
            disabled={count === 0}
            onClick={async () => {
              const shared = await sharePlacesCsv(csv, fileName);
              if (!shared) {
                downloadPlacesCsv(csv, fileName);
                toast.success("Ideas file saved");
              }
              onOpenChange(false);
            }}
          >
            <Share2 className="mr-2 size-4" />
            Share or save CSV
          </Button>
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-2xl"
              disabled={count === 0}
              onClick={() => {
                downloadPlacesCsv(csv, fileName);
                toast.success("Ideas CSV downloaded");
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
                  await navigator.clipboard.writeText(shareText);
                  toast.success("Share text copied");
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