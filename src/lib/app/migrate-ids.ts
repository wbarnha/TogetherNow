/**
 * Re-key items that were saved under the old 32-bit ids.
 *
 * Changing how an id is derived is not just a local rename. Ids are the
 * deduplication key, so an archive left on the old scheme would treat a
 * re-import of the same file as entirely new content. Worse, places and watch
 * entries travel between devices in share codes: a phone still on the old ids
 * and a phone on the new ones would never recognise each other's copies and
 * would accumulate a duplicate of everything they share.
 *
 * The migration is deterministic and derived only from fields the archive
 * already stores, so both phones independently arrive at the same answer and
 * converge — which is what makes the change safe to ship to one side at a
 * time.
 *
 * It is also idempotent: a new id is a pure function of the item's content, so
 * recomputing one that has already been migrated returns the same value.
 *
 * Calendar events are deliberately left alone. `icsEventId` prefers the ICS
 * UID, which the app never stored, so their ids cannot be recomputed from what
 * is on disk — and unlike messages, a calendar holds hundreds of events rather
 * than hundreds of thousands, where a 32-bit space is not a real risk.
 */

import { messageId } from "./chat-import";
import { placeId } from "./places";
import { parsedWatchId } from "./watch";
import type { AppState, ChatMessage, Place, WatchEntry } from "./types";

/** Ids produced by the digest are 32 hex characters; the old ones never were. */
const MIGRATED = /-[0-9a-f]{32}$/;

const isMigrated = (id: string) => MIGRATED.test(id);

function migrateMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.every((m) => isMigrated(m.id))) return messages;
  return messages.map((m) =>
    isMigrated(m.id) ? m : { ...m, id: messageId(m.source, m.at, m.senderName, m.text) },
  );
}

/**
 * Re-key places onto the new digest.
 *
 * Exported because share codes need it too. A place id is a pure function of
 * the place's own content, so this is safe to run on anything — including a
 * partial list, such as the places carried in a share code from a partner who
 * has not updated yet. Without it their copies land under old ids, miss the
 * ones already here, and duplicate until the next launch.
 *
 * Watch entries deliberately get no equivalent. An undated entry's id contains
 * an occurrence counter that separates identical rows, and a share code carries
 * only the last 200 entries — renumbering within that slice would invent ids
 * the sending device never held, which is worse than the duplicate it avoids.
 */
export function migratePlaceIds(places: Place[]): Place[] {
  if (places.every((p) => isMigrated(p.id))) return places;
  return places.map((p) => (isMigrated(p.id) ? p : { ...p, id: placeId(p) }));
}

/**
 * Watch entries need the occurrence counter that separates identical undated
 * rows, and that counter is not stored. Rebuilding it by walking the entries
 * of each service in their stored order reproduces the same numbering the
 * import produced, because this is the same set of rows in the same order.
 */
function migrateWatchEntries(entries: WatchEntry[]): WatchEntry[] {
  if (entries.every((e) => isMigrated(e.id))) return entries;
  const seen = new Map<string, number>();
  return entries.map((e) => {
    const id = parsedWatchId(
      e.service,
      { title: e.title, detail: e.detail, at: e.dateUnknown ? null : e.at },
      seen,
    );
    return isMigrated(e.id) ? e : { ...e, id };
  });
}

/**
 * Drop items that now share an id.
 *
 * Two entries could previously coexist under different 32-bit ids while being
 * the same content — most plausibly the same undated row imported twice before
 * ownership tracking existed. Re-keying makes that visible, and keeping the
 * first is the same rule the importer applies.
 */
function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function migrateItemIds(state: AppState): AppState {
  const chatMessages = migrateMessages(state.chatMessages);
  const places = migratePlaceIds(state.places);
  const watchEntries = migrateWatchEntries(state.watchEntries);

  if (
    chatMessages === state.chatMessages &&
    places === state.places &&
    watchEntries === state.watchEntries
  ) {
    return state;
  }

  return {
    ...state,
    chatMessages: dedupe(chatMessages),
    places: dedupe(places),
    watchEntries: dedupe(watchEntries),
  };
}
