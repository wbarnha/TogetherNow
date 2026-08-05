/**
 * Merging and removing imported archives.
 *
 * Two problems live here, and both come from the same root: an import record
 * used to describe its contents rather than own them.
 *
 * Removing a chat import deleted every message from that service between the
 * record's first and last timestamps, so a second import overlapping that range
 * lost messages it had brought in. Removing a watch import was blunter still —
 * it deleted every entry for that service and owner, including entries from
 * other files and ones typed in by hand. Neither is recoverable: there is no
 * backend and no undo.
 *
 * Now each imported item carries the id of the import that brought it in, and
 * removal only ever touches items that name the record being removed.
 *
 * The merges are also pure functions returning both the next state and what
 * they did. The store used to assign the added count inside a React updater and
 * return it immediately, before the updater had run, so a successful import
 * could tell the user nothing was new.
 */

import { LIMITS } from "./validate";
import type { AppState, ChatImport, ChatMessage, WatchEntry, WatchImport } from "./types";

export type MergeResult<Record> = {
  state: AppState;
  /** Items actually added, after skipping duplicates and applying the cap. */
  added: number;
  /** Items dropped because the archive is already at its ceiling. */
  skipped: number;
  /** Absent when nothing was added, in which case no record is created. */
  record?: Record;
};

/* -------------------------------- merging -------------------------------- */

export function mergeChatImport(
  state: AppState,
  messages: ChatMessage[],
  meta: Omit<ChatImport, "id" | "importedAt" | "messageCount">,
  newId: () => string,
): MergeResult<ChatImport> {
  const known = new Set(state.chatMessages.map((m) => m.id));
  const unseen = messages.filter((m) => !known.has(m.id));
  const room = Math.max(0, LIMITS.chatMessages - state.chatMessages.length);
  const fresh = unseen.slice(0, room);
  const skipped = unseen.length - fresh.length;

  if (fresh.length === 0) return { state, added: 0, skipped };

  const record: ChatImport = {
    ...meta,
    id: newId(),
    messageCount: fresh.length,
    importedAt: Date.now(),
  };
  // Stamped here rather than by the caller so an item can never reach the
  // archive without an owner.
  const owned = fresh.map((m) => ({ ...m, importId: record.id }));

  return {
    state: {
      ...state,
      chatMessages: [...state.chatMessages, ...owned].sort((a, b) => a.at - b.at),
      chatImports: [...state.chatImports, record],
    },
    added: owned.length,
    skipped,
    record,
  };
}

export function mergeWatchImport(
  state: AppState,
  entries: WatchEntry[],
  meta: Omit<WatchImport, "id" | "importedAt" | "entryCount">,
  newId: () => string,
): MergeResult<WatchImport> {
  const known = new Set(state.watchEntries.map((e) => e.id));
  const unseen = entries.filter((e) => !known.has(e.id));
  const room = Math.max(0, LIMITS.watchEntries - state.watchEntries.length);
  const fresh = unseen.slice(0, room);
  const skipped = unseen.length - fresh.length;

  if (fresh.length === 0) return { state, added: 0, skipped };

  const record: WatchImport = {
    ...meta,
    id: newId(),
    entryCount: fresh.length,
    importedAt: Date.now(),
  };
  const owned = fresh.map((e) => ({ ...e, importId: record.id }));

  return {
    state: {
      ...state,
      watchEntries: [...state.watchEntries, ...owned].sort((a, b) => a.at - b.at),
      watchImports: [...state.watchImports, record],
    },
    added: owned.length,
    skipped,
    record,
  };
}

/* -------------------------------- removal -------------------------------- */

/** How many messages would be deleted along with this import. */
export function ownedMessageCount(state: AppState, importId: string): number {
  return state.chatMessages.reduce((n, m) => (m.importId === importId ? n + 1 : n), 0);
}

/** How many watch entries would be deleted along with this import. */
export function ownedWatchCount(state: AppState, importId: string): number {
  return state.watchEntries.reduce((n, e) => (e.importId === importId ? n + 1 : n), 0);
}

export function removeChatImport(state: AppState, id: string, alsoMessages: boolean): AppState {
  return {
    ...state,
    chatImports: state.chatImports.filter((i) => i.id !== id),
    // Only what this import brought in. An item with no owner predates
    // ownership tracking and could not be attributed, so it is never removed
    // on the strength of a guess.
    chatMessages: alsoMessages
      ? state.chatMessages.filter((m) => m.importId !== id)
      : state.chatMessages,
  };
}

export function removeWatchImport(state: AppState, id: string, alsoEntries: boolean): AppState {
  return {
    ...state,
    watchImports: state.watchImports.filter((i) => i.id !== id),
    watchEntries: alsoEntries
      ? state.watchEntries.filter((e) => e.importId !== id)
      : state.watchEntries,
  };
}

/* ------------------------------- migration ------------------------------- */

/**
 * Attach owners to items imported before ownership was tracked.
 *
 * An item is claimed only when exactly one existing record could have brought
 * it in, using the same rules the old deletion code used. Where two records
 * overlap — the case that made the old behaviour destructive — the item stays
 * unowned and no deletion will touch it. That is deliberately conservative:
 * leaving an old message undeletable is recoverable, deleting the wrong one is
 * not.
 *
 * Runs on hydration and is idempotent; items that already have an owner are
 * left alone.
 */
export function claimLegacyImports(state: AppState): AppState {
  const orphanMessages = state.chatMessages.some((m) => m.importId === undefined);
  const orphanEntries = state.watchEntries.some((e) => e.importId === undefined);
  if (!orphanMessages && !orphanEntries) return state;

  const claim = <T>(candidates: T[], idOf: (record: T) => string): string | undefined =>
    candidates.length === 1 ? idOf(candidates[0]!) : undefined;

  const chatMessages = !orphanMessages
    ? state.chatMessages
    : state.chatMessages.map((m) => {
        if (m.importId !== undefined) return m;
        const owner = claim(
          state.chatImports.filter(
            (i) => i.source === m.source && m.at >= i.firstAt && m.at <= i.lastAt,
          ),
          (i) => i.id,
        );
        return owner === undefined ? m : { ...m, importId: owner };
      });

  const watchEntries = !orphanEntries
    ? state.watchEntries
    : state.watchEntries.map((e) => {
        if (e.importId !== undefined) return e;
        const owner = claim(
          state.watchImports.filter((i) => i.service === e.service && i.owner === e.owner),
          (i) => i.id,
        );
        return owner === undefined ? e : { ...e, importId: owner };
      });

  return { ...state, chatMessages, watchEntries };
}
