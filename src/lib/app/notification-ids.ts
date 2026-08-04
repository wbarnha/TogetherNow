/**
 * The device notification id space, partitioned by who owns each id.
 *
 * There is one flat integer id space per app, and scheduling a notification
 * with an id that is already pending *replaces* it. Two schedulers share this
 * space here: `syncReminders`, which owns every future milestone and plan
 * nudge, and `notifyNow`, which fires a one-off confirmation like "idea sent".
 *
 * Previously neither knew about the other. `notifyNow` took `Date.now() %
 * 2_000_000_000`, which lands anywhere at all, and `syncReminders` began by
 * cancelling *every* pending notification — so a confirmation raised in the
 * second before a resync was cancelled before the user ever saw it, and one
 * that happened to land on a reminder's id destroyed that reminder outright.
 *
 * Splitting the space fixes both: `syncReminders` cancels only ids inside the
 * scheduled band and cannot touch a confirmation, and a confirmation cannot be
 * assigned an id a reminder might want.
 *
 * The ceiling is 2^31 - 1 because Android notification ids are Java ints.
 */

/** Milestone nudges: birthdays, anniversaries, the ladder of leads. */
export const MILESTONE_ID_MIN = 1;
export const MILESTONE_ID_MAX = 1_000_000_000;

/** "Starts in 30 minutes" for a dated plan. */
export const PLAN_ID_MIN = 1_000_000_001;
export const PLAN_ID_MAX = 1_899_999_999;

/** Immediate confirmations, which `syncReminders` must leave alone. */
export const CONFIRMATION_ID_MIN = 1_900_000_000;
export const CONFIRMATION_ID_MAX = 1_999_999_999;

/** Everything `syncReminders` is allowed to cancel. */
export function isScheduledId(id: number): boolean {
  return Number.isInteger(id) && id >= MILESTONE_ID_MIN && id <= PLAN_ID_MAX;
}

/**
 * A deterministic id inside a band.
 *
 * Deterministic rather than a running counter so that re-syncing an unchanged
 * archive produces the same ids: a counter renumbers every plan whenever an
 * earlier one is added or removed, which turns an idempotent resync into a
 * cancel-and-recreate of everything.
 *
 * The bands are large enough that a collision needs thousands of items, and
 * the planner drops duplicates rather than letting one silently replace
 * another.
 */
export function notificationId(key: string, min: number, max: number): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const span = max - min + 1;
  return min + ((h >>> 0) % span);
}

/** Id for the "starts in 30 minutes" nudge attached to a plan. */
export function planNotificationId(eventId: string): number {
  return notificationId(eventId, PLAN_ID_MIN, PLAN_ID_MAX);
}
