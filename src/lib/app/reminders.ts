import type { AppState } from "./types";
import { toISODate, wallTimeToInstant } from "./time";
import { buildMilestoneReminders } from "./milestone-reminders";

/** True only inside the native Capacitor shell. */
function isNative() {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * Fires an immediate local notification (native only, silently skipped in a
 * browser). Used for confirmations like "idea sent to your partner".
 */
export async function notifyNow(title: string, body: string) {
  if (!isNative()) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return false;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: Math.floor(Date.now() % 2_000_000_000),
        title,
        body,
        schedule: { at: new Date(Date.now() + 1000) },
      },
    ],
  });
  return true;
}

export type PermissionState = "granted" | "denied" | "unsupported";

/** Asks the OS for notification permission (native only). */
export async function ensureNotificationPermission(): Promise<PermissionState> {
  if (!isNative()) return "unsupported";
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const perm = await LocalNotifications.requestPermissions();
  return perm.display === "granted" ? "granted" : "denied";
}

/**
 * Schedules local device notifications for upcoming milestones and plans.
 * Runs only inside the native (Capacitor) app; a no-op in the browser.
 */
export async function syncReminders(state: AppState) {
  if (!isNative()) return;

  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return;

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications });
  }

  const notifications = [] as {
    id: number;
    title: string;
    body: string;
    schedule: { at: Date };
  }[];
  let id = 1_000_000_001;

  for (const r of buildMilestoneReminders(state)) {
    notifications.push({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at } });
  }

  const today = toISODate(new Date());
  for (const e of state.events) {
    if (e.date < today || !e.time) continue;
    const zone = e.anchor === "me" ? state.me.timeZone : state.them.timeZone;
    const at = new Date(wallTimeToInstant(e.date, e.time, zone).getTime() - 30 * 60000);
    if (at.getTime() <= Date.now()) continue;
    notifications.push({
      id: id++,
      title: e.title,
      body: "Starts in 30 minutes.",
      schedule: { at },
    });
  }

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
}
