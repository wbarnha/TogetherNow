/**
 * Decoding a share code without handing the UI over to whoever sent it.
 *
 * `parseShareCode` is synchronous, and both of its expensive steps —
 * decompression and `JSON.parse` — run to completion once started. Neither can
 * be interrupted, and the size check only happens after decompression has
 * already returned, so it bounds what gets parsed rather than what gets
 * inflated. lz-string reaches better than a thousandfold expansion on
 * repetitive input, which means a code short enough to paste into a chat
 * message can inflate into hundreds of megabytes.
 *
 * Worse, the accept-invite screen called it from a `useMemo`, so that work
 * happened during React's render pass: no spinner, no cancel, nothing painted
 * until it finished or the tab died.
 *
 * Three things change that. The input cap is now a little over what the app
 * can itself produce rather than twenty-three times more. The inflate step
 * runs on a worker. And the worker is given a deadline, after which it is
 * terminated — the only way to actually stop this work, since a decompression
 * already in progress will not check a flag.
 */

import {
  NOT_A_CODE,
  UNREADABLE,
  inflateShareCode,
  shareCodeBody,
  validateSharePayload,
  type SharePayload,
} from "./share";
import type { ShareWorkerRequest, ShareWorkerResponse } from "./share-worker";

/**
 * How long a code gets before it is abandoned.
 *
 * A code built from an archive sitting on every share cap decompresses and
 * parses in around 50 ms on a laptop. Phones are several times slower and a
 * cold worker has to start up, so this is generous by an order of magnitude
 * while still bounding a hostile code to something the user can wait out.
 */
export const DECODE_TIMEOUT_MS = 3_000;

export const TOO_SLOW =
  "That code is taking too long to open — it may be damaged or far too large.";

let nextRequestId = 1;

function workersAvailable(): boolean {
  return typeof Worker !== "undefined" && typeof URL !== "undefined";
}

/**
 * Workers are created per decode rather than pooled.
 *
 * Termination is the cancellation mechanism, so a shared worker would have to
 * be rebuilt after every timeout anyway, and a decode is rare — a couple of
 * times in the life of an install.
 */
function spawn(): Worker | null {
  try {
    return new Worker(new URL("./share-worker.ts", import.meta.url), { type: "module" });
  } catch {
    // Blocked by a policy, or an environment that reports Worker but cannot
    // build one from a module URL. The caller falls back to inline decoding.
    return null;
  }
}

/**
 * Decode a pasted or scanned code into a payload that is safe to merge.
 *
 * Rejects with a message fit to show the user. Pass a signal to abandon the
 * work when the screen goes away — the worker is terminated, not just ignored.
 */
export async function decodeShareCode(
  raw: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<SharePayload> {
  const { signal, timeoutMs = DECODE_TIMEOUT_MS } = options;

  // Cheap, and worth doing before spending a worker on it.
  const body = shareCodeBody(raw);

  if (signal?.aborted) throw new Error(UNREADABLE);

  const active = workersAvailable() ? spawn() : null;
  if (!active) return validateSharePayload(inflateShareCode(body));

  const id = nextRequestId++;

  const value = await new Promise<unknown>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      active.terminate();
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new Error(TOO_SLOW))), timeoutMs);
    const onAbort = () => finish(() => reject(new Error(UNREADABLE)));
    signal?.addEventListener("abort", onAbort, { once: true });

    active.addEventListener("message", (event: MessageEvent<ShareWorkerResponse>) => {
      const data = event.data;
      if (!data || data.id !== id) return;
      finish(() => (data.ok ? resolve(data.value) : reject(new Error(data.message || UNREADABLE))));
    });

    // A worker that dies — most likely out of memory on a code that inflated
    // past what the device could hold — must not leave the caller hanging.
    active.addEventListener("error", () => finish(() => reject(new Error(NOT_A_CODE))));

    active.postMessage({ id, body } satisfies ShareWorkerRequest);
  });

  // Validation deliberately runs here, not in the worker: it is bounded by the
  // share caps, it is where every other untrusted input is checked, and a
  // message arriving from anywhere else still has to pass it.
  return validateSharePayload(value);
}
