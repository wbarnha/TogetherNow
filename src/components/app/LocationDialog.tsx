import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { geocode, parseLatLng, shortLabel, type GeoResult } from "@/lib/app/geocode";
import type { Place } from "@/lib/app/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  places: Place[];
  onPick: (origin: GeoResult) => void;
  onUseDevice: () => void;
  locating?: boolean;
};

/**
 * Lets you set the point distances are measured from without granting the
 * browser location permission — search a place, paste coordinates, or reuse a
 * saved idea's pin.
 */
export function LocationDialog({
  open,
  onOpenChange,
  places,
  onPick,
  onUseDevice,
  locating,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const pasted = useMemo(() => parseLatLng(query), [query]);

  const pinned = useMemo(
    () =>
      places
        .filter((p): p is Place & { lat: number; lng: number } => p.lat != null && p.lng != null)
        .slice(0, 8),
    [places],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [open]);

  // Debounced search so we don't hammer the lookup service while typing.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (pasted || q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setSearching(true);
    setError(null);

    const timer = setTimeout(() => {
      geocode(q, controller.signal)
        .then((rows) => {
          setResults(rows);
          if (rows.length === 0) setError("No matching places — try a town or postcode.");
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setError(e instanceof Error ? e.message : "Location search failed");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, pasted]);

  const choose = (origin: GeoResult) => {
    onPick(origin);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display">Measure distances from…</DialogTitle>
          <DialogDescription>
            Pick any area by hand — handy when you'd rather not share your device location, or when
            you're planning around somewhere you'll be later.
          </DialogDescription>
        </DialogHeader>

        <Button
          variant="outline"
          className="w-full justify-start rounded-2xl"
          onClick={() => {
            onUseDevice();
            onOpenChange(false);
          }}
        >
          {locating ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Crosshair className="mr-2 size-4" />
          )}
          Use my current location
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Town, address, or paste 40.7128, -74.006"
            aria-label="Search for a location"
            className="rounded-2xl pl-9"
          />
        </div>

        {pasted ? (
          <button
            type="button"
            onClick={() => choose(pasted)}
            className="w-full rounded-2xl border border-primary bg-primary/10 px-3 py-2 text-left text-sm text-primary"
          >
            Use coordinates {pasted.label}
          </button>
        ) : null}

        {searching ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching…
          </p>
        ) : null}

        {error && !searching ? <p className="text-sm text-muted-foreground">{error}</p> : null}

        {results.length > 0 ? (
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}-${r.label}`}>
                <button
                  type="button"
                  onClick={() => choose({ ...r, label: shortLabel(r.label) })}
                  className="flex w-full items-start gap-2 rounded-2xl border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">{r.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {pinned.length > 0 && !pasted && results.length === 0 && !searching ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Or start from a saved idea
            </p>
            <ul className="space-y-2">
              {pinned.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choose({ label: p.name, lat: p.lat, lng: p.lng })}
                    className="flex w-full items-start gap-2 rounded-2xl border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate">{p.name}</span>
                      {p.address ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.address}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
