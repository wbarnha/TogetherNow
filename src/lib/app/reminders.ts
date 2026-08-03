import type { AppState } from "./types";
import { nextOccurrence, toISODate, wallTimeToInstant } from "./time";

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

  const lead = state.reminderLeadDays;
  const notifications = [] as {
    id: number;
    title: string;
    body: string;
    schedule: { at: Date };
  }[];
  let id = 1;

  for (const m of state.milestones) {
    const target = m.recurring ? nextOccurrence(m.date) : new Date(`${m.date}T09:00:00`);
    const at = new Date(target);
    at.setDate(at.getDate() - lead);
    at.setHours(9, 0, 0, 0);
    if (at.getTime() <= Date.now()) continue;
    notifications.push({
      id: id++,
      title: m.title,
      body: lead === 0 ? "It's today." : `In ${lead} ${lead === 1 ? "day" : "days"}.`,
      schedule: { at },
    });
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
