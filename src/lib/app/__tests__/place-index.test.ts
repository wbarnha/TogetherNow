import { describe, expect, it } from "vitest";

import {
  createPlaceIndex,
  dedupeParsed,
  isSamePlace,
  matchExistingPlaces,
  mergeParsed,
  placeId,
  toPlace,
  type ParsedPlace,
} from "../places";

/** Deterministic PRNG so a failure is always reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

const WORDS = ["blue", "harbour", "olive", "north", "lantern", "fig", "rusty", "willow", "ember"];

function sample(count: number, seed: number): ParsedPlace[] {
  const rand = rng(seed);
  const out: ParsedPlace[] = [];
  for (let i = 0; i < count; i++) {
    const pick = () => WORDS[Math.floor(rand() * WORDS.length)]!;
    const hasCoords = rand() > 0.25;
    // Cluster around a handful of cities so near-duplicates actually occur.
    const cityLat = [51.5, 40.7, -33.86, 35.68, 78.2][Math.floor(rand() * 5)]!;
    const cityLng = [-0.12, -74.0, 151.2, 139.65, 15.6][Math.floor(rand() * 5)]!;
    out.push({
      name: `${pick()} ${pick()}`,
      address: rand() > 0.5 ? `${Math.floor(rand() * 200)} ${pick()} street` : undefined,
      url: rand() > 0.8 ? `https://maps.google.com/place/${Math.floor(rand() * 40)}` : undefined,
      lat: hasCoords ? cityLat + (rand() - 0.5) * 0.01 : undefined,
      lng: hasCoords ? cityLng + (rand() - 0.5) * 0.01 : undefined,
    });
  }
  return out;
}

/** The original O(n²) implementation, kept as the reference behaviour. */
function dedupeNaive(list: ParsedPlace[]) {
  const out: ParsedPlace[] = [];
  let merged = 0;
  for (const p of list) {
    const i = out.findIndex((x) => isSamePlace(x, p));
    if (i >= 0) {
      out[i] = mergeParsed(out[i]!, p);
      merged++;
    } else out.push(p);
  }
  return { places: out, merged };
}

describe("createPlaceIndex", () => {
  it("agrees with a full scan across randomised datasets", () => {
    for (const seed of [1, 7, 42, 1337, 99_991]) {
      const list = sample(400, seed);
      const indexed = dedupeParsed(list);
      const naive = dedupeNaive(list);
      expect(indexed.merged, `seed ${seed}`).toBe(naive.merged);
      expect(indexed.places.map((p) => p.name)).toEqual(naive.places.map((p) => p.name));
    }
  });

  it("finds the earliest match, not just any match", () => {
    const index = createPlaceIndex<ParsedPlace>([
      { name: "Blue Harbour", lat: 51.5, lng: -0.12 },
      { name: "Blue Harbour", lat: 51.5, lng: -0.12 },
    ]);
    const hit = index.find({ name: "Blue Harbour", lat: 51.5, lng: -0.12 });
    expect(hit).toBe(index.items()[0]);
  });

  it("still matches on an exact name made entirely of noise words", () => {
    // Every token is filtered as noise, so the token index cannot see these —
    // the normalised-name bucket is what catches them.
    const index = createPlaceIndex<ParsedPlace>([{ name: "The Bar" }]);
    expect(index.find({ name: "the bar" })).toBeDefined();
  });

  it("does not match places that are far apart despite similar names", () => {
    const index = createPlaceIndex<ParsedPlace>([{ name: "Olive Kitchen", lat: 51.5, lng: -0.12 }]);
    expect(index.find({ name: "Olive Kitchen", lat: 40.7, lng: -74.0 })).toBeUndefined();
  });

  it("matches near the poles, where the longitude grid degenerates", () => {
    const index = createPlaceIndex<ParsedPlace>([{ name: "Ice Cabin", lat: 88.0, lng: 10.0 }]);
    // ~19 m apart: 0.005 degrees of longitude at 88 degrees north.
    expect(index.find({ name: "Ice Cabin", lat: 88.0, lng: 10.005 })).toBeDefined();
    // Far apart in metres despite a small-looking longitude delta.
    expect(index.find({ name: "Ice Cabin", lat: 88.0, lng: 40.0 })).toBeUndefined();
  });

  it("matches across the polar/grid boundary", () => {
    // Filed under the longitude grid; looked up under the polar bands.
    const index = createPlaceIndex<ParsedPlace>([{ name: "Edge Hut", lat: 84.9995, lng: 20.0 }]);
    // 0.0007 degrees of latitude is ~78 m, inside the coordinate match radius.
    expect(index.find({ name: "Edge Hut", lat: 85.0002, lng: 20.0 })).toBeDefined();
  });

  it("stays fast on an import large enough to freeze the old code", () => {
    const list = sample(3_000, 2024);
    const started = performance.now();
    const { places } = dedupeParsed(list);
    const elapsed = performance.now() - started;
    expect(places.length).toBeGreaterThan(0);
    // The quadratic version needs ~4.5M isSamePlace calls here. This budget is
    // deliberately loose so the test measures the complexity change, not the
    // speed of whatever machine CI happens to allocate.
    expect(elapsed).toBeLessThan(3_000);
  });
});

describe("matchExistingPlaces", () => {
  it("matches on the stable id even when nothing else lines up", () => {
    const parsed: ParsedPlace = { name: "Fig Tree", address: "1 north street" };
    const saved = toPlace(parsed, "us", "manual");
    const matches = matchExistingPlaces([parsed], [saved]);
    expect(matches.get(placeId(parsed))).toBe(saved.id);
  });

  it("leaves genuinely new places unmatched", () => {
    const saved = toPlace({ name: "Fig Tree", lat: 51.5, lng: -0.12 }, "us", "manual");
    const fresh: ParsedPlace = { name: "Rusty Lantern", lat: 40.7, lng: -74.0 };
    expect(matchExistingPlaces([fresh], [saved]).size).toBe(0);
  });
});
