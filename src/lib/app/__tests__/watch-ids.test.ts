import { describe, expect, it } from "vitest";

import { parseWatchFile, parsedWatchId, undatedWatchId, watchId, type ParsedWatch } from "../watch";

/** Assign ids the way the import dialog does: one counter per file. */
function idsFor(entries: ParsedWatch[], service: Parameters<typeof parsedWatchId>[0] = "netflix") {
  const seen = new Map<string, number>();
  return entries.map((e) => parsedWatchId(service, e, seen));
}

const UNDATED_CSV = ["Title", "Blue Planet: Series 1: Coasts", "The Wire: Season 2", "Arcane"].join(
  "\n",
);

describe("undated rows", () => {
  it("re-imports the same undated file without duplicating anything", () => {
    const first = parseWatchFile(UNDATED_CSV, "history.csv");
    const second = parseWatchFile(UNDATED_CSV, "history.csv");
    expect(first?.entries).toHaveLength(3);
    // The old code stamped Date.now() into the id, so every row of a second
    // import looked new.
    expect(idsFor(first!.entries)).toEqual(idsFor(second!.entries));
  });

  it("marks a row with no usable date rather than inventing one", () => {
    const parsed = parseWatchFile(UNDATED_CSV, "history.csv");
    expect(parsed?.entries.every((e) => e.at === null)).toBe(true);
  });

  it("gives the same row the same id across separate imports", () => {
    const row: ParsedWatch = { title: "Arcane", at: null };
    expect(idsFor([row])[0]).toBe(idsFor([row])[0]);
  });

  it("keeps identical undated rows distinguishable", () => {
    const row: ParsedWatch = { title: "Arcane", at: null };
    const [a, b] = idsFor([row, row]);
    expect(a).not.toBe(b);
    // …and reproducibly so.
    expect(idsFor([row, row])).toEqual([a, b]);
  });

  it("separates rows that differ only by detail", () => {
    const ids = idsFor([
      { title: "The Wire", detail: "Season 1", at: null },
      { title: "The Wire", detail: "Season 2", at: null },
    ]);
    expect(new Set(ids).size).toBe(2);
  });

  it("separates the same title across different services", () => {
    const row: ParsedWatch = { title: "Arcane", at: null };
    expect(idsFor([row], "netflix")[0]).not.toBe(idsFor([row], "hulu")[0]);
  });

  it("does not depend on where the row sits in the file", () => {
    const target: ParsedWatch = { title: "Arcane", at: null };
    const filler: ParsedWatch = { title: "Something else", at: null };
    // Adding unrelated rows in front must not renumber it.
    const before = idsFor([target, filler]);
    const after = idsFor([filler, target]);
    expect(after[1]).toBe(before[0]);
  });

  it("does not collide with the id a dated row would get", () => {
    expect(undatedWatchId("netflix", "Arcane", undefined, 0)).not.toBe(
      watchId("netflix", 0, "Arcane", undefined),
    );
  });
});

describe("dated rows", () => {
  it("keeps the existing id scheme, so archives are unaffected", () => {
    const row: ParsedWatch = { title: "Arcane", at: 1_700_000_000_000 };
    expect(idsFor([row])[0]).toBe(watchId("netflix", 1_700_000_000_000, "Arcane", undefined));
  });

  it("re-imports a dated file without duplicating anything", () => {
    const csv = ["Title,Date", "Arcane,2024-01-02", "The Wire,2024-01-03"].join("\n");
    const first = parseWatchFile(csv, "netflix.csv");
    const second = parseWatchFile(csv, "netflix.csv");
    expect(first?.entries).toHaveLength(2);
    expect(idsFor(first!.entries)).toEqual(idsFor(second!.entries));
    expect(first?.entries.every((e) => e.at !== null)).toBe(true);
  });

  it("distinguishes the same title watched on different days", () => {
    const ids = idsFor([
      { title: "Arcane", at: 1_700_000_000_000 },
      { title: "Arcane", at: 1_700_086_400_000 },
    ]);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("steam exports", () => {
  it("does not invent a last-played time for a game that has none", () => {
    const json = JSON.stringify({
      response: { games: [{ name: "Factorio", playtime_forever: 90 }] },
    });
    const parsed = parseWatchFile(json, "steam.json");
    expect(parsed?.entries[0]?.at).toBeNull();
    expect(parsed?.entries[0]?.minutes).toBe(90);
  });

  it("re-imports the same library without duplicating undated games", () => {
    const json = JSON.stringify({
      response: { games: [{ name: "Factorio", playtime_forever: 90 }] },
    });
    const a = parseWatchFile(json, "steam.json");
    const b = parseWatchFile(json, "steam.json");
    expect(idsFor(a!.entries, "steam")).toEqual(idsFor(b!.entries, "steam"));
  });
});
