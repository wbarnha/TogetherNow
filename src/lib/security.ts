import { AsyncLocalStorage } from "node:async_hooks";

import { setNonceResolver } from "./nonce";

/**
 * Response hardening for the web build.
 *
 * This app keeps the couple's entire archive — plans, moods, expenses, the
 * imported message history — in localStorage on one origin, and pulls data in
 * from QR codes, invite links and exported files. That makes script injection
 * the whole ballgame: anything that runs on this origin can read all of it and
 * post it anywhere. The app previously shipped no CSP, no framing controls and
 * no referrer policy at all.
 *
 * The policy below is nonce-based rather than `'unsafe-inline'`, which is
 * possible because TanStack Router threads `router.options.ssr.nonce` through
 * every script tag it emits — the hydration bootstrap, the streaming barrier
 * and the module preloads. `connect-src` is the backstop: even if something
 * did execute, the only place it could send the archive is back to this origin
 * or to the geocoder.
 */

/**
 * Per-request nonce. A module-level variable would race — a Worker isolate
 * interleaves concurrent requests at every await — so it is carried in
 * async-local storage, which the Cloudflare runtime supports with
 * `nodejs_compat` (already enabled by the nitro preset).
 *
 * This module is server-only: it is imported by `src/server.ts` and nothing in
 * the client graph. `src/lib/nonce.ts` is the isomorphic side, and the
 * resolver installed here is what makes `currentNonce()` work during SSR.
 */
const nonceStorage = new AsyncLocalStorage<string>();

setNonceResolver(() => nonceStorage.getStore());

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Run `fn` with `nonce` visible to `currentNonce()`. */
export function withNonce<T>(nonce: string, fn: () => T): T {
  return nonceStorage.run(nonce, fn);
}

/** Tile server for the Ideas map. */
const TILE_HOST = "https://*.tile.openstreetmap.org";
/** Free-text location search, the app's only outbound API call. */
const GEOCODER = "https://nominatim.openstreetmap.org";

export function contentSecurityPolicy(nonce: string, { dev = false } = {}): string {
  const directives: string[] = [
    "default-src 'self'",
    // Inline scripts carry the nonce; `'self'` still governs the module chunks
    // Vite emits. `'unsafe-inline'` is deliberately absent — with a nonce
    // present a browser ignores it anyway, and its absence is what stops a
    // `javascript:` URL from running.
    `script-src 'self' 'nonce-${nonce}'`,
    // Inline `style` attributes cannot carry a nonce, and Radix, Leaflet and
    // the design system all set them. Style injection is a far smaller problem
    // than script injection, so this is the one relaxation.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: " + TILE_HOST,
    "font-src 'self'",
    // The exfiltration backstop. Everything else in the app is local.
    `connect-src 'self' ${GEOCODER}`,
    "manifest-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ];

  if (dev) {
    // Vite's dev client opens a websocket for HMR and evaluates modules the
    // build step would otherwise have hashed.
    directives[1] = `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-${nonce}'`;
    directives[5] = "connect-src 'self' ws: wss: " + GEOCODER;
  } else {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

/**
 * Headers that do not depend on the request.
 *
 * `Permissions-Policy` denies every capability outright except the two the app
 * genuinely uses — the "use my location" button on Ideas, and copying a share
 * code to the clipboard.
 */
export const STATIC_SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  // An invite link used to carry the whole archive in its query string; this
  // makes sure no URL from this app is ever handed to another origin.
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": [
    "accelerometer=()",
    "camera=()",
    "clipboard-write=(self)",
    "display-capture=()",
    "geolocation=(self)",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "payment=()",
    "usb=()",
    "interest-cohort=()",
  ].join(", "),
};

/**
 * Copy the security headers onto a response.
 *
 * Existing values win, so a route that deliberately sets its own policy is not
 * overwritten. HSTS is only meaningful — and only sent — over HTTPS.
 */
export function applySecurityHeaders(
  response: Response,
  { nonce, url, dev = false }: { nonce: string; url: URL; dev?: boolean },
): Response {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (!headers.has("content-security-policy")) {
    headers.set("content-security-policy", contentSecurityPolicy(nonce, { dev }));
  }
  if (!dev && url.protocol === "https:" && !headers.has("strict-transport-security")) {
    headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
