import { describe, expect, it } from "vitest";

import { applySecurityHeaders, contentSecurityPolicy, createNonce, withNonce } from "../security";
import { currentNonce } from "../nonce";

const https = new URL("https://togethernow.app/pair");

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split("; ").map((part) => {
      const space = part.indexOf(" ");
      return space === -1 ? [part, ""] : [part.slice(0, space), part.slice(space + 1)];
    }),
  );
}

describe("createNonce", () => {
  it("returns a fresh, high-entropy value each call", () => {
    const values = new Set(Array.from({ length: 200 }, createNonce));
    expect(values.size).toBe(200);
    // 16 random bytes, base64 encoded.
    for (const value of values) expect(value).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("withNonce", () => {
  it("scopes the nonce to its async context", async () => {
    expect(currentNonce()).toBeUndefined();

    const [a, b] = await Promise.all([
      withNonce("aaa", async () => {
        await new Promise((r) => setTimeout(r, 5));
        return currentNonce();
      }),
      withNonce("bbb", async () => currentNonce()),
    ]);

    // Interleaved requests must not see each other's nonce.
    expect(a).toBe("aaa");
    expect(b).toBe("bbb");
    expect(currentNonce()).toBeUndefined();
  });
});

describe("contentSecurityPolicy", () => {
  const csp = directives(contentSecurityPolicy("NONCE"));

  it("refuses inline script outright", () => {
    expect(csp.get("script-src")).toBe("'self' 'nonce-NONCE'");
    expect(csp.get("script-src")).not.toContain("unsafe-inline");
    expect(csp.get("script-src")).not.toContain("unsafe-eval");
  });

  it("limits outbound connections to this origin and the geocoder", () => {
    expect(csp.get("connect-src")).toBe("'self' https://nominatim.openstreetmap.org");
  });

  it("locks down the directives that enable clickjacking and injection", () => {
    expect(csp.get("frame-ancestors")).toBe("'none'");
    expect(csp.get("object-src")).toBe("'none'");
    expect(csp.get("base-uri")).toBe("'self'");
    expect(csp.get("form-action")).toBe("'self'");
    expect(csp.get("default-src")).toBe("'self'");
  });

  it("serves fonts from this origin only", () => {
    expect(csp.get("font-src")).toBe("'self'");
  });

  it("relaxes only what the dev server needs, and only in dev", () => {
    const dev = directives(contentSecurityPolicy("NONCE", { dev: true }));
    expect(dev.get("script-src")).toContain("unsafe-eval");
    expect(dev.get("connect-src")).toContain("ws:");
    expect(csp.has("upgrade-insecure-requests")).toBe(true);
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });
});

describe("applySecurityHeaders", () => {
  it("adds the full set to an ordinary response", () => {
    const res = applySecurityHeaders(new Response("hi"), { nonce: "N", url: https });
    expect(res.headers.get("content-security-policy")).toContain("'nonce-N'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });

  it("keeps the permissions the app actually uses", () => {
    const policy =
      applySecurityHeaders(new Response("hi"), { nonce: "N", url: https }).headers.get(
        "permissions-policy",
      ) ?? "";
    expect(policy).toContain("geolocation=(self)");
    expect(policy).toContain("clipboard-write=(self)");
  });

  it("preserves the body and status", async () => {
    const res = applySecurityHeaders(new Response("boom", { status: 500 }), {
      nonce: "N",
      url: https,
    });
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("boom");
  });

  it("does not overwrite a header a route already set", () => {
    const res = applySecurityHeaders(
      new Response("hi", { headers: { "referrer-policy": "origin" } }),
      { nonce: "N", url: https },
    );
    expect(res.headers.get("referrer-policy")).toBe("origin");
  });

  it("omits HSTS where it would be meaningless", () => {
    const plain = applySecurityHeaders(new Response("hi"), {
      nonce: "N",
      url: new URL("http://localhost:3000/"),
    });
    expect(plain.headers.get("strict-transport-security")).toBeNull();
    const dev = applySecurityHeaders(new Response("hi"), { nonce: "N", url: https, dev: true });
    expect(dev.headers.get("strict-transport-security")).toBeNull();
  });
});
