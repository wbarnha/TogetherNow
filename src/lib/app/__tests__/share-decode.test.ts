import LZString from "lz-string";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DECODE_TIMEOUT_MS, TOO_SLOW, decodeShareCode } from "../share-decode";
import {
  NOT_A_CODE,
  UNREADABLE,
  buildShareCode,
  inflateShareCode,
  parseShareCode,
  shareCodeBody,
  validateSharePayload,
} from "../share";
import { LIMITS } from "../validate";
import { initialState, type AppState } from "../types";

const encode = (payload: unknown) =>
  "TN1:" + LZString.compressToEncodedURIComponent(JSON.stringify(payload));

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

const place = (i: number) => ({
  id: `p${i}`,
  name: `Place number ${i}`,
  address: `${i} Somewhere Street, A City, A Country`,
  note: "Worth going for the pastries.",
  url: "https://maps.example.com/?q=somewhere",
  lat: 37.7 + i / 10000,
  lng: -122.4 - i / 10000,
  owner: "us" as const,
  source: "google" as const,
  visited: false,
  shortlisted: true,
  updatedAt: 1,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the size the decoder will accept", () => {
  it("stays close to what the app can itself produce", () => {
    // A full archive — every share cap saturated — is what a real code is
    // built from. The old input cap was 4,000,000: twenty-three times larger
    // than that, and every extra character is decompression work an attacker
    // gets to ask for.
    const state: AppState = {
      ...initialState(),
      me: { name: "Alexandra", timeZone: "Europe/London", handles: {} },
      sharing: {
        plans: true,
        dates: true,
        ideas: true,
        moods: true,
        money: true,
        watch: true,
      },
      places: Array.from({ length: 2_000 }, (_, i) => place(i)),
    };

    const code = buildShareCode(state);

    expect(code.length).toBeLessThan(LIMITS.shareCode);
    expect(LIMITS.shareCode).toBeLessThan(4_000_000);
    expect(LIMITS.sharePayload).toBeLessThan(16_000_000);
  });

  it("refuses an oversized code before decompressing a byte of it", () => {
    const oversized = "T".repeat(LIMITS.shareCode + 1);
    const spy = vi.spyOn(LZString, "decompressFromEncodedURIComponent");

    expect(() => shareCodeBody(oversized)).toThrow(UNREADABLE);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("rejects a code that inflates past what any archive could hold", () => {
    // Stubbed rather than built: compressing four megabytes takes the better
    // part of ten seconds, and the branch under test is the length check, not
    // lz-string. What the real thing does is covered below.
    const spy = vi
      .spyOn(LZString, "decompressFromEncodedURIComponent")
      .mockReturnValue("A".repeat(LIMITS.sharePayload + 1));

    expect(() => inflateShareCode("tiny")).toThrow(NOT_A_CODE);
    spy.mockRestore();
  });

  it("is up against an expansion ratio that no input cap can bound", () => {
    // This is why the cap alone is not the fix. A code far too small to look
    // suspicious carries an enormous amount of decompression work, and the
    // ratio climbs with size — so there is no input length at which the output
    // is safely bounded. Hence the worker, and the deadline on it.
    const code = LZString.compressToEncodedURIComponent("A".repeat(200_000));
    const out = LZString.decompressFromEncodedURIComponent(code);

    expect(code.length).toBeLessThan(2_000);
    expect(out.length / code.length).toBeGreaterThan(100);
  });
});

describe("decodeShareCode", () => {
  it("returns the same payload the synchronous parser does", async () => {
    const code = encode({ ...base, from: "Alex" });
    const viaWorkerPath = await decodeShareCode(code);
    expect(viaWorkerPath.from).toBe(parseShareCode(code).from);
    expect(viaWorkerPath.v).toBe(1);
  });

  it("falls back to inline decoding where workers do not exist", async () => {
    // Server rendering, an old webview, or a policy that blocks worker
    // construction. The code still has to open.
    expect(typeof Worker).toBe("undefined");
    await expect(decodeShareCode(encode(base))).resolves.toMatchObject({ from: "Alex" });
  });

  it("reports an unreadable code rather than hanging", async () => {
    await expect(decodeShareCode("TN1:not-a-real-code")).rejects.toThrow();
  });

  it("refuses to start once the caller has given up", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(decodeShareCode(encode(base), { signal: controller.signal })).rejects.toThrow(
      UNREADABLE,
    );
  });
});

/**
 * The worker path cannot run under Node, so these stub `Worker` to check the
 * part that actually matters: that a decode which never comes back is given up
 * on, and that the worker is destroyed rather than left running.
 */
describe("when the work is handed to a worker", () => {
  class SilentWorker {
    static last: SilentWorker | null = null;
    terminated = false;
    posted: unknown[] = [];
    listeners = new Map<string, ((e: unknown) => void)[]>();
    constructor() {
      SilentWorker.last = this;
    }
    addEventListener(type: string, fn: (e: unknown) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    removeEventListener() {}
    postMessage(msg: unknown) {
      this.posted.push(msg);
    }
    terminate() {
      this.terminated = true;
    }
    emit(type: string, event: unknown) {
      for (const fn of this.listeners.get(type) ?? []) fn(event);
    }
  }

  const useStubWorker = () => {
    SilentWorker.last = null;
    vi.stubGlobal("Worker", SilentWorker);
  };

  it("gives up on a code that never comes back, and kills the worker", async () => {
    vi.useFakeTimers();
    useStubWorker();

    const promise = decodeShareCode(encode(base));
    const assertion = expect(promise).rejects.toThrow(TOO_SLOW);

    // Let the synchronous setup run, then run out the clock.
    await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS + 1);
    await assertion;

    // Terminating is the only way to stop a decompression already in flight —
    // it will not check a flag.
    expect(SilentWorker.last?.terminated).toBe(true);
  });

  it("kills the worker when the screen goes away", async () => {
    useStubWorker();
    const controller = new AbortController();

    const promise = decodeShareCode(encode(base), { signal: controller.signal });
    const assertion = expect(promise).rejects.toThrow(UNREADABLE);
    await Promise.resolve();
    controller.abort();
    await assertion;

    expect(SilentWorker.last?.terminated).toBe(true);
  });

  it("does not leave the caller hanging when the worker dies", async () => {
    // A code that inflates past what the device can hold takes the worker down
    // with it; the promise still has to settle.
    useStubWorker();

    const promise = decodeShareCode(encode(base));
    const assertion = expect(promise).rejects.toThrow(NOT_A_CODE);
    await Promise.resolve();
    SilentWorker.last!.emit("error", new Error("out of memory"));
    await assertion;
  });

  it("validates on this side of the bridge, not in the worker", async () => {
    // Whatever comes back over `postMessage` is still untrusted input.
    useStubWorker();

    const promise = decodeShareCode(encode(base));
    await Promise.resolve();
    const request = SilentWorker.last!.posted[0] as { id: number };
    SilentWorker.last!.emit("message", {
      data: { id: request.id, ok: true, value: { v: 1, from: "x".repeat(5_000), events: "nope" } },
    });

    const payload = await promise;
    expect(payload.from.length).toBeLessThanOrEqual(LIMITS.shortText);
    expect(payload.events).toEqual([]);
  });

  it("ignores a reply meant for some other decode", async () => {
    vi.useFakeTimers();
    useStubWorker();

    const promise = decodeShareCode(encode(base));
    const assertion = expect(promise).rejects.toThrow(TOO_SLOW);
    await Promise.resolve();
    SilentWorker.last!.emit("message", { data: { id: -1, ok: true, value: { v: 1 } } });

    await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS + 1);
    await assertion;
  });
});

describe("the split between inflating and validating", () => {
  it("round-trips through the two halves exactly as the whole did", () => {
    const code = encode({ ...base, from: "Alex", places: [place(1)] });
    const whole = parseShareCode(code);
    const halves = validateSharePayload(inflateShareCode(shareCodeBody(code)));

    expect(halves.from).toBe(whole.from);
    expect(halves.places.map((p) => p.id)).toEqual(whole.places.map((p) => p.id));
  });
});
