/**
 * Write-behind persistence for the app store.
 *
 * The previous version serialized the entire archive and wrote it to
 * localStorage inside an effect keyed on the whole state object, so every
 * keystroke in a note re-ran `JSON.stringify` over every message, every watch
 * entry and every expense, then blocked the main thread on a synchronous
 * `setItem`. On an archive with a few thousand imported messages that is tens
 * of milliseconds per character.
 *
 * Here a burst of edits coalesces into one serialize and one write, run when
 * the browser is idle. A max-wait keeps continuous typing from starving the
 * write forever, and a flush on tab-hide means nothing in flight is lost.
 */

export const STORAGE_KEY = "together-now:v1";

/** Coalescing window: long enough to swallow a burst of keystrokes. */
const IDLE_DELAY_MS = 400;
/** Hard ceiling, so continuous typing still reaches storage. */
const MAX_WAIT_MS = 2_000;

export type WriteOutcome = "written" | "quota-exceeded" | "unavailable";

function storage(): Storage | null {
  try {
    // Accessing localStorage throws outright in some privacy modes.
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredState(): unknown {
  const store = storage();
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

export function writeStoredState(value: unknown): WriteOutcome {
  const store = storage();
  if (!store) return "unavailable";
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(value));
    return "written";
  } catch (error) {
    // A full quota is the one failure the user can actually act on, so it is
    // reported rather than swallowed the way the original code did.
    const name = error instanceof Error ? error.name : "";
    return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED"
      ? "quota-exceeded"
      : "unavailable";
  }
}

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
