import { differenceInCalendarDays, parseISO } from "date-fns";

export const TIME_ZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

export function zoneLabel(tz: string) {
  const city = tz.split("/").pop() ?? tz;
  return city.replace(/_/g, " ");
}

/** Offset of a timezone from UTC in minutes at a given instant. */
export function zoneOffsetMinutes(tz: string, at: Date = new Date()) {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(at);
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

export function formatInZone(date: Date, tz: string, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", opts).format(date);
  }
}

export function clockIn(tz: string, at: Date = new Date()) {
  return formatInZone(at, tz, { hour: "numeric", minute: "2-digit", hour12: true });
}

export function dayIn(tz: string, at: Date = new Date()) {
  return formatInZone(at, tz, { weekday: "short", month: "short", day: "numeric" });
}

export function hourIn(tz: string, at: Date = new Date()) {
  return Number(formatInZone(at, tz, { hour: "2-digit", hour12: false }).replace(/\D/g, ""));
}

/** Difference in whole hours between two zones (them relative to me). */
export function hourGap(mine: string, theirs: string, at: Date = new Date()) {
  return (zoneOffsetMinutes(theirs, at) - zoneOffsetMinutes(mine, at)) / 60;
}

export function gapLabel(gap: number) {
  if (gap === 0) return "same time as you";
  const abs = Math.abs(gap);
  const unit = abs === 1 ? "hour" : "hours";
  const rounded = Number.isInteger(abs) ? abs : abs.toFixed(1);
  return `${rounded} ${unit} ${gap > 0 ? "ahead" : "behind"}`;
}

export function wallTimeToInstant(dateISO: string, time: string, zone: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  let offset = zoneOffsetMinutes(zone, new Date(naive));
  offset = zoneOffsetMinutes(zone, new Date(naive - offset * 60000));
  return new Date(naive - offset * 60000);
}

/**
 * Convert a wall-clock time in one zone to the wall-clock time in another zone,
 * on a given calendar date.
 */
export function convertWallTime(dateISO: string, time: string, fromZone: string, toZone: string) {
  const instant = wallTimeToInstant(dateISO, time, fromZone);
  return {
    time: formatInZone(instant, toZone, { hour: "numeric", minute: "2-digit", hour12: true }),
    day: formatInZone(instant, toZone, { weekday: "short", month: "short", day: "numeric" }),
    instant,
  };
}

/** Good-to-call = both people are between 08:00 and 22:59 local. */
export function callWindow(mine: string, theirs: string, at: Date = new Date()) {
  const a = hourIn(mine, at);
  const b = hourIn(theirs, at);
  const awake = (h: number) => h >= 8 && h < 23;
  return { mine: a, theirs: b, good: awake(a) && awake(b) };
}

export function startOfLocalDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function daysUntil(dateISO: string, from: Date = new Date()) {
  return differenceInCalendarDays(parseISO(dateISO), startOfLocalDay(from));
}

/** Next occurrence (this year or next) of a recurring date. */
export function nextOccurrence(dateISO: string, from: Date = new Date()) {
  const [, m, d] = dateISO.split("-").map(Number);
  const base = startOfLocalDay(from);
  let candidate = new Date(base.getFullYear(), (m ?? 1) - 1, d ?? 1);
  if (candidate < base) candidate = new Date(base.getFullYear() + 1, (m ?? 1) - 1, d ?? 1);
  return candidate;
}

export function toISODate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ordinalYears(dateISO: string, at: Date = new Date()) {
  const [y] = dateISO.split("-").map(Number);
  const next = nextOccurrence(dateISO, at);
  return next.getFullYear() - (y ?? next.getFullYear());
}
