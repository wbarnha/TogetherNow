/**
 * Recovers the original Error out-of-band so `server.ts` can log a real stack
 * when h3 has already swallowed the throw into a generic 500 Response.
 *
 * The previous version kept the last error in a module-level variable with a
 * five-second time-to-live. In a Worker isolate, which interleaves concurrent
 * requests at every await, that is a cross-request leak: request B's 500 page
 * could be logged with request A's error, and these errors carry whatever the
 * failing request was holding. The capture is now scoped to the async context
 * of the request that produced it, so a stack can only ever reach the request
 * it came from.
 */

import { AsyncLocalStorage } from "node:async_hooks";

type Slot = { error?: unknown };

const captureStorage = new AsyncLocalStorage<Slot>();

/** Run `fn` with its own capture slot. */
export function withErrorCapture<T>(fn: () => T): T {
  return captureStorage.run({}, fn);
}

function record(error: unknown) {
  const slot = captureStorage.getStore();
  if (slot) slot.error = error;
}

/** Take the error captured during this request, if any. */
export function consumeCapturedError(): unknown {
  const slot = captureStorage.getStore();
  if (!slot || slot.error === undefined) return undefined;
  const { error } = slot;
  slot.error = undefined;
  return error;
}

// h3's HTTPError serializes to {"status":500,"unhandled":true,"message":"HTTPError"} —
// no stack, no cause — so a plain console.error(error) reaches the log pipeline with
// the failure detail stripped. Expand Error-like args into a string that keeps the
// message, stack, and the full cause chain.
const CAUSE_DEPTH_LIMIT = 5;
const DESCRIPTION_LENGTH_LIMIT = 8_000;

export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < CAUSE_DEPTH_LIMIT && current != null; depth++) {
    if (!(current instanceof Error)) {
      parts.push(typeof current === "string" ? current : safeStringify(current));
      break;
    }
    const label = depth === 0 ? "" : "caused by: ";
    const status = describeStatus(current);
    parts.push(`${label}${current.stack ?? `${current.name}: ${current.message}`}${status}`);
    current = current.cause;
  }
  return parts.join("\n").slice(0, DESCRIPTION_LENGTH_LIMIT);
}

function describeStatus(error: Error): string {
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const value = status ?? statusCode;
  return typeof value === "number" ? ` (status ${value})` : "";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// Wrap console.error so errors logged by any layer — including h3's internal
// unhandled-error logging, which this file cannot hook directly — are both
// recorded for consumeCapturedError and expanded before serialization.
//
// Guarded so a hot reload or a second import cannot wrap the wrapper, which
// would expand the same error once per generation.
const WRAPPED = Symbol.for("together-now.console-error-wrapped");
type Marked = typeof console.error & { [WRAPPED]?: true };

if (!(console.error as Marked)[WRAPPED]) {
  const originalConsoleError = console.error.bind(console);
  const wrapped: Marked = (...args: unknown[]) => {
    const expanded = args.map((arg) => {
      if (!(arg instanceof Error)) return arg;
      record(arg);
      return describeError(arg);
    });
    originalConsoleError(...expanded);
  };
  wrapped[WRAPPED] = true;
  console.error = wrapped;
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}
