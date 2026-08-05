import { digestOf } from "./digest";
import type { Owner } from "./types";

export type WatchService = "netflix" | "hulu" | "steam" | "crunchyroll" | "other";

export type ParsedWatch = {
  title: string;
  /** episode / chapter detail pulled out of the title when present */
  detail?: string | undefined;
  /**
   * Epoch ms, or null when the export carries no usable date.
   *
   * This used to default to `Date.now()`, which then went into the entry id —
   * so re-importing the same file produced a different id for every undated
   * row and duplicated all of them, every time.
   */
  at: number | null;
  /** minutes watched or played, when the export tells us */
  minutes?: number | undefined;
};

export type ParsedWatchFile = {
  service: WatchService;
  entries: ParsedWatch[];
};

export const WATCH_SERVICES: {
  id: WatchService;
  name: string;
  accent: string;
  kind: "watch" | "play";
  how: string;
}[] = [
  {
    id: "netflix",
    name: "Netflix",
    accent: "#e50914",
    kind: "watch",
    how: "Account → Profile → Viewing activity → Download all (NetflixViewingHistory.csv).",
  },
  {
    id: "hulu",
    name: "Hulu",
    accent: "#1ce783",
    kind: "watch",
    how: "Account → Privacy and Settings → Request your data, then pick the watch history CSV/JSON.",
  },
  {
    id: "steam",
    name: "Steam",
    accent: "#66c0f4",
    kind: "play",
    how: "Help → Steam Support → Licenses & game history, or paste a GetOwnedGames JSON response.",
  },
  {
    id: "crunchyroll",
    name: "Crunchyroll",
    accent: "#f47521",
    kind: "watch",
    how: "Profile → History (or your GDPR data export) exported as CSV.",
  },
  {
    id: "other",
    name: "Other",
    accent: "#8b7d8b",
    kind: "watch",
    how: "Any CSV with a title and a date column.",
  },
];

export function serviceMeta(id: WatchService) {
  return WATCH_SERVICES.find((s) => s.id === id) ?? WATCH_SERVICES[WATCH_SERVICES.length - 1]!;
}

/* -------------------------------- parsing -------------------------------- */

/** Minimal RFC 4180 CSV parser. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
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
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim().length));
}

/** Netflix writes 12/31/24 or 31/12/2024 depending on locale; be forgiving. */
export function parseDateish(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{9,}$/.test(s)) {
    const n = Number(s);
    return s.length > 10 ? n : n * 1000;
  }
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const [, a, b, y] = slash as unknown as [string, string, string, string];
    let year = Number(y);
    if (year < 100) year += 2000;
    let month = Number(a);
    let day = Number(b);
    if (month > 12) {
      const t = month;
      month = day;
      day = t;
    }
    return new Date(year, month - 1, day, 20, 0, 0).getTime();
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

/** "Show: Season 1: Episode name" → title + detail */
export function splitTitle(raw: string): { title: string; detail?: string } {
  const parts = raw
    .split(":")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return { title: raw.trim() };
  const [title, ...rest] = parts;
  return { title: title!, detail: rest.join(" · ") };
}

function headerIndex(header: string[], candidates: string[]) {
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.findIndex((h) => h === c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = lower.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

export function detectService(fileName: string, text: string): WatchService {
  const n = fileName.toLowerCase();
  const head = text.slice(0, 2000).toLowerCase();
  if (n.includes("netflix") || head.includes("netflixviewinghistory")) return "netflix";
  if (n.includes("hulu")) return "hulu";
  if (n.includes("steam") || head.includes("playtime_forever") || head.includes("appid"))
    return "steam";
  if (n.includes("crunchyroll") || head.includes("crunchyroll")) return "crunchyroll";
  return "other";
}

/** Steam GetOwnedGames / GetRecentlyPlayedGames JSON. */
function parseSteamJson(text: string): ParsedWatch[] | null {
  try {
    const data = JSON.parse(text) as {
      response?: { games?: unknown[] };
      games?: unknown[];
    };
    const games = (data.response?.games ?? data.games) as
      | {
          name?: string;
          playtime_forever?: number;
          playtime_2weeks?: number;
          rtime_last_played?: number;
        }[]
      | undefined;
    if (!Array.isArray(games)) return null;
    return games
      .filter((g) => g && typeof g.name === "string")
      .map((g) => ({
        title: g.name!,
        at: g.rtime_last_played ? g.rtime_last_played * 1000 : null,
        minutes: g.playtime_2weeks ?? g.playtime_forever ?? undefined,
      }));
  } catch {
    return null;
  }
}

/** Hulu / Instagram-style JSON arrays of viewing records. */
function parseGenericJson(text: string): ParsedWatch[] | null {
  try {
    const data = JSON.parse(text) as unknown;
    const list = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown>)?.["history"])
        ? ((data as Record<string, unknown>)["history"] as unknown[])
        : Array.isArray((data as Record<string, unknown>)?.["items"])
          ? ((data as Record<string, unknown>)["items"] as unknown[])
          : null;
    if (!list) return null;
    const out: ParsedWatch[] = [];
    for (const raw of list) {
      const row = raw as Record<string, unknown>;
      const title =
        (row["title"] as string) ??
        (row["name"] as string) ??
        (row["series"] as string) ??
        (row["content_title"] as string);
      if (typeof title !== "string" || !title.trim()) continue;
      const when =
        (row["date"] as string) ??
        (row["watched_at"] as string) ??
        (row["timestamp"] as string) ??
        (row["last_watched"] as string) ??
        "";
      const at = parseDateish(String(when));
      const mins = Number(row["minutes"] ?? row["duration_minutes"] ?? NaN);
      const split = splitTitle(title);
      out.push({
        title: split.title,
        detail: split.detail,
        at,
        minutes: Number.isFinite(mins) ? mins : undefined,
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function parseCsvHistory(text: string): ParsedWatch[] | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const header = rows[0]!;
  const ti = headerIndex(header, ["title", "name", "show", "content", "game"]);
  const di = headerIndex(header, ["date", "watched", "last played", "timestamp", "time"]);
  const mi = headerIndex(header, ["minutes", "playtime", "duration"]);
  if (ti < 0) return null;
  const out: ParsedWatch[] = [];
  for (const row of rows.slice(1)) {
    const rawTitle = (row[ti] ?? "").trim();
    if (!rawTitle) continue;
    const at = di >= 0 ? parseDateish(row[di] ?? "") : null;
    const mins = mi >= 0 ? Number((row[mi] ?? "").replace(/[^\d.]/g, "")) : NaN;
    const split = splitTitle(rawTitle);
    out.push({
      title: split.title,
      detail: split.detail,
      at,
      minutes: Number.isFinite(mins) && mins > 0 ? mins : undefined,
    });
  }
  return out.length ? out : null;
}

export function parseWatchFile(text: string, fileName: string): ParsedWatchFile | null {
  const service = detectService(fileName, text);
  const trimmed = text.trim();
  const entries =
    trimmed.startsWith("{") || trimmed.startsWith("[")
      ? (parseSteamJson(trimmed) ?? parseGenericJson(trimmed))
      : parseCsvHistory(trimmed);
  if (!entries || !entries.length) return null;
  return { service, entries: entries.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)) };
}

/* -------------------------------- stable ids ----------------------------- */

function hash32(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function watchId(service: WatchService, at: number, title: string, detail?: string) {
  return `w-${service}-${digestOf(service, at, title, detail)}`;
}

/** The id this entry would have had before the digest changed. */
export function legacyWatchId(service: WatchService, at: number, title: string, detail?: string) {
  return `w-${service}-${hash32(`${service}|${at}|${title}|${detail ?? ""}`)}`;
}

/**
 * Id for a row whose export carried no date.
 *
 * Derived from what the file actually says rather than from the clock, so the
 * same row gets the same id on every import. `occurrence` separates rows that
 * are identical in every other respect — two plays of the same episode listed
 * twice with no timestamps — and is the row's index among its own duplicates,
 * not its position in the file, so adding unrelated rows does not renumber it.
 *
 * The file name is deliberately not part of this: browsers hand back
 * "history (1).csv" on a second download of the same export.
 */
export function undatedWatchId(
  service: WatchService,
  title: string,
  detail: string | undefined,
  occurrence: number,
) {
  return `w-${service}-u-${digestOf(service, title, detail, occurrence)}`;
}

/** The id an undated entry would have had before the digest changed. */
export function legacyUndatedWatchId(
  service: WatchService,
  title: string,
  detail: string | undefined,
  occurrence: number,
) {
  return `w-${service}-u-${hash32(`${service}|${title}|${detail ?? ""}|${occurrence}`)}`;
}

/**
 * Stable id for a parsed row, dated or not.
 *
 * `seen` counts how many identical undated rows have already been assigned an
 * id, so callers walk a file's rows in order through one shared map.
 *
 * The count is kept per service because the id is: the same title on Netflix
 * and on Steam are different rows and each starts at occurrence 0. An import
 * never notices, since one file is one service, but a caller sweeping a whole
 * archive would otherwise number the second service's rows as repeats of the
 * first and produce ids no fresh import could reproduce.
 */
export function parsedWatchId(
  service: WatchService,
  entry: ParsedWatch,
  seen: Map<string, number>,
) {
  if (entry.at !== null) return watchId(service, entry.at, entry.title, entry.detail);
  const key = `${service}|${entry.title}|${entry.detail ?? ""}`;
  const occurrence = seen.get(key) ?? 0;
  seen.set(key, occurrence + 1);
  return undatedWatchId(service, entry.title, entry.detail, occurrence);
}

/* --------------------------------- stats --------------------------------- */

export type WatchLike = {
  service: WatchService;
  title: string;
  owner: "me" | "them";
  at: number;
  minutes?: number | undefined;
};

/** Rough runtime estimate when the export gives us none. */
export function minutesOf(e: WatchLike) {
  if (typeof e.minutes === "number" && e.minutes > 0) return e.minutes;
  return e.service === "steam" ? 60 : 35;
}

export function serviceTotals(entries: WatchLike[]) {
  return WATCH_SERVICES.filter(
    (s) => s.id !== "other" || entries.some((e) => e.service === "other"),
  )
    .map((s) => {
      const mine = entries.filter((e) => e.service === s.id && e.owner === "me");
      const theirs = entries.filter((e) => e.service === s.id && e.owner === "them");
      return {
        service: s,
        mine: mine.length,
        theirs: theirs.length,
        myMinutes: mine.reduce((n, e) => n + minutesOf(e), 0),
        theirMinutes: theirs.reduce((n, e) => n + minutesOf(e), 0),
      };
    })
    .filter((t) => t.mine + t.theirs > 0);
}

export type TitleRow = {
  key: string;
  title: string;
  service: WatchService;
  mine: number;
  theirs: number;
  lastAt: number;
};

export function titleRows(entries: WatchLike[]): TitleRow[] {
  const map = new Map<string, TitleRow>();
  for (const e of entries) {
    const key = `${e.service}|${e.title.toLowerCase()}`;
    const row =
      map.get(key) ??
      ({ key, title: e.title, service: e.service, mine: 0, theirs: 0, lastAt: 0 } as TitleRow);
    if (e.owner === "me") row.mine += 1;
    else row.theirs += 1;
    row.lastAt = Math.max(row.lastAt, e.at);
    map.set(key, row);
  }
  return [...map.values()];
}

/** Titles you have both spent time with — the "watch together" shortlist. */
export function sharedTitles(entries: WatchLike[]) {
  return titleRows(entries)
    .filter((r) => r.mine > 0 && r.theirs > 0)
    .sort((a, b) => b.mine + b.theirs - (a.mine + a.theirs));
}

/** Titles only one of you has touched — what to recommend to the other. */
export function soloTitles(entries: WatchLike[], owner: "me" | "them") {
  return titleRows(entries)
    .filter((r) => (owner === "me" ? r.mine > 0 && r.theirs === 0 : r.theirs > 0 && r.mine === 0))
    .sort((a, b) => b.lastAt - a.lastAt);
}

/** Per-week totals for the last `weeks` weeks, oldest first. */
export function weeklyMinutes(entries: WatchLike[], weeks = 8, now = Date.now()) {
  const week = 7 * 24 * 60 * 60 * 1000;
  const start = now - weeks * week;
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    start: start + i * week,
    mine: 0,
    theirs: 0,
  }));
  for (const e of entries) {
    if (e.at < start || e.at > now) continue;
    const i = Math.min(weeks - 1, Math.floor((e.at - start) / week));
    const bucket = buckets[i]!;
    if (e.owner === "me") bucket.mine += minutesOf(e);
    else bucket.theirs += minutesOf(e);
  }
  return buckets;
}

export function formatMinutes(total: number) {
  if (total < 60) return `${Math.round(total)}m`;
  const hours = total / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

export function ownerOf(owner: Owner): "me" | "them" {
  return owner === "them" ? "them" : "me";
}
