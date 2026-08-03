import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarPlus, Check, ExternalLink, MapPin, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { EventDialog } from "@/components/app/EventDialog";
import { ImportPlacesDialog } from "@/components/app/ImportPlacesDialog";
import { OwnerBadge } from "@/components/app/OwnerBadge";
import { Button } from "@/components/ui/button";
import { mapLink } from "@/lib/app/places";
import { useStore } from "@/lib/app/store";
import { toISODate } from "@/lib/app/time";
import type { Place } from "@/lib/app/types";
import { cn } from "@/lib/utils";

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
  { value: "want", label: "Want to go" },
  { value: "been", label: "Been" },
] as const;

function PlacesPage() {
  const { state, upsertPlace, removePlace } = useStore();
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("want");
  const [planning, setPlanning] = useState<Place | null>(null);

  const places = useMemo(
    () =>
      state.places
        .filter((p) => (filter === "been" ? p.visited : !p.visited))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [state.places, filter],
  );

  return (
    <AppShell
      title="Date ideas"
      subtitle="Saved places, waiting for the next time you're together"
      action={
        <Button
          size="icon"
          className="rounded-2xl"
          aria-label="Import saved places"
          onClick={() => setImportOpen(true)}
        >
          <Upload className="size-5" />
        </Button>
      }
    >
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

      {places.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-center">
          <MapPin className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 font-display text-lg font-semibold">
            {filter === "been" ? "Nowhere ticked off yet" : "No ideas saved yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Import a saved list from Google Maps or Apple Maps and every pin becomes a date idea
            you both can see.
          </p>
          {filter === "want" ? (
            <Button className="mt-4 rounded-2xl" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 size-4" />
              Import saved places
            </Button>
          ) : null}
        </section>
      ) : (
        <ul className="space-y-3">
          {places.map((place) => (
            <li
              key={place.id}
              className="rounded-3xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold">{place.name}</p>
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
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => setPlanning(place)}
                >
                  <CalendarPlus className="mr-1.5 size-4" />
                  Plan it
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
      <EventDialog
        open={planning !== null}
        onOpenChange={(v) => {
          if (!v) setPlanning(null);
        }}
        defaultDate={toISODate(new Date())}
        defaultTitle={planning?.name ?? ""}
        defaultNotes={[planning?.address, planning?.url].filter(Boolean).join("\n")}
        defaultOwner={planning?.owner ?? "us"}
      />
    </AppShell>
  );
}
