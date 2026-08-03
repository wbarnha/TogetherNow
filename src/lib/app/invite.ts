import type { AppState } from "./types";
import { buildShareCode } from "./share";

/** Where the invite link points — the app's own /pair page on this origin. */
export function inviteLink(state: AppState, origin?: string): string {
  const base =
    origin ?? (typeof window === "undefined" ? "https://togethernow.app" : window.location.origin);
  return `${base}/pair?code=${encodeURIComponent(buildShareCode(state))}`;
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
