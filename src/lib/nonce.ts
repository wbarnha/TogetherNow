/**
 * Isomorphic access to the request's CSP nonce.
 *
 * `getRouter` runs in both the SSR render and the browser, so it cannot import
 * the server-only machinery that actually tracks the nonce — pulling
 * `node:async_hooks` into the client bundle breaks hydration outright.
 *
 * Instead the server installs a resolver at startup and this module reads it.
 * The slot lives on `globalThis` rather than in a module-level variable so it
 * survives the bundler splitting this module across server chunks.
 */

const SLOT = Symbol.for("together-now.nonce-resolver");

type Holder = { [SLOT]?: () => string | undefined };

/** Called once by the server entry. No-op in the browser. */
export function setNonceResolver(resolve: () => string | undefined): void {
  (globalThis as Holder)[SLOT] = resolve;
}

/** The nonce for the request being rendered, or undefined in the browser. */
export function currentNonce(): string | undefined {
  return (globalThis as Holder)[SLOT]?.();
}
