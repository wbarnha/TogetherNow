import type { AppState } from "./types";
import { wallTimeToInstant } from "./time";
import { buildMilestoneReminders } from "./milestone-reminders";
import {
  CONFIRMATION_ID_MAX,
  CONFIRMATION_ID_MIN,
  isScheduledId,
  planNotificationId,
} from "./notification-ids";

/** True only inside the native Capacitor shell. */
function isNative() {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * iOS keeps at most 64 pending local notifications per app; anything past that
 * is discarded, and the app is not told which. A couple with a busy calendar
 * reaches 64 easily — three leads per milestone plus a nudge per dated plan —
 * and the ones that matter are the soonest. Sorting and cutting here means the
 * app chooses which 64 survive instead of leaving it to the platform.
 */
export const MAX_SCHEDULED_NOTIFICATIONS = 64;

/** How far ahead of a dated plan its nudge fires. */
const PLAN_LEAD_MS = 30 * 60_000;

export type PlannedNotification = {
  id: number;
  title: string;
  body: string;
  at: Date;
};

/**
 * Everything that should be pending on the device right now, soonest first.
 *
 * Pure and exported so the scheduling rules can be tested without a device:
 * `syncReminders` below is only the bridge call.
 */
export function planNotifications(state: AppState, now: Date = new Date()): PlannedNotification[] {
  const planned: PlannedNotification[] = [];

  for (const r of buildMilestoneReminders(state, now)) {
    planned.push({ id: r.id, title: r.title, body: r.body, at: r.at });
  }

  for (const e of state.events) {
    if (!e.time) continue;
    // A plan's date and time are wall-clock in whichever person it is anchored
    // to. The old code first threw away anything whose *calendar date* was
    // before today in the device's zone, which is a different zone: a plan
    // anchored to a partner far enough east or west was dropped while it was
    // still hours away, or kept after it had already started. The instant is
    // the only thing worth comparing, and it is right here.
    const zone = e.anchor === "me" ? state.me.timeZone : state.them.timeZone;
    const at = new Date(wallTimeToInstant(e.date, e.time, zone).getTime() - PLAN_LEAD_MS);
    if (at.getTime() <= now.getTime()) continue;
    planned.push({
      id: planNotificationId(e.id),
      title: e.title,
      body: "Starts in 30 minutes.",
      at,
    });
  }

  planned.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Two items sharing an id would mean the later one replaces the earlier on
  // the device. Sorted soonest-first, keeping the first is keeping the one the
  // user needs next.
  const seen = new Set<number>();
  const unique = planned.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));

  return unique.slice(0, MAX_SCHEDULED_NOTIFICATIONS);
}

/**
 * Rotating id for an immediate confirmation.
 *
 * Kept inside the confirmation band so `syncReminders` cannot cancel it and it
 * cannot land on a reminder's id. It rotates rather than staying fixed so two
 * confirmations close together do not replace one another; the counter is
 * seeded from the clock so a reload does not restart the rotation on top of a
 * confirmation still in flight.
 */
const CONFIRMATION_SPAN = CONFIRMATION_ID_MAX - CONFIRMATION_ID_MIN + 1;
let confirmationSeq = Date.now() % CONFIRMATION_SPAN;
function nextConfirmationId() {
  confirmationSeq = (confirmationSeq + 1) % CONFIRMATION_SPAN;
  return CONFIRMATION_ID_MIN + confirmationSeq;
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
        id: nextConfirmationId(),
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
export async function syncReminders(state: AppState, now: Date = new Date()) {
  if (!isNative()) return;

  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return;

  // Only what this function scheduled. Cancelling everything took out any
  // confirmation raised in the last second along with it.
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => isScheduledId(n.id));
  if (ours.length) {
    await LocalNotifications.cancel({ notifications: ours });
  }

  const notifications = planNotifications(state, now).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    schedule: { at: n.at },
  }));

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
}
