import { describe, expect, it } from "vitest";

import {
  claimLegacyImports,
  mergeChatImport,
  mergeWatchImport,
  ownedMessageCount,
  ownedWatchCount,
  removeChatImport,
  removeWatchImport,
} from "../imports";
import { initialState, type AppState, type ChatMessage, type WatchEntry } from "../types";

/** Ids are handed in so every test is deterministic. */
function ids(...values: string[]) {
  let i = 0;
  return () => values[i++] ?? `extra-${i}`;
}

function message(id: string, at: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    source: "imessage",
    owner: "me",
    senderName: "Sam",
    text: `message ${id}`,
    at,
    ...extra,
  };
}

function entry(id: string, extra: Partial<WatchEntry> = {}): WatchEntry {
  return {
    id,
    service: "netflix",
    title: `title ${id}`,
    owner: "me",
    at: 1_700_000_000_000,
    ...extra,
  };
}

const chatMeta = { source: "imessage", label: "export.txt", firstAt: 0, lastAt: 0 } as const;
const watchMeta = { service: "netflix", label: "history.csv", owner: "me" } as const;

describe("import deletion", () => {
  it("does not delete messages from another import that overlaps in time", () => {
    // Both files cover the same week — the case the old range-based deletion
    // could not tell apart.
    let state: AppState = initialState();
    const first = mergeChatImport(
      state,
      [message("a", 100), message("b", 200)],
      { ...chatMeta, label: "january.txt", firstAt: 100, lastAt: 200 },
      ids("import-1"),
    );
    state = first.state;
    const second = mergeChatImport(
      state,
      [message("c", 150), message("d", 250)],
      { ...chatMeta, label: "overlap.txt", firstAt: 150, lastAt: 250 },
      ids("import-2"),
    );
    state = second.state;
    expect(state.chatMessages).toHaveLength(4);

    const after = removeChatImport(state, "import-1", true);
    expect(after.chatMessages.map((m) => m.id).sort()).toEqual(["c", "d"]);
    expect(after.chatImports.map((i) => i.id)).toEqual(["import-2"]);
  });

  it("does not delete watch entries from another file with the same service and owner", () => {
    let state: AppState = initialState();
    state = mergeWatchImport(state, [entry("a"), entry("b")], watchMeta, ids("w-1")).state;
    state = mergeWatchImport(state, [entry("c")], watchMeta, ids("w-2")).state;
    expect(state.watchEntries).toHaveLength(3);

    const after = removeWatchImport(state, "w-1", true);
    expect(after.watchEntries.map((e) => e.id)).toEqual(["c"]);
  });

  it("keeps manually added watch entries when an import is deleted", () => {
    let state: AppState = initialState();
    state = mergeWatchImport(state, [entry("imported")], watchMeta, ids("w-1")).state;
    // Added by hand from the Watch screen: same service, same owner, no import.
    state = { ...state, watchEntries: [...state.watchEntries, entry("by-hand")] };

    const after = removeWatchImport(state, "w-1", true);
    expect(after.watchEntries.map((e) => e.id)).toEqual(["by-hand"]);
  });

  it("keeps the items when only the record is removed", () => {
    const state = mergeChatImport(initialState(), [message("a", 1)], chatMeta, ids("i1")).state;
    const after = removeChatImport(state, "i1", false);
    expect(after.chatMessages).toHaveLength(1);
    expect(after.chatImports).toHaveLength(0);
  });

  it("reports how much a deletion would remove", () => {
    let state: AppState = initialState();
    state = mergeChatImport(state, [message("a", 1), message("b", 2)], chatMeta, ids("i1")).state;
    state = mergeWatchImport(state, [entry("x")], watchMeta, ids("w1")).state;
    expect(ownedMessageCount(state, "i1")).toBe(2);
    expect(ownedMessageCount(state, "nope")).toBe(0);
    expect(ownedWatchCount(state, "w1")).toBe(1);
  });
});

describe("import result reporting", () => {
  it("reports exactly the messages that were added", () => {
    const result = mergeChatImport(
      initialState(),
      [message("a", 1), message("b", 2)],
      chatMeta,
      ids("i1"),
    );
    expect(result.added).toBe(2);
    expect(result.state.chatMessages).toHaveLength(2);
  });

  it("reports zero for a duplicate-only import and creates no record", () => {
    const first = mergeChatImport(initialState(), [message("a", 1)], chatMeta, ids("i1"));
    const second = mergeChatImport(first.state, [message("a", 1)], chatMeta, ids("i2"));
    expect(second.added).toBe(0);
    expect(second.record).toBeUndefined();
    expect(second.state.chatImports).toHaveLength(1);
    expect(second.state).toBe(first.state);
  });

  it("counts only the new items in a mixed import", () => {
    const first = mergeChatImport(initialState(), [message("a", 1)], chatMeta, ids("i1"));
    const second = mergeChatImport(
      first.state,
      [message("a", 1), message("b", 2), message("c", 3)],
      chatMeta,
      ids("i2"),
    );
    expect(second.added).toBe(2);
    expect(second.state.chatMessages.map((m) => m.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("reports the same way for watch imports", () => {
    const first = mergeWatchImport(initialState(), [entry("a")], watchMeta, ids("w1"));
    expect(first.added).toBe(1);
    const second = mergeWatchImport(first.state, [entry("a"), entry("b")], watchMeta, ids("w2"));
    expect(second.added).toBe(1);
  });

  it("stamps every added item with the import that brought it in", () => {
    const result = mergeChatImport(
      initialState(),
      [message("a", 1), message("b", 2)],
      chatMeta,
      ids("i1"),
    );
    expect(result.state.chatMessages.every((m) => m.importId === "i1")).toBe(true);
    expect(result.record?.messageCount).toBe(2);
  });

  it("separates what was skipped for space from what was a duplicate", () => {
    // Squeeze the archive to its ceiling so the next import cannot fit.
    const full: AppState = {
      ...initialState(),
      chatMessages: Array.from({ length: 200_000 }, (_, i) => message(`m${i}`, i)),
    };
    const result = mergeChatImport(full, [message("new", 1)], chatMeta, ids("i1"));
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe("claimLegacyImports", () => {
  it("claims items when exactly one record could own them", () => {
    const state: AppState = {
      ...initialState(),
      chatMessages: [message("a", 150)],
      chatImports: [
        {
          id: "i1",
          source: "imessage",
          label: "a.txt",
          messageCount: 1,
          firstAt: 100,
          lastAt: 200,
          importedAt: 1,
        },
      ],
    };
    expect(claimLegacyImports(state).chatMessages[0]?.importId).toBe("i1");
  });

  it("leaves an item unowned when two records overlap it", () => {
    const record = (id: string, firstAt: number, lastAt: number) => ({
      id,
      source: "imessage" as const,
      label: `${id}.txt`,
      messageCount: 1,
      firstAt,
      lastAt,
      importedAt: 1,
    });
    const state: AppState = {
      ...initialState(),
      chatMessages: [message("a", 150)],
      chatImports: [record("i1", 100, 200), record("i2", 120, 300)],
    };
    const claimed = claimLegacyImports(state);
    expect(claimed.chatMessages[0]?.importId).toBeUndefined();
    // And so deleting either import leaves the ambiguous message alone.
    expect(removeChatImport(claimed, "i1", true).chatMessages).toHaveLength(1);
  });

  it("does not reassign an item that already has an owner", () => {
    const state: AppState = {
      ...initialState(),
      watchEntries: [entry("a", { importId: "original" })],
      watchImports: [
        {
          id: "other",
          service: "netflix",
          label: "x.csv",
          owner: "me",
          entryCount: 1,
          importedAt: 1,
        },
      ],
    };
    expect(claimLegacyImports(state).watchEntries[0]?.importId).toBe("original");
  });

  it("is a no-op once everything is owned", () => {
    const state = mergeChatImport(initialState(), [message("a", 1)], chatMeta, ids("i1")).state;
    expect(claimLegacyImports(state)).toBe(state);
  });
});
