import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
} from "./types";
import { syncReminders } from "./reminders";
import { publishWidgetSnapshot } from "./widget";
import { todayIn } from "./mood";

const KEY = "together-now:v1";

type Ctx = {
  state: AppState;
  hydrated: boolean;
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
  reset: () => void;
};

const StoreContext = createContext<Ctx | null>(null);

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setInternal] = useState<AppState>(() => initialState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        if (parsed && parsed.version === 1) {
          setInternal({ ...initialState(), ...parsed });
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable */
    }
    const root = document.documentElement;
    root.classList.toggle("dark", state.theme === "dark");
    void syncReminders(state).catch(() => {
      /* notifications are best-effort */
    });
    void publishWidgetSnapshot(state).catch(() => {
      /* widgets are best-effort */
    });
  }, [state, hydrated]);

  const setState = useCallback((updater: (prev: AppState) => AppState) => {
    setInternal((prev) => updater(prev));
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      state,
      hydrated,
      setState,
      upsertEvent: (e) =>
        setState((prev) => {
          const item: PlanEvent = { ...e, updatedAt: Date.now() } as PlanEvent;
          const exists = prev.events.some((x) => x.id === item.id);
          return {
            ...prev,
            events: exists
              ? prev.events.map((x) => (x.id === item.id ? item : x))
              : [...prev.events, item],
          };
        }),
      removeEvent: (id) =>
        setState((prev) => ({ ...prev, events: prev.events.filter((e) => e.id !== id) })),
      upsertMilestone: (m) =>
        setState((prev) => {
          const item: Milestone = { ...m, updatedAt: Date.now() } as Milestone;
          const exists = prev.milestones.some((x) => x.id === item.id);
          return {
            ...prev,
            milestones: exists
              ? prev.milestones.map((x) => (x.id === item.id ? item : x))
              : [...prev.milestones, item],
          };
        }),
      removeMilestone: (id) =>
        setState((prev) => ({
          ...prev,
          milestones: prev.milestones.filter((m) => m.id !== id),
        })),
      upsertPlace: (p) =>
        setState((prev) => {
          const item: Place = { ...p, updatedAt: Date.now() } as Place;
          const exists = prev.places.some((x) => x.id === item.id);
          return {
            ...prev,
            places: exists
              ? prev.places.map((x) => (x.id === item.id ? { ...x, ...item } : x))
              : [...prev.places, item],
          };
        }),
      removePlace: (id) =>
        setState((prev) => ({ ...prev, places: prev.places.filter((p) => p.id !== id) })),
      upsertTrip: (t) =>
        setState((prev) => {
          const item: Trip = { ...t, updatedAt: Date.now() } as Trip;
          const exists = prev.trips.some((x) => x.id === item.id);
          return {
            ...prev,
            trips: exists
              ? prev.trips.map((x) => (x.id === item.id ? item : x))
              : [...prev.trips, item],
          };
        }),
      removeTrip: (id) =>
        setState((prev) => ({ ...prev, trips: prev.trips.filter((t) => t.id !== id) })),
      setMood: (score, note, date) =>
        setState((prev) => {
          const day = date ?? todayIn(prev.me.timeZone);
          const existing = prev.moods.find((m) => m.owner === "me" && m.date === day);
          const entry: MoodEntry = {
            id: existing?.id ?? newId(),
            owner: "me",
            date: day,
            score,
            note: note?.trim() ? note.trim() : undefined,
            updatedAt: Date.now(),
          };
          return {
            ...prev,
            moods: existing
              ? prev.moods.map((m) => (m.id === existing.id ? entry : m))
              : [...prev.moods, entry],
          };
        }),
      clearMood: (date) =>
        setState((prev) => {
          const day = date ?? todayIn(prev.me.timeZone);
          return {
            ...prev,
            moods: prev.moods.filter((m) => !(m.owner === "me" && m.date === day)),
          };
        }),
      reset: () => setState(() => initialState()),
      upsertExpense: (e) =>
        setState((prev) => {
          const item: Expense = { ...e, updatedAt: Date.now() } as Expense;
          const exists = prev.expenses.some((x) => x.id === item.id);
          return {
            ...prev,
            expenses: exists
              ? prev.expenses.map((x) => (x.id === item.id ? item : x))
              : [...prev.expenses, item],
          };
        }),
      removeExpense: (id) =>
        setState((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => e.id !== id) })),
      upsertGoal: (g) =>
        setState((prev) => {
          const item: SavingsGoal = { ...g, updatedAt: Date.now() } as SavingsGoal;
          const exists = prev.goals.some((x) => x.id === item.id);
          return {
            ...prev,
            goals: exists
              ? prev.goals.map((x) => (x.id === item.id ? item : x))
              : [...prev.goals, item],
          };
        }),
      removeGoal: (id) =>
        setState((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) })),
      importChat: (messages, meta) => {
        let added = 0;
        setState((prev) => {
          const known = new Set(prev.chatMessages.map((m) => m.id));
          const fresh = messages.filter((m) => !known.has(m.id));
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
                      !(m.source === record.source && m.at >= record.firstAt && m.at <= record.lastAt),
                  )
                : prev.chatMessages,
          };
        }),
    }),
    [state, hydrated, setState],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside AppStoreProvider");
  return ctx;
}

/** Ticking clock for live time displays. */
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
