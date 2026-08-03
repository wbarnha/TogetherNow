import type { AppState, Place } from "./types";
import { mapLink } from "./places";

export type PlacesExportOptions = {
  includeWant?: boolean;
  includeVisited?: boolean;
};

export function selectPlaces(
  places: Place[],
  { includeWant = true, includeVisited = true }: PlacesExportOptions = {},
) {
  return places
    .filter((p) => (p.visited ? includeVisited : includeWant))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const CSV_HEADERS = [
  "Title",
  "Address",
  "Note",
  "URL",
  "Latitude",
  "Longitude",
  "Owner",
  "Source",
  "Visited",
] as const;

function csvCell(value: string | number | undefined) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV with Google-Maps-compatible column names, so it re-imports cleanly
 * here and opens in Sheets/Numbers/Excel.
 */
export function buildPlacesCsv(places: Place[]) {
  const lines = [CSV_HEADERS.join(",")];
  for (const p of places) {
    lines.push(
      [
        csvCell(p.name),
        csvCell(p.address),
        csvCell(p.note),
        csvCell(p.url ?? mapLink(p)),
        csvCell(p.lat),
        csvCell(p.lng),
        csvCell(p.owner),
        csvCell(p.source),
        csvCell(p.visited ? "yes" : "no"),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Plain-text list for pasting into a chat. */
export function buildPlacesShareText(places: Place[], state: AppState) {
  const title = `Date ideas — ${state.me.name || "Me"} & ${state.them.name || "Them"}`;
  const body = places.map((p) => {
    const parts = [`• ${p.name}${p.visited ? " (been)" : ""}`];
    if (p.address) parts.push(`  ${p.address}`);
    if (p.note) parts.push(`  ${p.note}`);
    const link = p.url ?? mapLink(p);
    if (link) parts.push(`  ${link}`);
    return parts.join("\n");
  });
  return [title, "", ...body].join("\n");
}

export function placesCsvFileName(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return `together-now-ideas-${stamp}.csv`;
}

export function downloadPlacesCsv(content: string, fileName = placesCsvFileName()) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Native share sheet on phones; returns false when unavailable. */
export async function sharePlacesCsv(content: string, fileName = placesCsvFileName()) {
  try {
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    const file = new File([content], fileName, { type: "text/csv" });
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: "Together Now date ideas" });
      return true;
    }
  } catch {
    /* cancelled or unsupported */
  }
  return false;
}
