import type { AppState } from "./types";
import { buildShareCode } from "./share";

/**
 * Where an invite link points when there is no window to ask.
 *
 * A base URL rather than a bare origin, because the published site is a project
 * GitHub Pages site and lives under a path. It previously named togethernow.app,
 * a domain this project does not own.
 *
 * This is a fallback that should never fire in practice: the only caller runs
 * behind a `hydrated` guard, and the native shell has a window like any browser.
 * It matters anyway, because whatever it names is compiled into the client
 * bundle and would be handed to a partner if it ever did fire.
 *
 * The app itself is not served there, so `/pair` resolves to the site's 404
 * page — which is written to recognise an invite link and say what to do with
 * it, rather than leaving the recipient staring at "not found". See
 * scripts/build-pages.mjs.
 */
const DEFAULT_INVITE_BASE = "https://wbarnha.github.io/TogetherNow";

function currentOrigin(): string {
  return typeof window === "undefined" ? DEFAULT_INVITE_BASE : window.location.origin;
}

/**
 * Where the invite link points — the app's own /pair page on this origin.
 *
 * The code rides in the URL *fragment*, not the query string. A fragment is
 * never sent to a server, never appears in an access log or a `Referer`
 * header, and is not forwarded to the third parties this page links out to.
 * A `?code=` link leaks the couple's entire archive — plans, moods, expenses,
 * viewing history — to every hop that handles the URL.
 */
export function inviteLink(state: AppState, origin?: string): string {
  return `${origin ?? currentOrigin()}/pair#code=${encodeURIComponent(buildShareCode(state))}`;
}

/**
 * Pull an invite code out of a location, accepting the legacy `?code=` form so
 * links sent before the move to fragments still open.
 */
export function readInviteCode(location: {
  search: string;
  hash: string;
}): { code: string; legacy: boolean } | null {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const fromHash = new URLSearchParams(hash).get("code");
  if (fromHash) return { code: fromHash, legacy: false };

  const fromQuery = new URLSearchParams(location.search).get("code");
  if (fromQuery) return { code: fromQuery, legacy: true };

  return null;
}

export function inviteMessage(state: AppState, origin?: string): string {
  const me = state.me.name.trim() || "Your partner";
  const them = state.them.name.trim();
  return [
    them ? `Hey ${them} —` : "Hey —",
    `${me} wants to plan with you on Together Now.`,
    "",
    "Open this link on your phone to connect and pull in our plans, dates and Together list:",
    inviteLink(state, origin),
    "",
    "No account needed — everything stays on our own phones.",
  ].join("\n");
}

export type InviteResult = "shared" | "copied" | "failed";

/** Hands the invite to the OS share sheet, falling back to the clipboard. */
export async function sendInvite(state: AppState, origin?: string): Promise<InviteResult> {
  const text = inviteMessage(state, origin);
  const nav = typeof navigator === "undefined" ? undefined : navigator;

  if (nav?.share) {
    try {
      await nav.share({ title: "Together Now invite", text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "failed";
    }
  }

  try {
    await nav?.clipboard?.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
