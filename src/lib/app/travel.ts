import type { AppState, Trip, TravelMode, TravelOption } from "./types";

export const TRAVEL_MODES: { id: TravelMode; label: string }[] = [
  { id: "flight", label: "Flight" },
  { id: "train", label: "Train" },
  { id: "bus", label: "Bus" },
  { id: "drive", label: "Drive" },
  { id: "ferry", label: "Ferry" },
];

export const TRIP_STATUS: { id: Trip["status"]; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "researching", label: "Researching" },
  { id: "booked", label: "Booked" },
];

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR", "BRL"];

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Cheapest researched option, if any has a price. */
export function cheapestOption(trip: Trip): TravelOption | undefined {
  return trip.options
    .filter((o) => typeof o.cost === "number")
    .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0];
}

export function chosenOption(trip: Trip): TravelOption | undefined {
  return trip.options.find((o) => o.chosen);
}

/** Budget, savings progress and what each person still owes. */
export function tripBudget(trip: Trip) {
  const target = trip.budget ?? chosenOption(trip)?.cost ?? cheapestOption(trip)?.cost ?? 0;
  const saved = trip.savedByMe + trip.savedByThem;
  const remaining = Math.max(0, target - saved);
  const share = target / 2;
  return {
    target,
    saved,
    remaining,
    share,
    percent: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0,
    owedByMe: Math.max(0, share - trip.savedByMe),
    owedByThem: Math.max(0, share - trip.savedByThem),
  };
}

const enc = encodeURIComponent;

export type SearchLink = { id: string; label: string; url: string; hint: string };

/** One-tap searches prefilled with the trip's cities and dates. */
export function searchLinks(trip: Trip): SearchLink[] {
  const from = trip.origin.trim();
  const to = trip.destination.trim();
  const q = `${from} to ${to}`;
  const dates = [trip.startDate, trip.endDate].filter(Boolean).join(" ");
  const kayakDates = trip.startDate
    ? `/${trip.startDate}${trip.endDate ? `/${trip.endDate}` : ""}`
    : "";

  return [
    {
      id: "google-flights",
      label: "Google Flights",
      hint: "Fares & calendar view",
      url: `https://www.google.com/travel/flights?q=${enc(`Flights from ${from} to ${to} ${dates}`)}`,
    },
    {
      id: "skyscanner",
      label: "Skyscanner",
      hint: "Whole-month cheapest",
      url: `https://www.skyscanner.net/transport/flights/?adults=1&query=${enc(q)}`,
    },
    {
      id: "kayak",
      label: "Kayak",
      hint: "Flights & price alerts",
      url: `https://www.kayak.com/flights/${enc(from)}-${enc(to)}${kayakDates}`,
    },
    {
      id: "rome2rio",
      label: "Rome2Rio",
      hint: "Every route: rail, bus, ferry",
      url: `https://www.rome2rio.com/map/${enc(from)}/${enc(to)}`,
    },
    {
      id: "omio",
      label: "Omio",
      hint: "Trains & coaches",
      url: `https://www.omio.com/search-frontend/results?departurePosition=${enc(from)}&arrivalPosition=${enc(to)}`,
    },
    {
      id: "amtrak",
      label: "Amtrak",
      hint: "US rail",
      url: "https://www.amtrak.com/tickets/departure.html",
    },
    {
      id: "maps",
      label: "Driving route",
      hint: "Distance & drive time",
      url: `https://www.google.com/maps/dir/${enc(from)}/${enc(to)}`,
    },
  ];
}

/** A ready-to-paste research brief for ChatGPT or Claude. */
export function researchPrompt(trip: Trip, state: AppState) {
  const me = state.me.name || "me";
  const them = state.them.name || "my partner";
  const who = trip.traveller === "me" ? me : trip.traveller === "them" ? them : `${me} and ${them}`;
  const when = trip.startDate
    ? `Travelling around ${trip.startDate}${trip.endDate ? ` and returning ${trip.endDate}` : ""}.`
    : "Dates are flexible - flag the cheapest weeks.";
  const money = trip.budget
    ? `Total budget is about ${formatMoney(trip.budget, trip.currency)}.`
    : `Give prices in ${trip.currency}.`;
  const known = trip.options.length
    ? `\n\nWhat we've found so far:\n${trip.options
        .map(
          (o) =>
            `- ${o.mode}${o.carrier ? ` with ${o.carrier}` : ""}${
              typeof o.cost === "number" ? `, ${formatMoney(o.cost, trip.currency)}` : ""
            }${o.durationMinutes ? `, ${formatDuration(o.durationMinutes)}` : ""}${
              o.detail ? ` (${o.detail})` : ""
            }`,
        )
        .join("\n")}`
    : "";

  return `We're a long-distance couple planning a visit. ${who} needs to get from ${
    trip.origin || "our home city"
  } to ${trip.destination || "their city"}. ${when} ${money}

Please research and compare the realistic ways to make this trip:
1. Flights - likely airlines, typical fares, best booking window, nearby alternate airports worth checking.
2. Ground options - train, bus, ferry or driving, with rough cost and door-to-door time.
3. Total door-to-door time for each option, including getting to and from the stations/airports.
4. Money-savers: cheaper travel days, multi-city or split tickets, rail passes, points or student/youth fares.
5. Anything to watch out for: visas or entry rules, baggage fees, overnight layovers.

Finish with a short table ranking the options by cost and by travel time, and tell us which one you'd pick.${known}${
    trip.notes ? `\n\nExtra context: ${trip.notes}` : ""
  }`;
}
