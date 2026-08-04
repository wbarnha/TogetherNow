import LZString from "lz-string";
import { describe, expect, it } from "vitest";

import {
  SHARE_CATEGORIES,
  acceptAll,
  applyShareCode,
  parseShareCode,
  previewShareCode,
} from "../share";
import { initialState, type AppState } from "../types";

function encode(payload: unknown): string {
  return "TN1:" + LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

const base = {
  v: 1,
  from: "Alex",
  fromZone: "Europe/London",
  startDate: null,
  events: [],
  milestones: [],
  moods: [],
  places: [],
  expenses: [],
  goals: [],
  watch: [],
  at: Date.now(),
};

const mood = (id: string) => ({ id, date: "2026-01-02", score: 4, owner: "me", updatedAt: 1 });
const expense = (id: string) => ({
  id,
  title: "Flights",
  amount: 220,
  currency: "GBP",
  date: "2026-01-02",
  paidBy: "me",
  split: "even",
  category: "travel",
  settled: false,
  updatedAt: 1,
});
const watch = (id: string) => ({
  id,
  service: "netflix",
  title: "Arcane",
  owner: "me",
  at: 1_700_000_000_000,
});
const event = (id: string) => ({
  id,
  title: "Call",
  date: "2030-02-02",
  anchor: "me",
  owner: "us",
  updatedAt: 1,
});

describe("previewShareCode", () => {
  it("counts every category the code can carry", () => {
    const payload = parseShareCode(
      encode({
        ...base,
        events: [event("e1")],
        moods: [mood("m1"), mood("m2")],
        expenses: [expense("x1")],
        watch: [watch("w1")],
      }),
    );
    const preview = previewShareCode(payload);
    // Moods, expenses and viewing history used to be absent from the preview
    // or absent from the screen, so they arrived undisclosed.
    expect(preview.counts.moods).toBe(2);
    expect(preview.counts.expenses).toBe(1);
    expect(preview.counts.watch).toBe(1);
    expect(preview.counts.events).toBe(1);
  });

  it("has a count for every category the accept screen lists", () => {
    const preview = previewShareCode(parseShareCode(encode(base)));
    for (const category of SHARE_CATEGORIES) {
      expect(preview.counts[category.key], category.key).toBe(0);
    }
  });

  it("names the categories a reasonable person would want flagged", () => {
    const sensitive = SHARE_CATEGORIES.filter((c) => c.sensitive).map((c) => c.key);
    expect(sensitive).toEqual(expect.arrayContaining(["moods", "expenses", "watch"]));
  });
});

describe("merge summary", () => {
  it("counts moods that were added", () => {
    // A mood-only code used to merge silently and report "already up to date".
    const payload = parseShareCode(encode({ ...base, moods: [mood("m1"), mood("m2")] }));
    const { state, summary } = applyShareCode(initialState(), payload);
    expect(state.moods).toHaveLength(2);
    expect(summary.added).toBe(2);
  });

  it("counts moods that were updated", () => {
    const first = parseShareCode(encode({ ...base, moods: [{ ...mood("m1"), updatedAt: 1 }] }));
    const merged = applyShareCode(initialState(), first).state;
    const second = parseShareCode(
      encode({ ...base, moods: [{ ...mood("m1"), score: 2, updatedAt: 5000 }] }),
    );
    const { summary } = applyShareCode(merged, second);
    expect(summary.updated).toBe(1);
  });
});

describe("per-category consent", () => {
  const payload = () =>
    parseShareCode(
      encode({
        ...base,
        events: [event("e1")],
        moods: [mood("m1")],
        expenses: [expense("x1")],
        watch: [watch("w1")],
      }),
    );

  it("takes everything when the recipient accepts everything", () => {
    const { state } = applyShareCode(initialState(), payload(), acceptAll());
    expect(state.moods).toHaveLength(1);
    expect(state.expenses).toHaveLength(1);
    expect(state.watchEntries).toHaveLength(1);
    expect(state.events).toHaveLength(1);
  });

  it("leaves out a category the recipient declined", () => {
    const { state } = applyShareCode(initialState(), payload(), {
      ...acceptAll(),
      moods: false,
      watch: false,
    });
    expect(state.moods).toHaveLength(0);
    expect(state.watchEntries).toHaveLength(0);
    // …without affecting the ones they did accept.
    expect(state.expenses).toHaveLength(1);
    expect(state.events).toHaveLength(1);
  });

  it("does not count a declined category as merged", () => {
    const { summary } = applyShareCode(initialState(), payload(), {
      ...acceptAll(),
      moods: false,
      expenses: false,
      watch: false,
    });
    expect(summary.added).toBe(1); // the event only
  });

  it("still pairs the partners when only one category is accepted", () => {
    const state: AppState = initialState();
    const { state: merged } = applyShareCode(state, payload(), {
      ...acceptAll(),
      moods: false,
      expenses: false,
      watch: false,
      events: false,
      milestones: false,
      places: false,
      goals: false,
    });
    expect(merged.pairedAt).not.toBeNull();
    expect(merged.them.name).toBe("Alex");
  });

  it("defaults to accepting everything when no choice is given", () => {
    const { state } = applyShareCode(initialState(), payload());
    expect(state.moods).toHaveLength(1);
  });
});
