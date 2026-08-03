import { wallTimeToInstant } from "./time";
import type { AppState, Milestone, PlanEvent } from "./types";

const PRODID = "-//Together Now//Shared Calendar//EN";

function escapeText(v: string) {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold long lines at 75 octets per RFC 5545. */
function fold(line: string) {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) parts.push(" " + rest);
  return parts.join("\r\n");
}

function utcStamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function dateStamp(iso: string) {
  return iso.replace(/-/g, "");
}

function nextDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

function uid(id: string) {
  return `${id}@together-now`;
}

function eventBlock(e: PlanEvent, zone: string, stamp: string, durationMinutes: number) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid(e.id)}`,
    `DTSTAMP:${stamp}`,
    `SUMMARY:${escapeText(e.title)}`,
  ];
  if (e.time) {
    const start = wallTimeToInstant(e.date, e.time, zone);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${dateStamp(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
    );
  }
  if (e.notes) lines.push(`DESCRIPTION:${escapeText(e.notes)}`);
  lines.push("END:VEVENT");
  return lines;
}

function milestoneBlock(m: Milestone, stamp: string) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid(m.id)}`,
    `DTSTAMP:${stamp}`,
    `SUMMARY:${escapeText(m.title)}`,
    `DTSTART;VALUE=DATE:${dateStamp(m.date)}`,
    `DTEND;VALUE=DATE:${nextDay(m.date)}`,
  ];
  if (m.recurring) lines.push("RRULE:FREQ=YEARLY");
  lines.push("END:VEVENT");
  return lines;
}

export type ExportOptions = {
  /** include one-off plans */
  includeEvents: boolean;
  /** include birthdays, anniversaries and other dates */
  includeMilestones: boolean;
  /** default length given to timed plans, in minutes */
  durationMinutes?: number;
  calendarName?: string;
};

/** Build an RFC 5545 calendar from the couple's plans and milestones. */
export function buildIcs(state: AppState, opts: ExportOptions) {
  const stamp = utcStamp(new Date());
  const name = opts.calendarName ?? "Together Now";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
  ];

  if (opts.includeEvents) {
    for (const e of [...state.events].sort((a, b) => a.date.localeCompare(b.date))) {
      const zone = e.anchor === "me" ? state.me.timeZone : state.them.timeZone;
      lines.push(...eventBlock(e, zone, stamp, opts.durationMinutes ?? 60));
    }
  }
  if (opts.includeMilestones) {
    for (const m of [...state.milestones].sort((a, b) => a.date.localeCompare(b.date))) {
      lines.push(...milestoneBlock(m, stamp));
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function icsFileName(name = "together-now") {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${name}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.ics`;
}

export function downloadIcs(content: string, fileName = icsFileName()) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
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
export async function shareIcs(content: string, fileName = icsFileName()) {
  try {
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    const file = new File([content], fileName, { type: "text/calendar" });
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: "Together Now calendar" });
      return true;
    }
  } catch {
    /* user cancelled or sharing unsupported */
  }
  return false;
}
