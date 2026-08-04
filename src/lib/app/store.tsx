import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  initialState,
  type AppState,
  type ChatImport,
  type ChatMessage,
  type Expense,
  type Milestone,
  type MoodEntry,
  type MoodScore,
  type Place,
  type PlanEvent,
  type SavingsGoal,
  type Trip,
  type WatchEntry,
  type WatchImport,
} from "./types";
import { syncReminders } from "./reminders";
import { publishWidgetSnapshot } from "./widget";
import { todayIn } from "./mood";
import { createWriteBehind, readStoredState, writeStoredState } from "./persistence";
import { LIMITS, validAppState } from "./validate";

/**
 * Everything that mutates the archive. These identities are created once for
 * the lifetime of the provider — none of them read `state` from a closure, so
 * they never need to be rebuilt when it changes.
 */
export type StoreActions = {
  setState: (updater: (prev: AppState) => AppState) => void;
  upsertEvent: (e: Omit<PlanEvent, "updatedAt"> & { updatedAt?: number }) => void;
  removeEvent: (id: string) => void;
  upsertMilestone: (m: Omit<Milestone, "updatedAt"> & { updatedAt?: number }) => void;
  removeMilestone: (id: string) => void;
  upsertPlace: (p: Omit<Place, "updatedAt"> & { updatedAt?: number }) => void;
  removePlace: (id: string) => void;
  upsertTrip: (t: Omit<Trip, "updatedAt"> & { updatedAt?: number }) => void;
  removeTrip: (id: string) => void;
  setMood: (score: MoodScore, note?: string, date?: string) => void;
  clearMood: (date?: string) => void;
  upsertExpense: (e: Omit<Expense, "updatedAt"> & { updatedAt?: number }) => void;
  removeExpense: (id: string) => void;
  upsertGoal: (g: Omit<SavingsGoal, "updatedAt"> & { updatedAt?: number }) => void;
  removeGoal: (id: string) => void;
  /** merges an imported export into the unified archive, skipping duplicates */
  importChat: (
    messages: ChatMessage[],
    meta: Omit<ChatImport, "id" | "importedAt" | "messageCount">,
  ) => number;
  removeChatImport: (id: string, alsoMessages: boolean) => void;
  /** merges a viewing-history export, skipping entries already known */
  importWatch: (
    entries: WatchEntry[],
    meta: Omit<WatchImport, "id" | "importedAt" | "entryCount">,
  ) => number;
  removeWatchImport: (id: string, alsoEntries: boolean) => void;
  upsertWatchEntry: (e: WatchEntry) => void;
  removeWatchEntry: (id: string) => void;
  reset: () => void;
};

type StoreSnapshot = {
  state: AppState;
  hydrated: boolean;
  /** set when the archive no longer fits in this device's storage */
  storageFull: boolean;
};

const SnapshotContext = createContext<StoreSnapshot | null>(null);
const ActionsContext = createContext<StoreActions | null>(null);

/**
 * A collision-resistant id.
 *
 * Ids are the join key the share-code merge uses, so two devices generating
 * the same one silently overwrites one partner's item with the other's. The
 * old implementation took 8 base36 characters from `Math.random()`, which is
 * neither uniform nor unpredictable. `crypto` is available in every browser
 * this app supports and in the Capacitor WebView; the counter-based fallback
 * only matters for non-DOM test environments.
 */
let idCounter = 0;
export function newId(): string {
  const c = typeof globalThis === "undefined" ? undefined : globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  idCounter += 1;
  return `id-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** Replace an item with a matching id, or append it. */
function upsertById<T extends { id: string }>(items: T[], item: T, cap: number): T[] {
  const index = items.findIndex((x) => x.id === item.id);
  if (index >= 0) {
    const next = items.slice();
    next[index] = item;
    return next;
  }
  return items.length >= cap ? items : [...items, item];
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setInternal] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [storageFull, setStorageFull] = useState(false);

  // Kept in a ref so the write-behind scheduler — created once — always
  // serializes the newest state without being rebuilt on every change.
  const latest = useRef(state);
  latest.current = state;

  const setState = useCallback((updater: (prev: AppState) => AppState) => {
    setInternal(updater);
  }, []);

  /* --------------------------- hydrate once --------------------------- */

  useEffect(() => {
    // Storage is as untrusted as a share code: another script on this origin,
    // an older buggy build, or a partial write can all leave malformed data
    // behind, and the old code cast it straight to AppState.
    const stored = readStoredState();
    if (stored !== undefined) setInternal(validAppState(stored));
    setHydrated(true);
  }, []);

  /* ------------------------- persist write-behind ---------------------- */

  const writer = useRef<ReturnType<typeof createWriteBehind> | null>(null);
  if (writer.current === null) {
    writer.current = createWriteBehind(() => {
      const outcome = writeStoredState(latest.current);
      setStorageFull(outcome === "quota-exceeded");
    });
  }

  useEffect(() => {
    const scheduler = writer.current;
    return () => scheduler?.dispose();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writer.current?.schedule();
  }, [state, hydrated]);

  /* ------------------------------- theme ------------------------------- */

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  /* -------------------- native side effects, narrowed ------------------ */

  // Rescheduling OS notifications means cancelling and re-registering every
  // pending one, which is a round trip per notification through the Capacitor
  // bridge. Keying this on the slices it actually reads — rather than on the
  // whole state — keeps it from firing when an unrelated expense is edited.
  const { events, milestones, reminderLeadDays, reminderHour, me, them, moods } = state;

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      void syncReminders(latest.current).catch(() => {
        /* notifications are best-effort */
      });
    }, 750);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hydrated, events, milestones, reminderLeadDays, reminderHour, me, them]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      void publishWidgetSnapshot(latest.current).catch(() => {
        /* widgets are best-effort */
      });
    }, 750);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hydrated, moods, events, me, them]);

  /* ------------------------------ actions ------------------------------ */

  const actions = useMemo<StoreActions>(() => {
    const stamp = <T extends { updatedAt?: number }>(item: T) => ({
      ...item,
      updatedAt: Date.now(),
    });

    return {
      setState,
      upsertEvent: (e) =>
        setState((prev) => ({
          ...prev,
          events: upsertById(prev.events, stamp(e) as PlanEvent, LIMITS.events),
        })),
      removeEvent: (id) =>
        setState((prev) => ({ ...prev, events: prev.events.filter((e) => e.id !== id) })),
      upsertMilestone: (m) =>
        setState((prev) => ({
          ...prev,
          milestones: upsertById(prev.milestones, stamp(m) as Milestone, LIMITS.milestones),
        })),
      removeMilestone: (id) =>
        setState((prev) => ({
          ...prev,
          milestones: prev.milestones.filter((m) => m.id !== id),
        })),
      upsertPlace: (p) =>
        setState((prev) => {
          const item = stamp(p) as Place;
          const existing = prev.places.find((x) => x.id === item.id);
          return {
            ...prev,
            places: upsertById(
              prev.places,
              existing ? { ...existing, ...item } : item,
              LIMITS.places,
            ),
          };
        }),
      removePlace: (id) =>
        setState((prev) => ({ ...prev, places: prev.places.filter((p) => p.id !== id) })),
      upsertTrip: (t) =>
        setState((prev) => ({
          ...prev,
          trips: upsertById(prev.trips, stamp(t) as Trip, LIMITS.trips),
        })),
      removeTrip: (id) =>
        setState((prev) => ({ ...prev, trips: prev.trips.filter((t) => t.id !== id) })),
      setMood: (score, note, date) =>
        setState((prev) => {
          const day = date ?? todayIn(prev.me.timeZone);
          const existing = prev.moods.find((m) => m.owner === "me" && m.date === day);
          const trimmed = note?.trim();
          const entry: MoodEntry = {
            id: existing?.id ?? newId(),
            owner: "me",
            date: day,
            score,
            note: trimmed ? trimmed : undefined,
            updatedAt: Date.now(),
          };
          return { ...prev, moods: upsertById(prev.moods, entry, LIMITS.moods) };
        }),
      clearMood: (date) =>
        setState((prev) => {
          const day = date ?? todayIn(prev.me.timeZone);
          return {
            ...prev,
            moods: prev.moods.filter((m) => !(m.owner === "me" && m.date === day)),
          };
        }),
      upsertExpense: (e) =>
        setState((prev) => ({
          ...prev,
          expenses: upsertById(prev.expenses, stamp(e) as Expense, LIMITS.expenses),
        })),
      removeExpense: (id) =>
        setState((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => e.id !== id) })),
      upsertGoal: (g) =>
        setState((prev) => ({
          ...prev,
          goals: upsertById(prev.goals, stamp(g) as SavingsGoal, LIMITS.goals),
        })),
      removeGoal: (id) =>
        setState((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) })),
      importChat: (messages, meta) => {
        let added = 0;
        setState((prev) => {
          const known = new Set(prev.chatMessages.map((m) => m.id));
          const room = Math.max(0, LIMITS.chatMessages - prev.chatMessages.length);
          const fresh = messages.filter((m) => !known.has(m.id)).slice(0, room);
          added = fresh.length;
          if (!fresh.length) return prev;
          const record: ChatImport = {
            ...meta,
            id: newId(),
            messageCount: fresh.length,
            importedAt: Date.now(),
          };
          return {
            ...prev,
            chatMessages: [...prev.chatMessages, ...fresh].sort((a, b) => a.at - b.at),
            chatImports: [...prev.chatImports, record],
          };
        });
        return added;
      },
      removeChatImport: (id, alsoMessages) =>
        setState((prev) => {
          const record = prev.chatImports.find((i) => i.id === id);
          return {
            ...prev,
            chatImports: prev.chatImports.filter((i) => i.id !== id),
            chatMessages:
              alsoMessages && record
                ? prev.chatMessages.filter(
                    (m) =>
                      !(
                        m.source === record.source &&
                        m.at >= record.firstAt &&
                        m.at <= record.lastAt
                      ),
                  )
                : prev.chatMessages,
          };
        }),
      importWatch: (entries, meta) => {
        let added = 0;
        setState((prev) => {
          const known = new Set(prev.watchEntries.map((e) => e.id));
          const room = Math.max(0, LIMITS.watchEntries - prev.watchEntries.length);
          const fresh = entries.filter((e) => !known.has(e.id)).slice(0, room);
          added = fresh.length;
          if (!fresh.length) return prev;
          const record: WatchImport = {
            ...meta,
            id: newId(),
            entryCount: fresh.length,
            importedAt: Date.now(),
          };
          return {
            ...prev,
            watchEntries: [...prev.watchEntries, ...fresh].sort((a, b) => a.at - b.at),
            watchImports: [...prev.watchImports, record],
          };
        });
        return added;
      },
      removeWatchImport: (id, alsoEntries) =>
        setState((prev) => {
          const record = prev.watchImports.find((i) => i.id === id);
          return {
            ...prev,
            watchImports: prev.watchImports.filter((i) => i.id !== id),
            watchEntries:
              alsoEntries && record
                ? prev.watchEntries.filter(
                    (e) => !(e.service === record.service && e.owner === record.owner),
                  )
                : prev.watchEntries,
          };
        }),
      upsertWatchEntry: (entry) =>
        setState((prev) => {
          const next = upsertById(prev.watchEntries, entry, LIMITS.watchEntries);
          return next === prev.watchEntries
            ? prev
            : { ...prev, watchEntries: next.slice().sort((a, b) => a.at - b.at) };
        }),
      removeWatchEntry: (id) =>
        setState((prev) => ({
          ...prev,
          watchEntries: prev.watchEntries.filter((e) => e.id !== id),
        })),
      reset: () => setState(initialState),
    };
  }, [setState]);

  const snapshot = useMemo<StoreSnapshot>(
    () => ({ state, hydrated, storageFull }),
    [state, hydrated, storageFull],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <SnapshotContext.Provider value={snapshot}>{children}</SnapshotContext.Provider>
    </ActionsContext.Provider>
  );
}

/** The archive plus every mutator. Re-renders whenever the archive changes. */
export function useStore(): StoreSnapshot & StoreActions {
  const snapshot = useContext(SnapshotContext);
  const actions = useContext(ActionsContext);
  if (!snapshot || !actions) throw new Error("useStore must be used inside AppStoreProvider");
  return useMemo(() => ({ ...snapshot, ...actions }), [snapshot, actions]);
}

/**
 * Mutators only. Components that dispatch but never read — dialogs, action
 * bars — should use this: the value never changes, so they do not re-render
 * when the archive does.
 */
export function useStoreActions(): StoreActions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error("useStoreActions must be used inside AppStoreProvider");
  return actions;
}

/* ------------------------------ shared clock ----------------------------- */

type Tick = { now: Date | null };

const listeners = new Set<(now: Date) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function startClock(intervalMs: number) {
  if (timer !== null) return;
  timer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const now = new Date();
    for (const listener of listeners) listener(now);
  }, intervalMs);
}

function stopClock() {
  if (timer === null || listeners.size > 0) return;
  clearInterval(timer);
  timer = null;
}

/**
 * Ticking clock for live time displays.
 *
 * One interval is shared by every caller instead of one per component, and it
 * skips work entirely while the tab is in the background — a hidden tab has no
 * reason to re-render nine time zone readouts four times a minute.
 */
export function useNow(intervalMs = 15_000): Date | null {
  const [tick, setTick] = useState<Tick>({ now: null });

  useEffect(() => {
    const listener = (now: Date) => setTick({ now });
    listeners.add(listener);
    startClock(intervalMs);
    setTick({ now: new Date() });

    const onVisible = () => {
      if (document.visibilityState === "visible") setTick({ now: new Date() });
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      listeners.delete(listener);
      document.removeEventListener("visibilitychange", onVisible);
      stopClock();
    };
  }, [intervalMs]);

  return tick.now;
}
