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

self.addEventListener("message", (event: MessageEvent<ShareWorkerRequest>) => {
  const { id, body } = event.data;
  let response: ShareWorkerResponse;
  try {
    response = { id, ok: true, value: inflateShareCode(body) };
  } catch (err) {
    response = { id, ok: false, message: err instanceof Error ? err.message : "unreadable" };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
});
