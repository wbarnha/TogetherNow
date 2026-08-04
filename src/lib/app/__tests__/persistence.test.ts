import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEY, readStoredState, resetPersistence, writeStoredState } from "../persistence";

/**
 * A small IndexedDB good enough to exercise the paths that matter: a single
 * record, a store that can be told to fail, and requests that settle
 * asynchronously the way the real thing does.
 */
class FakeIDB {
  static records = new Map<string, unknown>();
  static failWith: string | null = null;
  static openFails = false;
  static putCount = 0;

  static reset() {
    FakeIDB.records = new Map();
    FakeIDB.failWith = null;
    FakeIDB.openFails = false;
    FakeIDB.putCount = 0;
  }

  static install() {
    FakeIDB.reset();
    vi.stubGlobal("indexedDB", {
      open() {
        const request: Record<string, unknown> = { result: FakeIDB.db() };
        queueMicrotask(() => {
          if (FakeIDB.openFails) (request["onerror"] as (() => void) | undefined)?.();
          else (request["onsuccess"] as (() => void) | undefined)?.();
        });
        return request;
      },
    });
  }

  static db() {
    return {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => {},
      transaction() {
        const tx: Record<string, unknown> = {};
        return {
          ...tx,
          objectStore: () => ({
            get(key: string) {
              const request: Record<string, unknown> = {};
              queueMicrotask(() => {
                request["result"] = FakeIDB.records.get(key);
                (request["onsuccess"] as (() => void) | undefined)?.();
              });
              return request;
            },
            put(value: unknown, key: string) {
              FakeIDB.putCount++;
              if (FakeIDB.failWith) {
                const error = new Error("nope");
                error.name = FakeIDB.failWith;
                queueMicrotask(() => {
                  (tx["error"] as unknown) = error;
                  (tx["onerror"] as (() => void) | undefined)?.();
                });
                return {};
              }
              FakeIDB.records.set(key, value);
              queueMicrotask(() => (tx["oncomplete"] as (() => void) | undefined)?.());
              return {};
            },
          }),
          set oncomplete(fn: () => void) {
            tx["oncomplete"] = fn;
          },
          set onerror(fn: () => void) {
            tx["onerror"] = fn;
          },
          set onabort(fn: () => void) {
            tx["onabort"] = fn;
          },
          get error() {
            return tx["error"];
          },
        };
      },
    } as unknown as IDBDatabase;
  }
}

const store = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

beforeEach(() => {
  store.clear();
  resetPersistence();
  vi.stubGlobal("window", { localStorage: fakeLocalStorage });
  FakeIDB.install();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetPersistence();
});

describe("reading the archive", () => {
  it("returns what IndexedDB holds", async () => {
    FakeIDB.records.set("state", { version: 1, marker: "from idb" });
    await expect(readStoredState()).resolves.toMatchObject({ marker: "from idb" });
  });

  it("brings across an archive left in the old localStorage slot", async () => {
    store.set(STORAGE_KEY, JSON.stringify({ version: 1, marker: "from localStorage" }));
    await expect(readStoredState()).resolves.toMatchObject({ marker: "from localStorage" });
  });

  it("keeps the old copy until a write has actually landed", async () => {
    // An upgrade interrupted between reading and the first write must leave
    // the archive exactly where the previous build looks for it.
    store.set(STORAGE_KEY, JSON.stringify({ version: 1 }));
    await readStoredState();
    expect(store.has(STORAGE_KEY)).toBe(true);

    await writeStoredState({ version: 1, migrated: true });
    expect(store.has(STORAGE_KEY)).toBe(false);
    expect(FakeIDB.records.get("state")).toMatchObject({ migrated: true });
  });

  it("falls back to localStorage when IndexedDB will not open", async () => {
    FakeIDB.openFails = true;
    store.set(STORAGE_KEY, JSON.stringify({ version: 1, marker: "fallback" }));
    await expect(readStoredState()).resolves.toMatchObject({ marker: "fallback" });
  });

  it("returns undefined rather than throwing on a corrupt legacy value", async () => {
    store.set(STORAGE_KEY, "{not json");
    await expect(readStoredState()).resolves.toBeUndefined();
  });

  it("survives an environment with no storage at all", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("indexedDB", undefined);
    await expect(readStoredState()).resolves.toBeUndefined();
  });
});

describe("writing the archive", () => {
  it("stores the object rather than a JSON string", async () => {
    // The point of the move: no 11 MB string has to be built on the main
    // thread before anything can be saved.
    await writeStoredState({ version: 1, chatMessages: [{ id: "a" }] });
    const written = FakeIDB.records.get("state");
    expect(typeof written).toBe("object");
    expect(written).toMatchObject({ chatMessages: [{ id: "a" }] });
  });

  it("reports a full quota so the app can say so", async () => {
    FakeIDB.failWith = "QuotaExceededError";
    await expect(writeStoredState({ version: 1 })).resolves.toBe("quota-exceeded");
  });

  it("falls back to localStorage if the database goes away mid-session", async () => {
    FakeIDB.failWith = "InvalidStateError";
    await expect(writeStoredState({ version: 1, marker: "rescued" })).resolves.toBe("written");
    expect(JSON.parse(store.get(STORAGE_KEY)!)).toMatchObject({ marker: "rescued" });
  });

  it("uses localStorage when IndexedDB is not there", async () => {
    vi.stubGlobal("indexedDB", undefined);
    resetPersistence();
    await expect(writeStoredState({ version: 1, marker: "legacy" })).resolves.toBe("written");
    expect(JSON.parse(store.get(STORAGE_KEY)!)).toMatchObject({ marker: "legacy" });
  });

  it("reports unavailable when nothing can be written", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("window", undefined);
    resetPersistence();
    await expect(writeStoredState({ version: 1 })).resolves.toBe("unavailable");
  });
});

describe("overlapping writes", () => {
  it("does not run two at once, and keeps only the newest", async () => {
    // A write is no longer instantaneous, so the idle flush and the one on
    // page-hide can overlap. They each write the whole archive, so an older
    // one has nothing to contribute.
    const first = writeStoredState({ version: 1, n: 1 });
    void writeStoredState({ version: 1, n: 2 });
    void writeStoredState({ version: 1, n: 3 });
    await first;
    await vi.waitFor(() => expect(FakeIDB.records.get("state")).toMatchObject({ n: 3 }));

    // Three calls, two writes: the middle one was superseded before it ran.
    expect(FakeIDB.putCount).toBe(2);
  });

  it("leaves the newest value in storage however the calls interleave", async () => {
    await writeStoredState({ version: 1, n: 1 });
    const pending = writeStoredState({ version: 1, n: 2 });
    void writeStoredState({ version: 1, n: 3 });
    await pending;
    await vi.waitFor(() => expect(FakeIDB.records.get("state")).toMatchObject({ n: 3 }));
  });
});
