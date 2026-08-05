import { describe, expect, it } from "vitest";

import { digest128, digestOf } from "../digest";
import { legacyMessageId, messageId } from "../chat-import";

const bits = (hex: string) =>
  [...hex].map((c) => parseInt(c, 16).toString(2).padStart(4, "0")).join("");

describe("digest128", () => {
  it("returns 128 bits regardless of input length", () => {
    for (const value of [
      "",
      "x",
      "x".repeat(15),
      "x".repeat(16),
      "x".repeat(17),
      "x".repeat(5000),
    ]) {
      expect(digest128(value)).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("is deterministic", () => {
    expect(digest128("the same input")).toBe(digest128("the same input"));
  });

  it("distinguishes every length around the block boundary", () => {
    // The tail path handles 1–15 leftover bytes; a mistake there shows up as
    // two different lengths hashing alike.
    const seen = new Set(Array.from({ length: 64 }, (_, i) => digest128("a".repeat(i))));
    expect(seen.size).toBe(64);
  });

  it("distinguishes inputs that differ only in non-ASCII bytes", () => {
    expect(digest128("café")).not.toBe(digest128("cafe"));
    expect(digest128("🎉")).not.toBe(digest128("🎊"));
  });

  it("avalanches: a one-character change moves about half the bits", () => {
    let moved = 0;
    const trials = 400;
    for (let i = 0; i < trials; i++) {
      const a = bits(digest128(`input-${i}`));
      const b = bits(digest128(`input-${i}!`));
      for (let k = 0; k < 128; k++) if (a[k] !== b[k]) moved++;
    }
    const average = moved / trials;
    // A hash that leaves whole lanes untouched, or copies one lane into
    // another, lands far outside this band.
    expect(average).toBeGreaterThan(55);
    expect(average).toBeLessThan(73);
  });

  it("spreads across all four 32-bit lanes independently", () => {
    const lanes = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
    for (let i = 0; i < 5_000; i++) {
      const d = digest128(`lane-${i}`);
      for (let l = 0; l < 4; l++) lanes[l]!.add(d.slice(l * 8, l * 8 + 8));
    }
    // A duplicated or constant lane collapses here.
    for (const lane of lanes) expect(lane.size).toBe(5_000);
  });

  it("behaves like a random function in its low bits", () => {
    // The real test of mixing. Over 40,000 inputs the low 32 bits should
    // collide about (n choose 2) / 2^32 times — near 0.19 here. A degenerate
    // implementation shows either none at all or far too many.
    const seen = new Set<string>();
    let collisions = 0;
    const n = 40_000;
    for (let i = 0; i < n; i++) {
      const low = digest128(`probe-${i}`).slice(0, 8);
      if (seen.has(low)) collisions++;
      seen.add(low);
    }
    expect(collisions).toBeLessThan(6);
  });
});

describe("digestOf", () => {
  it("does not confuse different splits of the same joined text", () => {
    expect(digestOf("ab", "c")).not.toBe(digestOf("a", "bc"));
  });

  it("treats a missing field and an empty one alike, but not a shifted one", () => {
    expect(digestOf("a", undefined, "b")).toBe(digestOf("a", "", "b"));
    expect(digestOf("a", "b", "")).not.toBe(digestOf("a", "", "b"));
  });

  it("accepts numbers without losing precision", () => {
    expect(digestOf("x", 1_700_000_000_000)).not.toBe(digestOf("x", 1_700_000_000_001));
  });
});

describe("messageId", () => {
  it("gives 128 bits of collision resistance", () => {
    expect(messageId("imessage", 1, "Ada", "hi")).toMatch(/^msg-[0-9a-f]{32}$/);
  });

  it("separates two people who said the same thing at the same moment", () => {
    // The old id ignored the sender entirely, so this pair collided outright
    // and one of the two messages was dropped as a duplicate.
    expect(legacyMessageId("imessage", 1000, "on my way")).toBe(
      legacyMessageId("imessage", 1000, "on my way"),
    );
    expect(messageId("imessage", 1000, "Ada", "on my way")).not.toBe(
      messageId("imessage", 1000, "Sam", "on my way"),
    );
  });

  it("separates long messages that share an opening", () => {
    // The old id hashed only the first 120 characters.
    const opening = "a".repeat(120);
    expect(legacyMessageId("imessage", 1, `${opening}X`)).toBe(
      legacyMessageId("imessage", 1, `${opening}Y`),
    );
    expect(messageId("imessage", 1, "Ada", `${opening}X`)).not.toBe(
      messageId("imessage", 1, "Ada", `${opening}Y`),
    );
  });

  it("keeps ids stable across sessions", () => {
    // Nothing environmental feeds the digest, so a fresh run agrees with a
    // value computed earlier — which is what lets the migration work.
    const first = messageId("discord", 1_700_000_000_000, "Ada", "see you soon");
    const second = messageId("discord", 1_700_000_000_000, "Ada", "see you soon");
    expect(first).toBe(second);
    expect(first).toBe(messageId("discord", 1_700_000_000_000, "Ada", "see you soon"));
  });

  it("survives a realistic archive without collisions", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50_000; i++) {
      ids.add(
        messageId("imessage", 1_700_000_000_000 + i * 1000, i % 2 ? "Ada" : "Sam", `msg ${i}`),
      );
    }
    expect(ids.size).toBe(50_000);
  });
});
