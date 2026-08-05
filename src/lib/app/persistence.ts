/**
 * Where the archive lives, and when it gets written.
 *
 * It used to live in one localStorage value. That is a ~5 MB budget for the
 * whole origin, and the archive is allowed to be far larger than that — the
 * validator permits 200,000 chat messages, which at the size the importers
 * actually produce is around 45 MB. Measured in Chromium, an archive of 50,000
 * messages is 11.2 MB and `setItem` throws `QuotaExceededError` outright. So
 * the app's own limits allowed archives that could not be saved at all: import
 * a large export, and every edit from then on is lost. IndexedDB on the same
 * origin offered 1,046 MB.
 *
 * The archive is also stored as a live object rather than a JSON string.
 * Structured clone is what IndexedDB wants anyway, and it skips building an
 * 11 MB string on the main thread first — 43 ms of blocking versus 57 ms for
 * `JSON.stringify` alone, before the synchronous write localStorage then adds.
 *
 * Writes still coalesce: a burst of edits becomes one write, run when the
 * browser is idle, with a max-wait so continuous typing cannot starve it and a
 * flush when the page is hidden.
 */

/** The localStorage slot the archive used to live in. Still read, once. */
export const STORAGE_KEY = "together-now:v1";

const DB_NAME = "together-now";
const DB_VERSION = 1;
const STORE = "archive";
const RECORD_KEY = "state";

/** Coalescing window: long enough to swallow a burst of keystrokes. */
const IDLE_DELAY_MS = 400;
/** Hard ceiling, so continuous typing still reaches storage. */
const MAX_WAIT_MS = 2_000;

export type WriteOutcome = "written" | "quota-exceeded" | "unavailable";

/* ------------------------------ localStorage ----------------------------- */

function localStore(): Storage | null {
  try {
    // Accessing localStorage throws outright in some privacy modes.
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readLegacy(): unknown {
  const store = localStore();
  if (!store) return undefined;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    // Corrupt or unreadable: the validator will fall back to a fresh state.
    return undefined;
  }
}

function dropLegacy(): void {
  try {
    localStore()?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do — it is only holding space at this point */
  }
}

function quotaName(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

/** The fallback path, for browsers with no usable IndexedDB. */
function writeLegacy(value: unknown): WriteOutcome {
  const store = localStore();
  if (!store) return "unavailable";
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(value));
    return "written";
  } catch (error) {
    // A full quota is the one failure the user can actually act on, so it is
    // reported rather than swallowed.
    return quotaName(error) ? "quota-exceeded" : "unavailable";
  }
}

/* ------------------------------- IndexedDB ------------------------------- */

let opening: Promise<IDBDatabase | null> | null = null;

/**
 * The database handle, opened once.
 *
 * Resolves to null rather than rejecting when IndexedDB is missing or refused
 * — Firefox private windows and some embedded webviews both do that — so every
 * caller has one thing to check and falls back to localStorage.
 */
function database(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return opening;
}

function readRecord(db: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let request: IDBRequest<unknown>;
    try {
      request = db.transaction(STORE, "readonly").objectStore(STORE).get(RECORD_KEY);
    } catch (error) {
      return reject(error);
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeRecord(db: IDBDatabase, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readwrite");
      // Structured clone happens here, synchronously. It is the one part of a
      // write that touches the main thread; the commit does not.
      tx.objectStore(STORE).put(value, RECORD_KEY);
    } catch (error) {
      return reject(error);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* --------------------------------- api ---------------------------------- */

/**
 * Load the archive, bringing across anything left in the old localStorage
 * slot.
 *
 * The legacy value is not deleted here. It is dropped only once a write to
 * IndexedDB has succeeded, so an interrupted upgrade leaves the archive
 * exactly where the previous build expects to find it.
 */
export async function readStoredState(): Promise<unknown> {
  const db = await database();
  if (!db) return readLegacy();

  try {
    const stored = await readRecord(db);
    if (stored !== undefined && stored !== null) return stored;
  } catch {
    // Fall through: a broken database should not cost anyone their archive
    // when the old copy may still be sitting in localStorage.
  }
  return readLegacy();
}

/**
 * Writes in flight, and the value waiting behind them.
 *
 * A write is no longer instantaneous, so two can overlap — the idle flush and
 * the one on page-hide, most obviously. Rather than letting them race, a write
 * arriving during another is held, and only the newest is kept: they all write
 * the whole archive, so an older one has nothing to contribute.
 */
let inFlight: Promise<WriteOutcome> | null = null;
let queued: { value: unknown } | null = null;

async function performWrite(value: unknown): Promise<WriteOutcome> {
  const db = await database();
  if (!db) return writeLegacy(value);

  try {
    await writeRecord(db, value);
    // Only now is it safe to let go of the old copy.
    dropLegacy();
    return "written";
  } catch (error) {
    if (quotaName(error)) return "quota-exceeded";
    // A database that has gone away mid-session — cleared by the user, or
    // evicted under storage pressure. localStorage will not hold a large
    // archive, but reporting honestly is better than dropping the write.
    return writeLegacy(value);
  }
}

export function writeStoredState(value: unknown): Promise<WriteOutcome> {
  if (inFlight) {
    queued = { value };
    return inFlight;
  }

  inFlight = performWrite(value).finally(() => {
    inFlight = null;
    const next = queued;
    queued = null;
    if (next) void writeStoredState(next.value);
  });

  return inFlight;
}

/** Test seam: forget the cached handle and any queued write. */
export function resetPersistence(): void {
  opening = null;
  inFlight = null;
  queued = null;
}

/* ------------------------------ write-behind ----------------------------- */

type Deadline = { didTimeout: boolean; timeRemaining: () => number };
type IdleWindow = Window & {
  requestIdleCallback?: (cb: (d: Deadline) => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function whenIdle(run: () => void, timeout: number): () => void {
  if (typeof window === "undefined") {
    run();
    return () => {};
  }
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    const handle = w.requestIdleCallback(run, { timeout });
    return () => w.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(run, Math.min(timeout, IDLE_DELAY_MS));
  return () => window.clearTimeout(handle);
}

/**
 * A scheduler that runs `flush` at most once per idle period, no later than
 * {@link MAX_WAIT_MS} after the first pending change, and immediately when the
 * page is being hidden or torn down.
 *
 * The teardown flush is best-effort now that a write is asynchronous: a
 * transaction started as the page goes away may not commit. `visibilitychange`
 * is what fires when someone switches apps on a phone, which is the case that
 * matters, and it leaves the page alive. `MAX_WAIT_MS` bounds what a hard
 * close can cost to the last couple of seconds of edits.
 */
export function createWriteBehind(flush: () => void) {
  let cancelIdle: (() => void) | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  const run = () => {
    if (!pending) return;
    pending = false;
    cancelIdle?.();
    cancelIdle = null;
    if (deadline !== null) {
      clearTimeout(deadline);
      deadline = null;
    }
    flush();
  };

  const onHide = () => {
    if (typeof document === "undefined" || document.visibilityState === "hidden") run();
  };

  if (typeof window !== "undefined") {
    // `pagehide` is the only teardown event that fires reliably on iOS Safari.
    window.addEventListener("pagehide", run);
    document.addEventListener("visibilitychange", onHide);
  }

  return {
    /** Note that state changed; the write happens on the next idle slot. */
    schedule() {
      if (!pending) {
        pending = true;
        deadline = setTimeout(run, MAX_WAIT_MS);
      }
      cancelIdle?.();
      cancelIdle = whenIdle(run, IDLE_DELAY_MS);
    },
    /** Write now if anything is pending. */
    flush: run,
    dispose() {
      run();
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", run);
        document.removeEventListener("visibilitychange", onHide);
      }
    },
  };
}
