import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import {
  CalendarHeart,
  CalendarPlus,
  Check,
  Crosshair,
  ExternalLink,
  List,
  Map as MapIcon,
  MapPin,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { EventDialog } from "@/components/app/EventDialog";
import { ExportPlacesDialog } from "@/components/app/ExportPlacesDialog";
import { ImportPlacesDialog } from "@/components/app/ImportPlacesDialog";
import { OwnerBadge } from "@/components/app/OwnerBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  categoryLabel,
  distanceMeters,
  formatDistance,
  mapLink,
  placeCategory,
  PLACE_CATEGORIES,
} from "@/lib/app/places";
import { newId, useStore } from "@/lib/app/store";
import { toISODate } from "@/lib/app/time";
import type { Place, PlaceCategory, PlanEvent } from "@/lib/app/types";
import { cn } from "@/lib/utils";
import type { MappablePlace } from "@/components/app/PlacesMap";

// Leaflet touches window at import time, so it only loads in the browser.
const PlacesMap = lazy(() => import("@/components/app/PlacesMap"));

export const Route = createFileRoute("/places")({
  head: () => ({
    meta: [
      { title: "Date ideas — Together Now" },
      {
        name: "description",
        content:
          "Import saved places from Google Maps or Apple Maps and keep a shared list of date ideas for the next time you are together.",
      },
      { property: "og:title", content: "Date ideas — Together Now" },
      {
        property: "og:description",
        content: "Your saved places, turned into a shared list of things to do together.",
      },
    ],
  }),
  component: PlacesPage,
});

const FILTERS = [
  { value: "all", label: "All" },
  { value: "want", label: "Want to go" },
  { value: "been", label: "Been" },
] as const;

const RADII = [
  { value: "any", label: "Any distance" },
  { value: "5000", label: "Within 5 km" },
  { value: "25000", label: "Within 25 km" },
  { value: "100000", label: "Within 100 km" },
] as const;

const SORTS = [
  { value: "recent", label: "Recently added" },
  { value: "name", label: "Name A–Z" },
  { value: "distance", label: "Closest to me" },
] as const;

/** Next Friday from today (today counts if it is already Friday). */
function nextDateNightISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return toISODate(d);
}

function PlacesPage() {
  const { state, upsertPlace, removePlace, upsertEvent, removeEvent } = useStore();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("want");
  const [planning, setPlanning] = useState<Place | null>(null);
  const [editingEvent, setEditingEvent] = useState<PlanEvent | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PlaceCategory | "all">("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("recent");
  const [radius, setRadius] = useState<(typeof RADII)[number]["value"]>("any");
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Your device can't share a location");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success("Using your current location");
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location — check location permissions");
      },
      { timeout: 10_000 },
    );
  };

  /** Category counts across everything saved, so chips show what actually exists. */
  const categoryCounts = useMemo(() => {
    const counts = new Map<PlaceCategory, number>();
    for (const p of state.places) {
      const c = placeCategory(p);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }, [state.places]);

  /** One tap: drop the idea straight onto the shared calendar as a plan for both of us. */
  const planTogether = (place: Place) => {
    const event: PlanEvent = {
      id: newId(),
      title: place.name,
      date: nextDateNightISO(),
      time: "19:00",
      anchor: "me",
      owner: "us",
      notes: [place.address, place.url].filter(Boolean).join("\n") || undefined,
      updatedAt: Date.now(),
    };
    upsertEvent(event);
    toast.success(`${place.name} is on your shared calendar`, {
      description: `${event.date} at 7:00 PM ${state.me.name || "your"} time — for both of you.`,
      action: {
        label: "Edit",
        onClick: () => setEditingEvent(event),
      },
      cancel: {
        label: "Undo",
        onClick: () => removeEvent(event.id),
      },
    });
  };

  const places = useMemo(() => {
    const q = query.trim().toLowerCase();
    const max = radius === "any" ? null : Number(radius);
    const rows = state.places
      .filter((p) => (filter === "all" ? true : filter === "been" ? p.visited : !p.visited))
      .filter((p) => (category === "all" ? true : placeCategory(p) === category))
      .filter((p) =>
        q ? [p.name, p.address, p.note].some((f) => f?.toLowerCase().includes(q)) : true,
      )
      .map((p) => ({
        place: p,
        distance:
          origin && p.lat != null && p.lng != null
            ? distanceMeters(origin, { lat: p.lat, lng: p.lng })
            : null,
      }))
      .filter(({ distance }) => (max == null ? true : distance != null && distance <= max));

    rows.sort((a, b) => {
      if (sort === "name") return a.place.name.localeCompare(b.place.name);
      if (sort === "distance") {
        if (a.distance == null) return b.distance == null ? 0 : 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      }
      return b.place.updatedAt - a.place.updatedAt;
    });
    return rows;
  }, [state.places, filter, category, query, sort, radius, origin]);

  const mapped = useMemo(
    () =>
      places
        .map(({ place }) => place)
        .filter((p): p is MappablePlace => p.lat != null && p.lng != null),
    [places],
  );

  const needsLocation = (sort === "distance" || radius !== "any") && !origin;

  return (
    <AppShell
      title="Date ideas"
      subtitle="Saved places, waiting for the next time you're together"
      action={
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            className="rounded-2xl"
            aria-label="Export date ideas"
            disabled={state.places.length === 0}
            onClick={() => setExportOpen(true)}
          >
            <Share2 className="size-5" />
          </Button>
          <Button
            size="icon"
            className="rounded-2xl"
            aria-label="Import saved places"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="size-5" />
          </Button>
        </div>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ideas, addresses, notes…"
          aria-label="Search date ideas"
          className="rounded-2xl pl-9 pr-9"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "flex-1 rounded-2xl border px-3 py-2 text-sm transition-colors",
              filter === f.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 rounded-2xl bg-muted/60 p-1">
        {([
          { value: "list", label: "List", icon: List },
          { value: "map", label: "Map", icon: MapIcon },
        ] as const).map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setView(v.value)}
            aria-pressed={view === v.value}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition-colors",
              view === v.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            <v.icon className="size-4" />
            {v.label}
          </button>
        ))}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => setCategory("all")}
          aria-pressed={category === "all"}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
            category === "all"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground",
          )}
        >
          All types
        </button>
        {PLACE_CATEGORIES.filter((c) => (categoryCounts.get(c.value) ?? 0) > 0).map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            aria-pressed={category === c.value}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
              category === c.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {c.label}
            <span className="ml-1.5 opacity-60">{categoryCounts.get(c.value)}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="rounded-2xl" aria-label="Sort ideas">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={radius} onValueChange={(v) => setRadius(v as typeof radius)}>
          <SelectTrigger className="rounded-2xl" aria-label="Filter by distance">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RADII.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsLocation ? (
        <button
          type="button"
          onClick={locate}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
        >
          <Crosshair className="size-4" />
          {locating ? "Finding you…" : "Use my location for distances"}
        </button>
      ) : origin ? (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Crosshair className="size-3.5" /> Distances from your current location
          </span>
          <button type="button" className="underline" onClick={() => setOrigin(null)}>
            Clear
          </button>
        </div>
      ) : null}

      {view === "map" ? (
        <section className="overflow-hidden rounded-3xl border border-border bg-card">
          {mapped.length === 0 ? (
            <div className="p-6 text-center">
              <MapPin className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 font-display text-lg font-semibold">Nothing to pin yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ideas need coordinates to show on the map — import a Google Maps list, KML or GPX
                file and their pins will appear here.
              </p>
            </div>
          ) : (
            <ClientOnly
              fallback={<div className="h-[420px] w-full animate-pulse bg-muted" />}
            >
              <Suspense fallback={<div className="h-[420px] w-full animate-pulse bg-muted" />}>
                <PlacesMap
                  places={mapped}
                  meName={state.me.name}
                  themName={state.them.name}
                  onSelect={setPlanning}
                />
              </Suspense>
            </ClientOnly>
          )}
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {mapped.length} of {places.length} {places.length === 1 ? "idea" : "ideas"} have a
            location
          </p>
        </section>
      ) : places.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-center">
          <MapPin className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 font-display text-lg font-semibold">
            {state.places.length > 0
              ? "No ideas match those filters"
              : "No ideas saved yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.places.length > 0
              ? "Try clearing the search, widening the distance or picking another type."
              : "Import a saved list from Google Maps or Apple Maps and every pin becomes a date idea you both can see."}
          </p>
          {state.places.length === 0 ? (
            <Button className="mt-4 rounded-2xl" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 size-4" />
              Import saved places
            </Button>
          ) : null}
        </section>
      ) : (
        <ul className="space-y-3">
          {places.map(({ place, distance }) => (
            <li
              key={place.id}
              className="rounded-3xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold">{place.name}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {categoryLabel(placeCategory(place))}
                    {distance != null ? ` · ${formatDistance(distance)} away` : ""}
                  </p>
                  {place.address ? (
                    <p className="truncate text-sm text-muted-foreground">{place.address}</p>
                  ) : null}
                  {place.note ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{place.note}</p>
                  ) : null}
                </div>
                <OwnerBadge
                  owner={place.owner}
                  meName={state.me.name}
                  themName={state.them.name}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="rounded-2xl"
                  onClick={() => planTogether(place)}
                >
                  <CalendarHeart className="mr-1.5 size-4" />
                  Plan for us
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => setPlanning(place)}
                >
                  <CalendarPlus className="mr-1.5 size-4" />
                  Pick a time
                </Button>
                <Button size="sm" variant="outline" className="rounded-2xl" asChild>
                  <a href={mapLink(place)} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 size-4" />
                    Open map
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant={place.visited ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={() => upsertPlace({ ...place, visited: !place.visited })}
                >
                  <Check className="mr-1.5 size-4" />
                  {place.visited ? "Been" : "Mark as been"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto rounded-2xl text-muted-foreground"
                  aria-label={`Remove ${place.name}`}
                  onClick={() => removePlace(place.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ImportPlacesDialog open={importOpen} onOpenChange={setImportOpen} />
      <ExportPlacesDialog open={exportOpen} onOpenChange={setExportOpen} />
      <EventDialog
        open={planning !== null || editingEvent !== null}
        onOpenChange={(v) => {
          if (!v) {
            setPlanning(null);
            setEditingEvent(null);
          }
        }}
        editing={editingEvent}
        defaultDate={toISODate(new Date())}
        defaultTitle={planning?.name ?? ""}
        defaultNotes={[planning?.address, planning?.url].filter(Boolean).join("\n")}
        defaultOwner={planning?.owner ?? "us"}
      />
    </AppShell>
  );
}
