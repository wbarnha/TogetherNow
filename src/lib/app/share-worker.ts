/// <reference lib="webworker" />

/**
 * Decompresses a share code away from the main thread.
 *
 * Only the inflate half runs here. Validation stays on the main thread so the
 * trust boundary lives in one place and cannot be bypassed by a message that
 * did not come from this worker; what is posted back is still untrusted.
 */

import { inflateShareCode } from "./share";

export type ShareWorkerRequest = { id: number; body: string };
export type ShareWorkerResponse =
  { id: number; ok: true; value: unknown } | { id: number; ok: false; message: string };

/**
 * Note on origin checking.
 *
 * A dedicated worker's message port is reachable only by the one document that
 * constructed it — there is no channel by which another origin could post
 * here, and `MessageEvent.origin` is the empty string in this context, so
 * there is nothing to compare against. Origin checks belong on `window`
 * listeners, where a cross-origin frame really can be the sender.
 *
 * What is worth doing is not trusting the *shape* of what arrives, which is
 * why the request is checked rather than destructured blind: a malformed
 * message should produce a reply the caller can act on, not an exception that
 * takes the worker down and looks to `decodeShareCode` like a code so large it
 * exhausted memory.
 */
function isRequest(data: unknown): data is ShareWorkerRequest {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as ShareWorkerRequest).id === "number" &&
    typeof (data as ShareWorkerRequest).body === "string"
  );
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isRequest(event.data)) return;
  const { id, body } = event.data;
  let response: ShareWorkerResponse;
  try {
    response = { id, ok: true, value: inflateShareCode(body) };
  } catch (err) {
    response = { id, ok: false, message: err instanceof Error ? err.message : "unreadable" };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
});
