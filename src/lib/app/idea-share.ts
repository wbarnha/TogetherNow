import { mapLink } from "./places";
import type { Place } from "./types";

/** The message your partner receives when you send them an idea. */
export function ideaMessage(place: Place, fromName: string) {
  const who = fromName.trim() || "Your partner";
  const lines = [
    `${who} added a date idea to your Together list 💛`,
    "",
    place.name,
    place.address,
    place.note,
    mapLink(place),
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export type SendResult = "shared" | "copied" | "failed";

/**
 * Hands the idea to the OS share sheet so it can go out through iMessage,
 * WhatsApp, Discord — whatever your partner uses. Falls back to the clipboard
 * on desktop browsers. No backend involved.
 */
export async function sendIdea(place: Place, fromName: string): Promise<SendResult> {
  const text = ideaMessage(place, fromName);

  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (nav?.share) {
    try {
      await nav.share({ title: place.name, text });
      return "shared";
    } catch (err) {
      // User dismissed the sheet — don't fall through to a surprise clipboard write.
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
