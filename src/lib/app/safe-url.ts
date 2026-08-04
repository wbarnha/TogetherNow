/**
 * Scheme allowlist for every URL that reaches an `href`, `window.open` or the
 * OS share sheet.
 *
 * Place and travel links arrive from places the user does not control: a
 * partner's share code, a Google Takeout CSV, a KML file, a pasted list. A
 * `javascript:` URL rendered into an `<a href>` runs in this origin, and this
 * origin holds the couple's entire archive in localStorage — plans, moods,
 * expenses, the whole message history. So links are filtered at the point they
 * are stored *and* again at the point they are rendered.
 */

/** Schemes that can navigate somewhere harmless. */
const NAVIGABLE = new Set(["http:", "https:", "mailto:", "tel:", "sms:", "geo:"]);

/** Extra schemes the app itself builds for one-tap handoff to a native app. */
const APP_SCHEMES = new Set([
  "facetime:",
  "maps:",
  "comgooglemaps:",
  "discord:",
  "instagram:",
  "tg:",
  "whatsapp:",
  "chatgpt:",
]);

/* eslint-disable no-control-regex */
/** Tab, LF and CR — the URL parser drops these from anywhere in the input. */
const STRIPPED_ANYWHERE = /[\u0009\u000a\u000d]/g;
/** C0 controls and spaces — the URL parser trims these from both ends. */
const TRIMMED_AT_EDGES = /^[\u0000-\u0020]+|[\u0000-\u0020]+$/g;
/* eslint-enable no-control-regex */

/**
 * Apply the WHATWG URL cleanup that browsers perform before parsing a scheme,
 * so `java\tscript:alert(1)` cannot slip past the allowlist by looking like a
 * relative URL to a naive check while the browser still runs it as script.
 */
function canonicalize(raw: string): string {
  return raw.replace(STRIPPED_ANYWHERE, "").replace(TRIMMED_AT_EDGES, "");
}

function parse(raw: string | undefined): URL | null {
  if (typeof raw !== "string") return null;
  const cleaned = canonicalize(raw);
  if (!cleaned) return null;
  try {
    return new URL(cleaned);
  } catch {
    return null;
  }
}

/**
 * The URL if it is safe to hand to an `href` / `window.open`, else undefined.
 * Accepts web links plus the messaging and map schemes the app links out to.
 */
export function safeExternalUrl(raw: string | undefined): string | undefined {
  const url = parse(raw);
  if (!url) return undefined;
  if (!NAVIGABLE.has(url.protocol) && !APP_SCHEMES.has(url.protocol)) return undefined;
  return url.href;
}

/**
 * The URL if it is an ordinary web link, else undefined. Use this for anything
 * that came out of an import or a partner's share code, where an app-scheme
 * link has no legitimate reason to appear.
 */
export function safeHttpUrl(raw: string | undefined): string | undefined {
  const url = parse(raw);
  if (!url) return undefined;
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  return url.href;
}

/** True when the value is present but would be rejected by {@link safeHttpUrl}. */
export function isUnsafeUrl(raw: string | undefined): boolean {
  return raw != null && raw.trim() !== "" && safeHttpUrl(raw) === undefined;
}
