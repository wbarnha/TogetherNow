import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { initialState, type AppState, type Milestone, type Place, type PlanEvent } from "./types";
import { syncReminders } from "./reminders";

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
      reset: () => setState(() => initialState()),
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