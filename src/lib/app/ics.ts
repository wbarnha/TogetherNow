import { formatInZone } from "./time";
import type { Owner, PlanEvent } from "./types";

export type ParsedIcsEvent = {
  uid?: string | undefined;
  title: string;
  /** yyyy-MM-dd in the target zone */
  date: string;
  /** HH:mm in the target zone, omitted for all-day events */
  time?: string | undefined;
  notes?: string | undefined;
};

/** Unfold RFC 5545 continuation lines (leading space/tab). */
function unfold(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

function unescapeText(v: string) {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function splitLine(line: string) {
  const idx = line.indexOf(":");
  if (idx === -1) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: (name ?? "").toUpperCase(), params, value };
}

/**
 * Parse an ICS DTSTART into an instant, or an all-day calendar date.
 *
 * `fallbackZone` resolves floating times — a DTSTART with neither a trailing
 * `Z` nor a TZID. RFC 5545 says those are wall-clock time in whatever zone the
 * reader is in, and the import dialog asks precisely that question ("whose
 * clock were these times on?"). Treating them as UTC instead, as this did,
 * silently shifted every such event by the zone's offset: a 9am New York
 * appointment imported as 5am.
 */
function parseDateValue(
  value: string,
  params: Record<string, string>,
  fallbackZone: string,
): { allDay: true; date: string } | { allDay: false; instant: Date } | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly || params["VALUE"] === "DATE") {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { allDay: true, date: `${m[1]}-${m[2]}-${m[3]}` };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, z] = m;
  const naive = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mi),
    Number(ss ?? "0"),
  );
  if (z) return { allDay: false, instant: new Date(naive) };

  // Wall-clock time, in the calendar's own zone when it names one and in the
  // zone the user picked when it does not. Resolved twice because the offset
  // depends on the instant, which depends on the offset — one pass lands on
  // the wrong side of a daylight-saving boundary.
  const tz = params["TZID"] ?? fallbackZone;
  let offset = zoneOffset(tz, new Date(naive));
  offset = zoneOffset(tz, new Date(naive - offset * 60000));
  return { allDay: false, instant: new Date(naive - offset * 60000) };
}

function zoneOffset(tz: string, at: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUTC = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    );
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function instantToZoneParts(instant: Date, zone: string) {
  const date = formatInZone(instant, zone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [mo, d, y] = date.split("/");
  const time = formatInZone(instant, zone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(/^24:/, "00:");
  return { date: `${y}-${mo}-${d}`, time };
}

/**
 * Parse an .ics file into plain events, with all times expressed as wall-clock
 * time in `zone` (the anchor partner's time zone).
 */
export function parseIcs(raw: string, zone: string): ParsedIcsEvent[] {
  const lines = unfold(raw);
  const events: ParsedIcsEvent[] = [];
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null;
  let depth = 0;

  for (const line of lines) {
    const parsed = splitLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    if (name === "BEGIN" && value.trim().toUpperCase() === "VEVENT") {
      current = {};
      depth = 0;
      continue;
    }
    if (!current) continue;
    if (name === "BEGIN") {
      depth += 1; // nested VALARM etc.
      continue;
    }
    if (name === "END") {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      const props = current;
      current = null;
      const summary = props["SUMMARY"]?.value;
      const dtstart = props["DTSTART"];
      if (!dtstart) continue;
      const when = parseDateValue(dtstart.value, dtstart.params, zone);
      if (!when) continue;
      const notes = props["DESCRIPTION"]
        ? unescapeText(props["DESCRIPTION"].value)
        : props["LOCATION"]
          ? unescapeText(props["LOCATION"].value)
          : undefined;
      events.push({
        uid: props["UID"]?.value.trim(),
        title: summary ? unescapeText(summary) : "Untitled event",
        ...(when.allDay ? { date: when.date } : instantToZoneParts(when.instant, zone)),
        notes: notes || undefined,
      });
      continue;
    }
    if (depth > 0) continue;
    current[name] = { value, params };
  }

  return events.sort((a, b) =>
    `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`),
  );
}

/** Stable id so re-importing the same file updates instead of duplicating. */
export function icsEventId(e: ParsedIcsEvent) {
  const seed = e.uid || `${e.title}|${e.date}|${e.time ?? ""}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `ics-${Math.abs(h).toString(36)}`;
}

export function toPlanEvent(
  e: ParsedIcsEvent,
  opts: { anchor: "me" | "them"; owner: Owner },
): PlanEvent {
  return {
    id: icsEventId(e),
    title: e.title,
    date: e.date,
    time: e.time,
    anchor: opts.anchor,
    owner: opts.owner,
    notes: e.notes,
    updatedAt: Date.now(),
  };
}
