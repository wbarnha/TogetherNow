import { describe, expect, it } from "vitest";

import { legacyMessageId, messageId } from "../chat-import";
import { mergeChatImport, mergeWatchImport } from "../imports";
import { migrateItemIds } from "../migrate-ids";
import { applyShareCode } from "../share";
import { legacyPlaceId, placeId, type ParsedPlace } from "../places";
import { initialState } from "../types";
import type { AppState, ChatMessage, Place, WatchEntry } from "../types";
import {
  legacyUndatedWatchId,
  legacyWatchId,
  undatedWatchId,
  watchId,
  type ParsedWatch,
} from "../watch";

const AT = 1_700_000_000_000;

function message(over: Partial<ChatMessage> = {}): ChatMessage {
  const m: ChatMessage = {
    id: "",
    source: "imessage",
    owner: "me",
    senderName: "Ada",
    text: "see you soon",
    at: AT,
    ...over,
  };
  return { ...m, id: over.id ?? legacyMessageId(m.source, m.at, m.text) };
}

function place(over: Partial<Place> = {}): Place {
  const p: Place = {
    id: "",
    name: "Tartine",
    address: "600 Guerrero St",
    owner: "me",
    source: "manual",
    visited: false,
    updatedAt: AT,
    ...over,
  };
  return { ...p, id: over.id ?? legacyPlaceId(p) };
}

function watch(over: Partial<WatchEntry> = {}): WatchEntry {
  const e: WatchEntry = {
    id: "",
    service: "netflix",
    title: "Arcane",
    detail: "S1:E1",
    owner: "me",
    at: AT,
    ...over,
  };
  const id =
    over.id ??
    (e.dateUnknown
      ? legacyUndatedWatchId(e.service, e.title, e.detail, 0)
      : legacyWatchId(e.service, e.at, e.title, e.detail));
  return { ...e, id };
}

function stateWith(over: Partial<AppState> = {}): AppState {
  return { ...initialState(), ...over };
}

describe("migrateItemIds", () => {
  it("re-keys items saved under the old 32-bit ids", () => {
    const before = stateWith({
      chatMessages: [message()],
      places: [place()],
      watchEntries: [watch()],
    });

    const after = migrateItemIds(before);

    expect(after.chatMessages[0]!.id).toBe(messageId("imessage", AT, "Ada", "see you soon"));
    expect(after.places[0]!.id).toBe(placeId(after.places[0]!));
    expect(after.watchEntries[0]!.id).toBe(watchId("netflix", AT, "Arcane", "S1:E1"));
  });

  it("leaves an already-migrated archive untouched, object identity included", () => {
    const migrated = migrateItemIds(
      stateWith({ chatMessages: [message()], places: [place()], watchEntries: [watch()] }),
    );

    // The second pass must not allocate: hydration runs on every launch, and a
    // new array each time would defeat the memoised selectors downstream.
    expect(migrateItemIds(migrated)).toBe(migrated);
  });

  it("is idempotent in value as well as identity", () => {
    const once = migrateItemIds(
      stateWith({ chatMessages: [message()], places: [place()], watchEntries: [watch()] }),
    );
    expect(migrateItemIds(once)).toEqual(once);
  });

  it("converges two devices that migrate independently", () => {
    // This is the property the whole approach rests on. Places and watch
    // entries travel in share codes, so if the two phones disagreed about an
    // id they would accumulate a duplicate of everything they shared.
    const content = () => ({
      chatMessages: [message(), message({ text: "landed", at: AT + 1000 })],
      places: [place(), place({ name: "Zuni Café", address: "1658 Market St" })],
      watchEntries: [watch(), watch({ title: "Severance", detail: "S2:E3", at: AT + 90_000 })],
    });

    const mine = migrateItemIds(stateWith(content()));
    const theirs = migrateItemIds(stateWith(content()));

    expect(mine.chatMessages.map((m) => m.id)).toEqual(theirs.chatMessages.map((m) => m.id));
    expect(mine.places.map((p) => p.id)).toEqual(theirs.places.map((p) => p.id));
    expect(mine.watchEntries.map((e) => e.id)).toEqual(theirs.watchEntries.map((e) => e.id));
  });

  it("agrees with a phone that never held the old ids", () => {
    // A device installed after the change writes new ids directly. Its copy of
    // a shared place has to match the migrated one, or the pair sees two.
    const parsed: ParsedPlace = { name: "Tartine", address: "600 Guerrero St" };
    const migrated = migrateItemIds(stateWith({ places: [place()] }));
    expect(migrated.places[0]!.id).toBe(placeId(parsed));
  });

  it("keeps everything about an item except its id", () => {
    const before = stateWith({
      chatMessages: [message({ importId: "imp-1", owner: "them", senderName: "Sam" })],
      watchEntries: [watch({ importId: "imp-2", minutes: 42, together: true })],
    });

    const after = migrateItemIds(before);

    expect(after.chatMessages[0]).toMatchObject({
      importId: "imp-1",
      owner: "them",
      senderName: "Sam",
      text: "see you soon",
      at: AT,
    });
    expect(after.watchEntries[0]).toMatchObject({
      importId: "imp-2",
      minutes: 42,
      together: true,
    });
  });

  it("rebuilds the occurrence counter that separates identical undated rows", () => {
    // Two plays of the same episode with no timestamps. The counter is not
    // stored, so the migration has to reconstruct it by walking the entries in
    // order — and land on exactly what a fresh import would have produced.
    const first = watch({
      dateUnknown: true,
      at: 0,
      id: legacyUndatedWatchId("netflix", "Arcane", "S1:E1", 0),
    });
    const second = watch({
      dateUnknown: true,
      at: 1,
      id: legacyUndatedWatchId("netflix", "Arcane", "S1:E1", 1),
    });

    const after = migrateItemIds(stateWith({ watchEntries: [first, second] }));

    expect(after.watchEntries).toHaveLength(2);
    expect(after.watchEntries[0]!.id).toBe(undatedWatchId("netflix", "Arcane", "S1:E1", 0));
    expect(after.watchEntries[1]!.id).toBe(undatedWatchId("netflix", "Arcane", "S1:E1", 1));
  });

  it("numbers undated rows per service, not across the archive", () => {
    const netflix = watch({ dateUnknown: true, at: 0 });
    const steam = watch({
      service: "steam",
      title: "Arcane",
      dateUnknown: true,
      at: 0,
      id: legacyUndatedWatchId("steam", "Arcane", "S1:E1", 0),
    });

    const after = migrateItemIds(stateWith({ watchEntries: [netflix, steam] }));

    expect(after.watchEntries[0]!.id).toBe(undatedWatchId("netflix", "Arcane", "S1:E1", 0));
    expect(after.watchEntries[1]!.id).toBe(undatedWatchId("steam", "Arcane", "S1:E1", 0));
  });

  it("does not touch calendar events", () => {
    // Their ids prefer the ICS UID, which the archive never stored, so they
    // cannot be recomputed — and at calendar sizes 32 bits is not a risk.
    const events = [
      {
        id: "ics-abc123",
        title: "Flight",
        date: "2026-04-20",
        anchor: "me" as const,
        owner: "me" as const,
        updatedAt: AT,
      },
    ];
    const after = migrateItemIds(stateWith({ events, places: [place()] }));
    expect(after.events).toBe(events);
  });

  it("collapses items that the old ids kept apart in error", () => {
    // The same undated row imported twice before ownership tracking existed
    // could sit in the archive under two different ids. Re-keying makes that
    // visible; the first copy wins, which is the rule the importer applies.
    const dup = watch({ id: "w-netflix-somethingelse" });
    const after = migrateItemIds(
      stateWith({ watchEntries: [watch({ importId: "imp-first" }), dup] }),
    );

    expect(after.watchEntries).toHaveLength(1);
    expect(after.watchEntries[0]!.importId).toBe("imp-first");
  });

  it("lets a re-import of the same file find its own messages afterwards", () => {
    // The point of migrating at all: an archive left on the old scheme would
    // treat every message in a re-imported export as new.
    const parsed: ChatMessage[] = [
      message({ text: "morning" }),
      message({ text: "landed", at: AT + 1000 }),
    ];
    const legacy = stateWith({ chatMessages: parsed });

    const migrated = migrateItemIds(legacy);
    const reimported = parsed.map((m) => ({
      ...m,
      id: messageId(m.source, m.at, m.senderName, m.text),
    }));

    const merged = mergeChatImport(
      migrated,
      reimported,
      { source: "imessage", label: "export.txt", firstAt: AT, lastAt: AT + 1000 },
      () => "imp-2",
    );

    expect(merged.added).toBe(0);
    expect(merged.state.chatMessages).toHaveLength(2);
  });

  it("lets a re-import of a watch export find its own entries afterwards", () => {
    const rows: ParsedWatch[] = [
      { title: "Arcane", detail: "S1:E1", at: AT },
      { title: "Severance", detail: "S2:E3", at: AT + 90_000 },
    ];
    const legacy = stateWith({
      watchEntries: rows.map((r) => watch({ title: r.title, detail: r.detail, at: r.at! })),
    });

    const migrated = migrateItemIds(legacy);
    const reimported: WatchEntry[] = rows.map((r) => ({
      id: watchId("netflix", r.at!, r.title, r.detail),
      service: "netflix",
      title: r.title,
      detail: r.detail,
      owner: "me",
      at: r.at!,
    }));

    const merged = mergeWatchImport(
      migrated,
      reimported,
      { service: "netflix", label: "history.csv", owner: "me" },
      () => "imp-2",
    );

    expect(merged.added).toBe(0);
    expect(merged.state.watchEntries).toHaveLength(2);
  });

  it("passes a fresh archive straight through", () => {
    const empty = initialState();
    expect(migrateItemIds(empty)).toBe(empty);
  });

  it("migrates a mixed archive without disturbing the new ids in it", () => {
    // Half-migrated states are real: a share code from an updated partner
    // lands new ids in an archive that has not been through hydration yet.
    const already = message({
      text: "already new",
      id: messageId("imessage", AT, "Ada", "already new"),
    });
    const old = message({ text: "still old" });

    const after = migrateItemIds(stateWith({ chatMessages: [already, old] }));

    expect(after.chatMessages[0]).toBe(already);
    expect(after.chatMessages[1]!.id).toBe(messageId("imessage", AT, "Ada", "still old"));
  });
});

describe("accepting a share code from a partner on the old build", () => {
  const payload = (places: Place[]) => ({
    v: 1 as const,
    from: "Alex",
    fromZone: "Europe/London",
    startDate: null,
    events: [],
    milestones: [],
    moods: [],
    places,
    expenses: [],
    goals: [],
    watch: [],
    at: AT,
  });

  it("recognises places sent under the old ids instead of duplicating them", () => {
    // The transitional case the migration exists for. Their build hashes the
    // place to a 32-bit id; ours has already re-keyed its copy. Matching on the
    // id alone would add a second Tartine.
    const mine = migrateItemIds(stateWith({ places: [place({ owner: "them" })] }));
    const theirs = { ...place({ owner: "me" }), note: "their favourite", updatedAt: AT + 1000 };

    const { state, summary } = applyShareCode(mine, payload([theirs]));

    expect(state.places).toHaveLength(1);
    expect(summary.added).toBe(0);
    // Matched rather than merely rejected: their newer edit landed on our copy.
    expect(state.places[0]!.note).toBe("their favourite");
    expect(summary.updated).toBe(1);
  });

  it("still accepts a place we have never seen", () => {
    const mine = migrateItemIds(stateWith({ places: [place({ owner: "them" })] }));
    const theirs = place({ name: "Zuni Café", address: "1658 Market St", owner: "me" });

    const { state, summary } = applyShareCode(mine, payload([theirs]));

    expect(state.places).toHaveLength(2);
    expect(summary.added).toBe(1);
    expect(state.places.map((p) => p.id)).toContain(
      placeId({ name: "Zuni Café", address: "1658 Market St" }),
    );
  });
});
