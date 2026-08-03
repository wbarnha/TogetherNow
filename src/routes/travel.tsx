import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Check,
  ExternalLink,
  Pencil,
  Plane,
  Plus,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { TravelOptionDialog } from "@/components/app/TravelOptionDialog";
import { TripDialog } from "@/components/app/TripDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ASSISTANTS, launchAssistant } from "@/lib/app/assistants";
import { useStore } from "@/lib/app/store";
import {
  formatDuration,
  formatMoney,
  researchPrompt,
  searchLinks,
  TRIP_STATUS,
  tripBudget,
} from "@/lib/app/travel";
import type { TravelOption, Trip } from "@/lib/app/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/travel")({
  head: () => ({
    meta: [
      { title: "Getting to each other — Together Now" },
      {
        name: "description",
        content:
          "Research flights, trains and drives between your two cities, compare what each route costs, and save up for the next visit together.",
      },
      { property: "og:title", content: "Getting to each other — Together Now" },
      {
        property: "og:description",
        content: "Compare routes, split the cost, and count down to the next visit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TravelPage,
});

function TravelPage() {
  const { state, upsertTrip } = useStore();
  const [tripDialog, setTripDialog] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [optionFor, setOptionFor] = useState<Trip | null>(null);
  const [editingOption, setEditingOption] = useState<TravelOption | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const trips = [...state.trips].sort((a, b) => {
    const ad = a.startDate ?? "9999";
    const bd = b.startDate ?? "9999";
    return ad === bd ? b.updatedAt - a.updatedAt : ad.localeCompare(bd);
  });

  const openNewTrip = () => {
    setEditingTrip(null);
    setTripDialog(true);
  };

  return (
    <AppShell
      title="Getting to you"
      subtitle="Every way to close the distance, side by side"
      action={
        <Button size="icon" className="rounded-2xl" aria-label="New trip" onClick={openNewTrip}>
          <Plus className="size-5" />
        </Button>
      }
    >
      {trips.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-center">
          <Plane className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 font-display text-lg font-semibold">No trips in the works</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a trip with your two cities and you&apos;ll get one-tap searches, a place to
            compare routes, and a shared savings jar for the ticket.
          </p>
          <Button className="mt-4 rounded-2xl" onClick={openNewTrip}>
            <Plus className="mr-2 size-4" />
            Plan a visit
          </Button>
        </section>
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => {
            const budget = tripBudget(trip);
            const open = expanded === trip.id;
            const links = searchLinks(trip);
            const travellerName =
              trip.traveller === "me"
                ? state.me.name || "Me"
                : trip.traveller === "them"
                  ? state.them.name || "Them"
                  : "Both of us";

            return (
              <li key={trip.id} className="rounded-3xl border border-border bg-card p-4">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : trip.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-semibold">{trip.title}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {trip.origin || "—"} → {trip.destination || "—"} · {travellerName}
                      </p>
                      {trip.startDate ? (
                        <p className="text-xs text-muted-foreground">
                          {trip.startDate}
                          {trip.endDate ? ` – ${trip.endDate}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                        trip.status === "booked"
                          ? "border-ours/30 bg-ours-soft text-ours-foreground"
                          : trip.status === "researching"
                            ? "border-mine/25 bg-mine-soft text-mine"
                            : "border-border text-muted-foreground",
                      )}
                    >
                      {TRIP_STATUS.find((s) => s.id === trip.status)?.label}
                    </span>
                  </div>

                  {budget.target > 0 ? (
                    <div className="mt-3">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${budget.percent}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {formatMoney(budget.saved, trip.currency)} saved of{" "}
                        {formatMoney(budget.target, trip.currency)} ·{" "}
                        {formatMoney(budget.remaining, trip.currency)} to go
                      </p>
                    </div>
                  ) : null}
                </button>

                {open ? (
                  <div className="mt-4 space-y-5 border-t border-border pt-4">
                    <section className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium">Routes we&apos;ve found</h2>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() => {
                            setEditingOption(null);
                            setOptionFor(trip);
                          }}
                        >
                          <Plus className="mr-1.5 size-4" />
                          Add
                        </Button>
                      </div>

                      {trip.options.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nothing logged yet — search below, then save what you find so you can
                          compare cost against travel time.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {[...trip.options]
                            .sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity))
                            .map((option) => (
                              <li
                                key={option.id}
                                className={cn(
                                  "rounded-2xl border p-3",
                                  option.chosen
                                    ? "border-primary bg-primary/5"
                                    : "border-border bg-background",
                                )}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium capitalize">
                                      {option.mode}
                                      {option.carrier ? ` · ${option.carrier}` : ""}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {typeof option.cost === "number"
                                        ? formatMoney(option.cost, trip.currency)
                                        : "No price yet"}
                                      {option.durationMinutes
                                        ? ` · ${formatDuration(option.durationMinutes)} door to door`
                                        : ""}
                                    </p>
                                    {option.detail ? (
                                      <p className="mt-0.5 text-xs text-muted-foreground">
                                        {option.detail}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-8 rounded-xl"
                                      aria-label={
                                        option.chosen ? "Unpick this route" : "Pick this route"
                                      }
                                      onClick={() =>
                                        upsertTrip({
                                          ...trip,
                                          options: trip.options.map((o) => ({
                                            ...o,
                                            chosen: o.id === option.id ? !o.chosen : false,
                                          })),
                                        })
                                      }
                                    >
                                      <Check
                                        className={cn(
                                          "size-4",
                                          option.chosen ? "text-primary" : "text-muted-foreground",
                                        )}
                                      />
                                    </Button>
                                    {option.url ? (
                                      <a
                                        href={option.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label="Open booking link"
                                        className="inline-flex size-8 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
                                      >
                                        <ExternalLink className="size-4" />
                                      </a>
                                    ) : null}
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-8 rounded-xl"
                                      aria-label="Edit option"
                                      onClick={() => {
                                        setEditingOption(option);
                                        setOptionFor(trip);
                                      }}
                                    >
                                      <Pencil className="size-4" />
                                    </Button>
                                  </div>
                                </div>
                              </li>
                            ))}
                        </ul>
                      )}
                    </section>

                    <section className="space-y-2">
                      <h2 className="flex items-center gap-1.5 text-sm font-medium">
                        <Search className="size-4" /> Search with your cities
                      </h2>
                      <div className="grid grid-cols-2 gap-2">
                        {links.map((link) => (
                          <a
                            key={link.id}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-2xl border border-border bg-background p-3 transition-shadow hover:shadow-sm"
                          >
                            <span className="block text-sm font-medium">{link.label}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {link.hint}
                            </span>
                          </a>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-2">
                      <h2 className="flex items-center gap-1.5 text-sm font-medium">
                        <Sparkles className="size-4" /> Ask an AI to dig deeper
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Copies a full research brief about this trip and opens a fresh chat.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {ASSISTANTS.map((assistant) => (
                          <button
                            key={assistant.id}
                            type="button"
                            onClick={async () => {
                              const prompt = researchPrompt(trip, state);
                              const { copied, prefilled } = await launchAssistant(
                                assistant,
                                prompt,
                              );
                              toast.success(
                                prefilled
                                  ? `${assistant.name} opened with your brief`
                                  : copied
                                    ? "Brief copied — paste it into the chat"
                                    : `${assistant.name} opened`,
                              );
                            }}
                            className="flex items-center gap-2 rounded-2xl border border-border bg-background p-3 text-left transition-shadow hover:shadow-sm"
                          >
                            <span
                              className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold text-white"
                              style={{ backgroundColor: assistant.accent }}
                            >
                              {assistant.name.slice(0, 1)}
                            </span>
                            <span className="text-sm font-medium">{assistant.name}</span>
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-2">
                      <h2 className="flex items-center gap-1.5 text-sm font-medium">
                        <Wallet className="size-4" /> Paying for it
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Split evenly:{" "}
                        {budget.target > 0
                          ? `${formatMoney(budget.share, trip.currency)} each`
                          : "add a budget or a route price to see each share"}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <SavedField
                          label={`${state.me.name || "Me"} saved`}
                          value={trip.savedByMe}
                          currency={trip.currency}
                          owed={budget.owedByMe}
                          hasTarget={budget.target > 0}
                          onChange={(v) => upsertTrip({ ...trip, savedByMe: v })}
                        />
                        <SavedField
                          label={`${state.them.name || "Them"} saved`}
                          value={trip.savedByThem}
                          currency={trip.currency}
                          owed={budget.owedByThem}
                          hasTarget={budget.target > 0}
                          onChange={(v) => upsertTrip({ ...trip, savedByThem: v })}
                        />
                      </div>
                    </section>

                    {trip.notes ? (
                      <p className="text-sm text-muted-foreground">{trip.notes}</p>
                    ) : null}

                    <Button
                      variant="outline"
                      className="w-full rounded-2xl"
                      onClick={() => {
                        setEditingTrip(trip);
                        setTripDialog(true);
                      }}
                    >
                      <Pencil className="mr-2 size-4" />
                      Edit trip
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="px-1 pb-2 text-xs leading-relaxed text-muted-foreground">
        Prices and times are whatever you save here — nothing is fetched or shared automatically,
        so use the export in Settings to send a copy to each other.
      </p>

      <TripDialog open={tripDialog} onOpenChange={setTripDialog} editing={editingTrip} />
      {optionFor ? (
        <TravelOptionDialog
          open={!!optionFor}
          onOpenChange={(v) => {
            if (!v) {
              setOptionFor(null);
              setEditingOption(null);
            }
          }}
          trip={state.trips.find((t) => t.id === optionFor.id) ?? optionFor}
          editing={editingOption}
        />
      ) : null}
    </AppShell>
  );
}

function SavedField({
  label,
  value,
  currency,
  owed,
  hasTarget,
  onChange,
}: {
  label: string;
  value: number;
  currency: string;
  owed: number;
  hasTarget: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="rounded-2xl border border-border bg-background p-3">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <Input
        inputMode="decimal"
        value={value === 0 ? "" : String(value)}
        placeholder="0"
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(e.target.value.trim() && Number.isFinite(n) ? n : 0);
        }}
        className="mt-1 h-9 rounded-xl"
      />
      {hasTarget ? (
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {owed > 0 ? `${formatMoney(owed, currency)} left of their half` : "Half covered"}
        </span>
      ) : null}
    </label>
  );
}
