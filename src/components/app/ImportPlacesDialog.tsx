import { useMemo, useRef, useState } from "react";
import { MapPin, Upload } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  dedupeParsed,
  matchExistingPlaces,
  parsePlaces,
  placeId,
  toPlace,
  type ParsedPlace,
} from "@/lib/app/places";
import { boundPaste, importErrorMessage, readImportFile } from "@/lib/app/import-file";
import { useStore } from "@/lib/app/store";
import type { Owner, Place } from "@/lib/app/types";
import { cn } from "@/lib/utils";

const OWNERS: { value: Owner; label: (me: string, them: string) => string }[] = [
  { value: "us", label: () => "Together" },
  { value: "me", label: (me) => me || "Me" },
  { value: "them", label: (_me, them) => them || "Them" },
];

const SOURCES: { value: Place["source"]; label: string }[] = [
  { value: "google", label: "Google Maps" },
  { value: "apple", label: "Apple Maps" },
  { value: "manual", label: "Somewhere else" },
];

export function ImportPlacesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { state, setState } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [pasted, setPasted] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [owner, setOwner] = useState<Owner>("us");
  const [source, setSource] = useState<Place["source"]>("google");

  const parsedResult = useMemo(() => {
    if (!raw) return { places: [] as ParsedPlace[], merged: 0 };
    try {
      return dedupeParsed(parsePlaces(raw, fileName));
    } catch {
      return { places: [] as ParsedPlace[], merged: 0 };
    }
  }, [raw, fileName]);

  const places = parsedResult.places;

  /** Ideas already on the list, matched by link, coordinates or name. */
  const existingMatches = useMemo(
    () => matchExistingPlaces(places, state.places),
    [places, state.places],
  );

  const freshIds = useMemo(
    () => places.map(placeId).filter((id) => !existingMatches.has(id)),
    [places, existingMatches],
  );

  const load = (text: string, name?: string) => {
    setRaw(text);
    setFileName(name);
    const result = (() => {
      try {
        return dedupeParsed(parsePlaces(text, name));
      } catch {
        return { places: [] as ParsedPlace[], merged: 0 };
      }
    })();
    const known = matchExistingPlaces(result.places, state.places);
    setSelected(new Set(result.places.map(placeId).filter((id) => !known.has(id))));
    if (result.places.length === 0) toast.error("No places found in that file");
    else if (result.merged > 0) {
      toast.success(
        `Merged ${result.merged} duplicate ${result.merged === 1 ? "entry" : "entries"}`,
      );
    }
    if (name && /apple|vcf/i.test(name)) setSource("apple");
  };

  const reset = () => {
    setRaw(null);
    setFileName(undefined);
    setPasted("");
    setSelected(new Set());
  };

  const add = () => {
    const chosen = places.filter((p) => selected.has(placeId(p)));
    if (chosen.length === 0) return;
    let updated = 0;
    setState((prev) => {
      const next = [...prev.places];
      for (const p of chosen) {
        const place = toPlace(p, owner, source);
        const matchId = existingMatches.get(placeId(p));
        const i = next.findIndex((x) => x.id === (matchId ?? place.id));
        if (i >= 0) {
          const current = next[i]!;
          updated++;
          next[i] = {
            ...current,
            name: current.name || place.name,
            address: current.address ?? place.address,
            note: current.note ?? place.note,
            url: current.url ?? place.url,
            lat: current.lat ?? place.lat,
            lng: current.lng ?? place.lng,
            updatedAt: Date.now(),
          };
        } else next.push(place);
      }
      return { ...prev, places: next };
    });
    const added = chosen.length - updated;
    toast.success(
      added > 0
        ? `${added} date ${added === 1 ? "idea" : "ideas"} added${updated ? `, ${updated} merged` : ""}`
        : `${updated} existing ${updated === 1 ? "idea" : "ideas"} updated`,
    );
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="flex max-h-[92vh] max-w-md flex-col overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Import saved places</DialogTitle>
        </DialogHeader>

        {!raw ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bring in a saved list from Google Maps (CSV, KML or Takeout JSON), an Apple Maps
              contact card or GPX file — or just paste share links, one per line.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.geojson,.kml,.gpx,.vcf,text/csv,text/plain,application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  load(await readImportFile(file), file.name);
                } catch (err) {
                  toast.error(`Couldn't open ${file.name}`, {
                    description: importErrorMessage(err, "The file couldn't be read."),
                  });
                }
              }}
            />
            <Button
              variant="outline"
              className="w-full rounded-2xl"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 size-4" />
              Choose a file
            </Button>

            <div className="space-y-2">
              <Label htmlFor="places-paste">Or paste links / list text</Label>
              <Textarea
                id="places-paste"
                rows={5}
                value={pasted}
                placeholder={
                  "Sushi place — https://maps.app.goo.gl/...\nhttps://maps.apple.com/?q=..."
                }
                onChange={(e) => setPasted(e.target.value)}
                className="rounded-2xl"
              />
              <Button
                className="w-full rounded-2xl"
                disabled={!pasted.trim()}
                onClick={() => load(boundPaste(pasted))}
              >
                Read pasted list
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Whose idea is it?</Label>
              <div className="flex gap-2">
                {OWNERS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setOwner(o.value)}
                    className={cn(
                      "flex-1 rounded-2xl border px-3 py-2 text-sm transition-colors",
                      owner === o.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {o.label(state.me.name, state.them.name)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Came from</Label>
              <div className="flex gap-2">
                {SOURCES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSource(s.value)}
                    className={cn(
                      "flex-1 rounded-2xl border px-2 py-2 text-xs transition-colors",
                      source === s.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {places.length} found · {selected.size} selected
                  {existingMatches.size > 0 ? ` · ${existingMatches.size} already saved` : ""}
                </Label>
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => setSelected(selected.size > 0 ? new Set() : new Set(freshIds))}
                >
                  {selected.size > 0 ? "Clear all" : "Select new"}
                </button>
              </div>
              <ul className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-border p-2">
                {places.map((p) => {
                  const id = placeId(p);
                  const checked = selected.has(id);
                  const duplicate = existingMatches.has(id);
                  return (
                    <li key={id}>
                      <label className="flex items-start gap-3 rounded-xl p-2 hover:bg-muted/60">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (v === true) next.add(id);
                              else next.delete(id);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {p.name}
                            </span>
                            {duplicate ? (
                              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                Already saved
                              </span>
                            ) : null}
                          </span>
                          {p.address || p.note ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {p.address ?? p.note}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
                {places.length === 0 ? (
                  <li className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                    <MapPin className="size-4" />
                    Nothing recognisable in that list.
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {raw ? (
            <>
              <Button variant="ghost" className="rounded-2xl" onClick={reset}>
                Back
              </Button>
              <Button className="rounded-2xl" disabled={selected.size === 0} onClick={add}>
                Add {selected.size || ""} to ideas
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
