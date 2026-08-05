import { describe, expect, it } from "vitest";

import { parseIcs } from "../ics";

function calendar(...lines: string[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join("\r\n");
}

function event(dtstart: string, summary = "Dinner") {
  return calendar(
    "BEGIN:VEVENT",
    `UID:${summary}-${dtstart}`,
    `SUMMARY:${summary}`,
    dtstart,
    "END:VEVENT",
  );
}

const NY = "America/New_York";
const LONDON = "Europe/London";

describe("floating times", () => {
  it("keeps a floating time as wall-clock time in the chosen zone", () => {
    // RFC 5545: no trailing Z and no TZID means "whatever the clock says where
    // the reader is". Treating it as UTC shifted this to 05:00.
    const [parsed] = parseIcs(event("DTSTART:20260810T090000"), NY);
    expect(parsed?.date).toBe("2026-08-10");
    expect(parsed?.time).toBe("09:00");
  });

  it("keeps a floating time whichever zone is chosen", () => {
    for (const zone of [NY, LONDON, "Asia/Tokyo", "Australia/Sydney"]) {
      const [parsed] = parseIcs(event("DTSTART:20260810T090000"), zone);
      expect(parsed?.time, zone).toBe("09:00");
      expect(parsed?.date, zone).toBe("2026-08-10");
    }
  });

  it("keeps a floating time across a daylight-saving boundary", () => {
    // 1 November 2026 is the Sunday the US falls back.
    for (const date of ["20261031", "20261101", "20261102"]) {
      const [parsed] = parseIcs(event(`DTSTART:${date}T090000`), NY);
      expect(parsed?.time, date).toBe("09:00");
    }
  });
});

describe("anchored times", () => {
  it("converts a UTC timestamp into the chosen zone", () => {
    // 13:00 UTC in August is 09:00 in New York (UTC-4).
    const [parsed] = parseIcs(event("DTSTART:20260810T130000Z"), NY);
    expect(parsed?.date).toBe("2026-08-10");
    expect(parsed?.time).toBe("09:00");
  });

  it("converts a UTC timestamp that crosses midnight in the chosen zone", () => {
    const [parsed] = parseIcs(event("DTSTART:20260810T023000Z"), NY);
    expect(parsed?.date).toBe("2026-08-09");
    expect(parsed?.time).toBe("22:30");
  });

  it("converts a TZID timestamp into the chosen zone", () => {
    // 09:00 London in August is 04:00 New York.
    const [parsed] = parseIcs(event("DTSTART;TZID=Europe/London:20260810T090000"), NY);
    expect(parsed?.date).toBe("2026-08-10");
    expect(parsed?.time).toBe("04:00");
  });

  it("respects TZID over the chosen zone", () => {
    const [inNy] = parseIcs(event("DTSTART;TZID=Europe/London:20260810T090000"), NY);
    const [inLondon] = parseIcs(event("DTSTART;TZID=Europe/London:20260810T090000"), LONDON);
    expect(inLondon?.time).toBe("09:00");
    expect(inNy?.time).toBe("04:00");
  });

  it("handles a TZID timestamp either side of a daylight-saving change", () => {
    // London leaves summer time on 25 October 2026; New York not until
    // 1 November. The same wall time on either side of that Sunday therefore
    // lands an hour apart in New York, which is the whole point: a single
    // fixed offset would give the same answer for both.
    const before = parseIcs(event("DTSTART;TZID=Europe/London:20261024T120000"), NY)[0];
    const after = parseIcs(event("DTSTART;TZID=Europe/London:20261026T120000"), NY)[0];
    expect(before?.time).toBe("07:00"); // 12:00 BST (UTC+1) → 11:00 UTC → 07:00 EDT
    expect(after?.time).toBe("08:00"); // 12:00 GMT (UTC+0) → 12:00 UTC → 08:00 EDT
  });
});

describe("all-day events", () => {
  it("is unaffected by the chosen zone", () => {
    for (const zone of [NY, "Asia/Tokyo"]) {
      const [parsed] = parseIcs(event("DTSTART;VALUE=DATE:20260810"), zone);
      expect(parsed?.date, zone).toBe("2026-08-10");
      expect(parsed?.time, zone).toBeUndefined();
    }
  });
});
