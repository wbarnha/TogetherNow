/**
 * Manual location lookup for the Ideas distance filter.
 *
 * Everything here is a direct browser call — no backend, no API key. Free-text
 * searches go to OpenStreetMap's Nominatim service, and pasted coordinates or
 * map links are parsed locally so the feature still works offline.
 */

export type GeoResult = {
  label: string;
  lat: number;
  lng: number;
};

/** Accepts "40.7128, -74.006", "40.7128 -74.006" or a map URL containing a pin. */
export function parseLatLng(raw: string): GeoResult | null {
  const text = raw.trim();
  if (!text) return null;

  const pair = text.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
  const fromUrl = text.match(/[@!/](-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  const m = fromUrl ?? pair;
  if (!m) return null;

  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng };
}

type NominatimRow = {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
};

/** Search a town, neighbourhood or address by name. Returns [] when nothing matches. */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), {
    signal: signal ?? null,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Location search failed (${res.status})`);

  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];

  return (rows as NominatimRow[])
    .map((r) => ({
      label: r.display_name || r.name || "",
      lat: Number(r.lat),
      lng: Number(r.lon),
    }))
    .filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/** Trim Nominatim's very long display names down to something readable. */
export function shortLabel(label: string, parts = 3) {
  const bits = label.split(",").map((s) => s.trim());
  return bits.length <= parts ? label : bits.slice(0, parts).join(", ");
}
