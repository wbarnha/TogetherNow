import { describe, expect, it } from "vitest";
import { icsEventId, parseIcs } from "../ics";

const sample = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:trip-1@togethernow
SUMMARY:Airport pickup
DTSTART:20260214T170000Z
DESCRIPTION:Terminal 4
END:VEVENT
BEGIN:VEVENT
UID:anniv@togethernow
SUMMARY:Anniversary
DTSTART;VALUE=DATE:20260601
END:VEVENT
END:VCALENDAR`;

describe("parseIcs", () => {
  it("reads timed and all-day events in order", () => {
    const events = parseIcs(sample, "UTC");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: "Airport pickup",
      date: "2026-02-14",
      time: "17:00",
      notes: "Terminal 4",
    });
    expect(events[1]).toMatchObject({ title: "Anniversary", date: "2026-06-01" });
    expect(events[1]!.time).toBeUndefined();
  });

  it("converts UTC stamps into the anchor zone", () => {
    const [first] = parseIcs(sample, "America/New_York");
    expect(first).toMatchObject({ date: "2026-02-14", time: "12:00" });
  });

  it("unfolds long folded lines", () => {
    const folded = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:folded
SUMMARY:A very long title that keeps
  going onto the next line
DTSTART;VALUE=DATE:20260101
END:VEVENT
END:VCALENDAR`;
    const [e] = parseIcs(folded, "UTC");
    expect(e!.title).toBe("A very long title that keeps going onto the next line");
  });

  it("gives a stable id for the same event", () => {
    const [a] = parseIcs(sample, "UTC");
    const [b] = parseIcs(sample, "UTC");
    expect(icsEventId(a!)).toBe(icsEventId(b!));
    expect(icsEventId(a!)).toMatch(/^ics-/);
  });
});
