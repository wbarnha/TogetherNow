import type { Owner, Place, PlaceCategory } from "./types";

export type ParsedPlace = {
  name: string;
  address?: string | undefined;
  note?: string | undefined;
  url?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
};

/** Stable id so re-importing the same list updates instead of duplicating. */
export function placeId(p: ParsedPlace) {
  const key =
    p.url?.trim().toLowerCase() ||
    `${p.name.trim().toLowerCase()}|${p.address?.trim().toLowerCase() ?? ""}|${
      p.lat != null && p.lng != null ? `${p.lat.toFixed(4)},${p.lng.toFixed(4)}` : ""
    }`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `place-${(h >>> 0).toString(36)}`;
}

export function toPlace(p: ParsedPlace, owner: Owner, source: Place["source"]): Place {
  return {
    id: placeId(p),
    name: p.name.trim(),
    address: p.address?.trim() || undefined,
    note: p.note?.trim() || undefined,
    url: p.url?.trim() || undefined,
    lat: p.lat,
    lng: p.lng,
    owner,
    source,
    visited: false,
    updatedAt: Date.now(),
  };
}

/* ------------------------------- CSV ---------------------------------- */

/** Minimal RFC 4180 reader: handles quoted fields, embedded commas/newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function pick(headers: string[], row: string[], names: string[]) {
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i >= 0 && row[i]?.trim()) return row[i]!.trim();
  }
  return undefined;
}

/** Google Maps / Takeout saved-list CSV: Title, Note, URL, Comment, Tags. */
export function parsePlacesCsv(text: string): ParsedPlace[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const out: ParsedPlace[] = [];
  for (const row of rows.slice(1)) {
    const name = pick(headers, row, ["title", "name", "place", "location"]);
    if (!name) continue;
    const url = pick(headers, row, ["url", "link", "google maps url"]);
    const lat = Number(pick(headers, row, ["latitude", "lat"]) ?? NaN);
    const lng = Number(pick(headers, row, ["longitude", "lng", "lon", "long"]) ?? NaN);
    const coords = url ? coordsFromUrl(url) : null;
    out.push({
      name,
      address: pick(headers, row, ["address", "formatted address", "vicinity"]),
      note: pick(headers, row, ["note", "comment", "notes", "description"]),
      url,
      lat: Number.isFinite(lat) ? lat : coords?.lat,
      lng: Number.isFinite(lng) ? lng : coords?.lng,
    });
  }
  return out;
}

/* ----------------------------- GeoJSON --------------------------------- */

/** Takeout "Saved Places.json" and generic GeoJSON point collections. */
export function parsePlacesGeoJson(text: string): ParsedPlace[] {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const features: any[] = Array.isArray(data?.features)
    ? data.features
    : Array.isArray(data)
      ? data
      : [];
  const out: ParsedPlace[] = [];
  for (const f of features) {
    const props = f?.properties ?? {};
    const loc = props.location ?? props.Location ?? {};
    const name = loc.name ?? props.name ?? props.title ?? props.Title;
    if (!name) continue;
    const coords = f?.geometry?.coordinates;
    out.push({
      name: String(name),
      address: loc.address ?? props.address ?? undefined,
      note: props.comment ?? props.note ?? props.description ?? undefined,
      url: props.google_maps_url ?? props.url ?? undefined,
      lng: Array.isArray(coords) ? Number(coords[0]) : undefined,
      lat: Array.isArray(coords) ? Number(coords[1]) : undefined,
    });
  }
  return out;
}

/* ------------------------- KML / GPX / vCard ---------------------------- */

function xmlDoc(text: string) {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(text, "application/xml");
  return doc.querySelector("parsererror") ? null : doc;
}

/** Google My Maps / saved-list KML export. */
export function parsePlacesKml(text: string): ParsedPlace[] {
  const doc = xmlDoc(text);
  if (!doc) return [];
  const out: ParsedPlace[] = [];
  for (const pm of Array.from(doc.getElementsByTagName("Placemark"))) {
    const name = pm.getElementsByTagName("name")[0]?.textContent?.trim();
    if (!name) continue;
    const coordText = pm.getElementsByTagName("coordinates")[0]?.textContent?.trim();
    const [lng, lat] = (coordText ?? "").split(",").map(Number);
    const desc = pm.getElementsByTagName("description")[0]?.textContent?.trim();
    out.push({
      name,
      address: pm.getElementsByTagName("address")[0]?.textContent?.trim() || undefined,
      note: desc ? desc.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    });
  }
  return out;
}

/** GPX waypoints — what most map apps hand you when you export pins. */
export function parsePlacesGpx(text: string): ParsedPlace[] {
  const doc = xmlDoc(text);
  if (!doc) return [];
  const out: ParsedPlace[] = [];
  for (const wpt of Array.from(doc.getElementsByTagName("wpt"))) {
    const name =
      wpt.getElementsByTagName("name")[0]?.textContent?.trim() ||
      wpt.getElementsByTagName("desc")[0]?.textContent?.trim();
    if (!name) continue;
    const lat = Number(wpt.getAttribute("lat"));
    const lng = Number(wpt.getAttribute("lon"));
    out.push({
      name,
      note: wpt.getElementsByTagName("desc")[0]?.textContent?.trim() || undefined,
      url: wpt.getElementsByTagName("link")[0]?.getAttribute("href") ?? undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    });
  }
  return out;
}

/** Apple Maps shares a place as a vCard (.vcf) with address and geo. */
export function parsePlacesVcard(text: string): ParsedPlace[] {
  const out: ParsedPlace[] = [];
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  for (const card of cards) {
    const lines = card.replace(/\n[ \t]/g, "").split(/\r?\n/);
    let name: string | undefined;
    let address: string | undefined;
    let url: string | undefined;
    let lat: number | undefined;
    let lng: number | undefined;
    for (const line of lines) {
      const [rawKey, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      const key = (rawKey ?? "").split(";")[0]?.toUpperCase();
      if (!value) continue;
      if (key === "FN") name = value;
      else if (key === "ADR")
        address = value.split(";").filter(Boolean).join(", ").replace(/\\,/g, ",");
      else if (key === "URL") url = value;
      else if (key === "GEO") {
        const [a, b] = value.replace(/^geo:/i, "").split(/[;,]/).map(Number);
        if (Number.isFinite(a)) lat = a;
        if (Number.isFinite(b)) lng = b;
      }
    }
    if (name) out.push({ name, address, url, lat, lng });
  }
  return out;
}

/* ------------------------------ URLs ----------------------------------- */

export function coordsFromUrl(url: string): { lat: number; lng: number } | null {
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const q = url.match(/[?&](?:q|ll|daddr|sll|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  const m = at ?? q;
  if (!m) return null;
  return { lat: Number(m[1]), lng: Number(m[2]) };
}

/** Pasted Google Maps / Apple Maps share links, one per line. */
export function parsePlacesUrls(text: string): ParsedPlace[] {
  const out: ParsedPlace[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/https?:\/\/\S+/);
    if (!match) continue;
    const url = match[0];
    const label = line.slice(0, match.index).replace(/[-–—:•]\s*$/, "").trim();
    let name = label;
    if (!name) {
      try {
        const u = new URL(url);
        const qName = u.searchParams.get("q") ?? u.searchParams.get("name");
        const pathName = u.pathname.match(/\/place\/([^/@]+)/)?.[1];
        name = decodeURIComponent(pathName ?? qName ?? "").replace(/\+/g, " ").trim();
        if (/^-?\d+\.\d+,/.test(name)) name = "";
        if (!name) name = u.hostname.includes("apple") ? "Apple Maps place" : "Google Maps place";
      } catch {
        name = "Saved place";
      }
    }
    const coords = coordsFromUrl(url);
    out.push({ name, url, lat: coords?.lat, lng: coords?.lng });
  }
  return out;
}

/* ---------------------------- dispatcher -------------------------------- */

export type PlaceSourceFormat = "csv" | "geojson" | "kml" | "gpx" | "vcard" | "urls";

export function detectFormat(text: string, fileName?: string): PlaceSourceFormat {
  const ext = fileName?.toLowerCase().split(".").pop();
  if (ext === "csv") return "csv";
  if (ext === "json" || ext === "geojson") return "geojson";
  if (ext === "kml") return "kml";
  if (ext === "gpx") return "gpx";
  if (ext === "vcf") return "vcard";

  const head = text.trimStart().slice(0, 400);
  if (/^BEGIN:VCARD/i.test(head)) return "vcard";
  if (head.startsWith("{") || head.startsWith("[")) return "geojson";
  if (/<gpx/i.test(head)) return "gpx";
  if (/<kml|<Placemark/i.test(head)) return "kml";
  if (/^https?:\/\//im.test(head)) return "urls";
  return "csv";
}

export function parsePlaces(text: string, fileName?: string): ParsedPlace[] {
  const format = detectFormat(text, fileName);
  const byFormat: Record<PlaceSourceFormat, (t: string) => ParsedPlace[]> = {
    csv: parsePlacesCsv,
    geojson: parsePlacesGeoJson,
    kml: parsePlacesKml,
    gpx: parsePlacesGpx,
    vcard: parsePlacesVcard,
    urls: parsePlacesUrls,
  };
  const parsed = byFormat[format](text);
  // Fall back to link scraping so a half-recognised paste still yields places.
  if (parsed.length === 0 && format !== "urls") return parsePlacesUrls(text);
  return parsed;
}

/** Best link for opening a place in the phone's map app. */
export function mapLink(place: Place) {
  if (place.url) return place.url;
  if (place.lat != null && place.lng != null) {
    return `https://maps.google.com/?q=${place.lat},${place.lng}`;
  }
  const query = [place.name, place.address].filter(Boolean).join(" ");
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

/* --------------------------- deduplication ------------------------------ */

/* ---------------------------- categories -------------------------------- */

export const PLACE_CATEGORIES = [
  { value: "food", label: "Food" },
  { value: "drinks", label: "Coffee & drinks" },
  { value: "outdoors", label: "Outdoors" },
  { value: "culture", label: "Culture" },
  { value: "nightlife", label: "Nightlife" },
  { value: "stay", label: "Stays" },
  { value: "shopping", label: "Shopping" },
  { value: "other", label: "Other" },
] as const satisfies ReadonlyArray<{ value: PlaceCategory; label: string }>;

const CATEGORY_HINTS: [PlaceCategory, RegExp][] = [
  [
    "food",
    /\b(restaurant|pizz|sushi|ramen|taco|burger|bistro|kitchen|grill|diner|bbq|noodle|deli|bakery|pastr|brunch|steak|thai|curry|trattoria|osteria|eatery|food)\b/,
  ],
  [
    "drinks",
    /\b(coffee|cafe|caf[eé]|espresso|roaster|tea ?house|boba|juice|smoothie)\b/,
  ],
  [
    "nightlife",
    /\b(bar|pub|tavern|brewery|brewpub|taproom|cocktail|wine ?bar|club|lounge|speakeasy|karaoke)\b/,
  ],
  [
    "outdoors",
    /\b(park|trail|hike|hiking|beach|lake|garden|mountain|falls|forest|canyon|island|overlook|viewpoint|botanic|zoo|campground)\b/,
  ],
  [
    "culture",
    /\b(museum|gallery|theat|cinema|movie|opera|concert|library|aquarium|historic|castle|cathedral|temple|shrine|memorial|observatory)\b/,
  ],
  ["stay", /\b(hotel|hostel|motel|inn|resort|airbnb|bnb|lodge|cabin|suites)\b/],
  [
    "shopping",
    /\b(shop|store|market|mall|boutique|bookstore|books|thrift|vintage|record)\b/,
  ],
];

/** Best-guess category from the place's name, note and address. */
export function guessCategory(place: {
  name?: string | undefined;
  note?: string | undefined;
  address?: string | undefined;
}): PlaceCategory {
  const text = `${place.name ?? ""} ${place.note ?? ""} ${place.address ?? ""}`.toLowerCase();
  for (const [category, pattern] of CATEGORY_HINTS) {
    if (pattern.test(text)) return category;
  }
  return "other";
}

/** The category to show/filter on: what the user set, else the guess. */
export function placeCategory(place: Place): PlaceCategory {
  return place.category ?? guessCategory(place);
}

export function categoryLabel(category: PlaceCategory) {
  return PLACE_CATEGORIES.find((c) => c.value === category)?.label ?? "Other";
}

/** Human distance, metric-free so it reads fine anywhere. */
export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

const NOISE_WORDS = new Set([
  "the", "a", "an", "of", "and", "&", "at", "in", "on",
  "restaurant", "cafe", "coffee", "bar", "shop", "store", "co", "inc", "llc",
]);

/** Lowercase, accent-free, punctuation-free comparison form of a place name. */
export function normalizeName(raw: string | undefined) {
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(raw: string | undefined) {
  return normalizeName(raw)
    .split(" ")
    .filter((t) => t.length > 1 && !NOISE_WORDS.has(t));
}

/** 0-1 similarity between two place names (token overlap, containment aware). */
export function nameSimilarity(a: string | undefined, b: string | undefined) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const union = ta.size + tb.size - shared;
  const jaccard = shared / union;
  const containment = shared / Math.min(ta.size, tb.size);
  return Math.max(jaccard, containment * 0.95);
}

/** Great-circle distance in metres, or null when either point is unknown. */
export function distanceMeters(
  a: { lat?: number | undefined; lng?: number | undefined },
  b: { lat?: number | undefined; lng?: number | undefined },
) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const COORD_MATCH_METRES = 120;
const NAME_MATCH_SCORE = 0.72;

type PlaceLike = ParsedPlace | Place;

function normalizedUrl(u: string | undefined) {
  if (!u) return "";
  try {
    const parsed = new URL(u.trim());
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

/** True when two entries almost certainly describe the same real-world place. */
export function isSamePlace(a: PlaceLike, b: PlaceLike) {
  const ua = normalizedUrl(a.url);
  const ub = normalizedUrl(b.url);
  if (ua && ua === ub) return true;

  const dist = distanceMeters(a, b);
  const score = nameSimilarity(a.name, b.name);

  if (dist != null) {
    if (dist <= 25) return true; // same pin, whatever it is called
    if (dist <= COORD_MATCH_METRES && score >= 0.5) return true;
    if (dist > COORD_MATCH_METRES) return false; // clearly different locations
  }

  if (score >= NAME_MATCH_SCORE) {
    const aa = normalizeName(a.address);
    const bb = normalizeName(b.address);
    if (!aa || !bb) return true;
    return aa === bb || aa.includes(bb) || bb.includes(aa) || nameSimilarity(aa, bb) >= 0.6;
  }
  return false;
}

function longer(a: string | undefined, b: string | undefined) {
  const av = a?.trim() ?? "";
  const bv = b?.trim() ?? "";
  return (av.length >= bv.length ? av : bv) || undefined;
}

/** Combine two duplicates, keeping the richest field from each. */
export function mergeParsed(a: ParsedPlace, b: ParsedPlace): ParsedPlace {
  return {
    name: longer(a.name, b.name) ?? a.name,
    address: longer(a.address, b.address),
    note: longer(a.note, b.note),
    url: a.url ?? b.url,
    lat: a.lat ?? b.lat,
    lng: a.lng ?? b.lng,
  };
}

/** Collapse duplicates inside a freshly parsed list. */
export function dedupeParsed(list: ParsedPlace[]) {
  const out: ParsedPlace[] = [];
  let merged = 0;
  for (const p of list) {
    const i = out.findIndex((x) => isSamePlace(x, p));
    if (i >= 0) {
      out[i] = mergeParsed(out[i]!, p);
      merged++;
    } else out.push(p);
  }
  return { places: out, merged };
}

/** Find an already-saved idea that matches a parsed place. */
export function findExistingPlace(p: ParsedPlace, existing: Place[]) {
  return existing.find((x) => x.id === placeId(p) || isSamePlace(x, p));
}
