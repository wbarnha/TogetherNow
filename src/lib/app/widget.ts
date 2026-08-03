import { Preferences } from "@capacitor/preferences";
import type { AppState } from "./types";
import { buildWidgetSnapshot } from "./mood";

/**
 * Bridge between the web app and the native home-screen widgets.
 *
 * The snapshot is written to Capacitor Preferences, which maps to the
 * shared App Group UserDefaults on iOS and SharedPreferences on Android,
 * so the WidgetKit / Glance widgets can read it without any server.
 */
export const WIDGET_KEY = "togethernow.widget.snapshot";
export const WIDGET_GROUP = "group.app.lovable.togethernow";

export async function publishWidgetSnapshot(state: AppState) {
  const snapshot = buildWidgetSnapshot(state);
  const value = JSON.stringify(snapshot);
  try {
    await Preferences.configure({ group: WIDGET_GROUP });
  } catch {
    /* web / plugin unavailable */
  }
  try {
    await Preferences.set({ key: WIDGET_KEY, value });
  } catch {
    /* running in a plain browser */
  }
  try {
    window.localStorage.setItem(WIDGET_KEY, value);
  } catch {
    /* storage unavailable */
  }
  return snapshot;
}

/** Mood score passed in by a widget tap: togethernow://mood?score=4 or ?mood=4 */
export function moodFromUrl(search: string): 1 | 2 | 3 | 4 | 5 | null {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get("mood") ?? params.get("score");
    const n = raw ? Number(raw) : NaN;
    return n >= 1 && n <= 5 ? ((Math.round(n) as 1 | 2 | 3 | 4 | 5)) : null;
  } catch {
    return null;
  }
}