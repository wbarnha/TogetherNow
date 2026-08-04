import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseChatExport } from "../chat-import";
import { parseIcs } from "../ics";
import { parsePlaces } from "../places";
import { parseWatchFile } from "../watch";

/**
 * The sample files offered from the import dialogs.
 *
 * They are the first thing a new user runs through the importers, so a sample
 * that no longer parses is a broken front door — and it would break silently,
 * since a parser that finds nothing returns an empty result rather than an
 * error. These tests read the files that actually ship.
 */
const SAMPLES = join(process.cwd(), "public", "samples");
const read = (name: string) => readFileSync(join(SAMPLES, name), "utf8");

describe("the sample calendar", () => {
  const text = read("together-now-sample-calendar.ics");

  it("parses into the events it advertises", () => {
    const events = parseIcs(text, "America/New_York");
    expect(events.length).toBe(5);
    expect(events.map((e) => e.title)).toContain("Dinner at Tartine");
  });

  it("carries a zoned time, a floating time and an all-day date", () => {
    const events = parseIcs(text, "America/New_York");
    const byTitle = (t: string) => events.find((e) => e.title === t);

    // Zoned: 18:30 in London, read on a New York device.
    expect(byTitle("Flight to see Sam")?.time).toBe("13:30");
    // Floating: no zone, so it keeps the wall time as written.
    expect(byTitle("Call with the visa office")?.time).toBe("10:00");
    // All-day: a date and no time at all.
    expect(byTitle("Our anniversary")?.time).toBeUndefined();
  });

  it("reads the same wall times whichever device opens it", () => {
    const ny = parseIcs(text, "America/New_York");
    const london = parseIcs(text, "Europe/London");
    const zoned = (list: typeof ny) => list.find((e) => e.title === "Flight home")?.time;
    // 26 October 2026 sits in the week where London is back on GMT but New
    // York is still on summer time, so the gap is four hours rather than the
    // usual five. Getting this wrong is exactly the bug the sample exists to
    // make visible.
    expect(zoned(london)).toBe("08:00");
    expect(zoned(ny)).toBe("04:00");
  });
});

describe("the sample chat export", () => {
  const text = read("together-now-sample-messages.txt");

  it("parses every message", () => {
    const out = parseChatExport(text, "together-now-sample-messages.txt");
    expect(out?.messages.length).toBe(10);
  });

  it("keeps both sides of the conversation", () => {
    const out = parseChatExport(text, "together-now-sample-messages.txt");
    const senders = new Set(out?.messages.map((m) => m.senderName));
    expect(senders).toEqual(new Set(["Ada", "Sam"]));
  });

  it("keeps the two identical messages sent a second apart", () => {
    // Deliberately in the sample: under the old 32-bit ids these collided and
    // one was silently dropped as a duplicate.
    const out = parseChatExport(text, "together-now-sample-messages.txt");
    const onMyWay = out?.messages.filter((m) => m.text === "on my way") ?? [];
    expect(onMyWay).toHaveLength(2);
    expect(new Set(onMyWay.map((m) => m.senderName)).size).toBe(2);
  });

  it("keeps a colon inside a message body", () => {
    const out = parseChatExport(text, "together-now-sample-messages.txt");
    expect(out?.messages.some((m) => m.text.includes("the plan is: pastries"))).toBe(true);
  });

  it("drops the read and delivered receipts", () => {
    const out = parseChatExport(text, "together-now-sample-messages.txt");
    expect(out?.messages.some((m) => /^(read|delivered)$/i.test(m.text))).toBe(false);
  });
});

describe("the sample watch history", () => {
  const text = read("together-now-sample-watch-history.csv");

  it("parses into entries", () => {
    const out = parseWatchFile(text, "together-now-sample-watch-history.csv");
    expect(out?.entries.length).toBe(6);
  });

  it("splits a series title from its episode detail", () => {
    const out = parseWatchFile(text, "together-now-sample-watch-history.csv");
    const arcane = out?.entries.find((e) => e.title === "Arcane");
    expect(arcane?.detail).toContain("Episode");
  });

  it("includes one undated row, which is the interesting case", () => {
    // A row with no date is what used to duplicate on every re-import.
    const out = parseWatchFile(text, "together-now-sample-watch-history.csv");
    expect(out?.entries.some((e) => e.at === null)).toBe(true);
  });
});

describe("the sample places list", () => {
  const text = read("together-now-sample-places.csv");

  it("parses into places", () => {
    const places = parsePlaces(text, "together-now-sample-places.csv");
    expect(places.length).toBe(4);
    expect(places.map((p) => p.name)).toContain("Tartine Bakery");
  });

  it("carries notes and coordinates", () => {
    const places = parsePlaces(text, "together-now-sample-places.csv");
    const tartine = places.find((p) => p.name === "Tartine Bakery");
    expect(tartine?.note).toContain("Morning buns");
    expect(tartine?.lat).toBeCloseTo(37.7614, 3);
  });

  it("keeps only http(s) links", () => {
    const places = parsePlaces(text, "together-now-sample-places.csv");
    for (const p of places) {
      if (p.url) expect(p.url).toMatch(/^https?:\/\//);
    }
  });
});
