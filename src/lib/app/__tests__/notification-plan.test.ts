import { describe, expect, it } from "vitest";

import { MAX_SCHEDULED_NOTIFICATIONS, planNotifications } from "../reminders";
import {
  CONFIRMATION_ID_MAX,
  CONFIRMATION_ID_MIN,
  MILESTONE_ID_MAX,
  MILESTONE_ID_MIN,
  PLAN_ID_MAX,
  PLAN_ID_MIN,
  isScheduledId,
  notificationId,
  planNotificationId,
} from "../notification-ids";
import { buildMilestoneReminders } from "../milestone-reminders";
import { initialState } from "../types";
import type { AppState, Milestone, PlanEvent } from "../types";

function stateWith(over: Partial<AppState> = {}): AppState {
  return { ...initialState(), ...over };
}

function plan(over: Partial<PlanEvent> = {}): PlanEvent {
  return {
    id: "e1",
    title: "Dinner",
    date: "2026-04-20",
    time: "19:00",
    anchor: "me",
    owner: "me",
    updatedAt: 0,
    ...over,
  };
}

const birthday: Milestone = {
  id: "m1",
  title: "Her birthday",
  kind: "birthday",
  date: "1996-06-10",
  recurring: true,
  owner: "them",
  updatedAt: 0,
};

describe("the notification id space", () => {
  it("gives each scheduler a band that cannot touch another's", () => {
    expect(MILESTONE_ID_MAX).toBeLessThan(PLAN_ID_MIN);
    expect(PLAN_ID_MAX).toBeLessThan(CONFIRMATION_ID_MIN);
    // Android notification ids are Java ints.
    expect(CONFIRMATION_ID_MAX).toBeLessThanOrEqual(2 ** 31 - 1);
  });

  it("treats reminder ids as cancellable and confirmations as not", () => {
    expect(isScheduledId(MILESTONE_ID_MIN)).toBe(true);
    expect(isScheduledId(MILESTONE_ID_MAX)).toBe(true);
    expect(isScheduledId(PLAN_ID_MIN)).toBe(true);
    expect(isScheduledId(PLAN_ID_MAX)).toBe(true);
    // The whole point: a resync must not be able to cancel a confirmation the
    // user is about to see.
    expect(isScheduledId(CONFIRMATION_ID_MIN)).toBe(false);
    expect(isScheduledId(CONFIRMATION_ID_MAX)).toBe(false);
    expect(isScheduledId(0)).toBe(false);
  });

  it("never lets a plan id stray outside its band", () => {
    for (let i = 0; i < 5_000; i++) {
      const id = planNotificationId(`event-${i}`);
      expect(id).toBeGreaterThanOrEqual(PLAN_ID_MIN);
      expect(id).toBeLessThanOrEqual(PLAN_ID_MAX);
    }
  });

  it("keeps milestone ids inside the milestone band", () => {
    const rs = buildMilestoneReminders(
      stateWith({ milestones: [birthday] }),
      new Date(2026, 0, 1, 12),
    );
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) {
      expect(r.id).toBeGreaterThanOrEqual(MILESTONE_ID_MIN);
      expect(r.id).toBeLessThanOrEqual(MILESTONE_ID_MAX);
    }
  });

  it("is deterministic, so an unchanged archive resyncs to the same ids", () => {
    expect(planNotificationId("e1")).toBe(planNotificationId("e1"));
    expect(planNotificationId("e1")).not.toBe(planNotificationId("e2"));
  });

  it("spreads over the whole band rather than a signed half of it", () => {
    // `Math.abs` on a hash folds the sign away and halves the usable space.
    const ids = new Set<number>();
    let high = 0;
    for (let i = 0; i < 20_000; i++) {
      const id = notificationId(`k-${i}`, 1, 1_000_000_000);
      ids.add(id);
      if (id > 500_000_000) high++;
    }
    expect(ids.size).toBeGreaterThan(19_990);
    expect(high).toBeGreaterThan(9_000);
  });
});

describe("planNotifications", () => {
  it("keeps a plan that is still ahead even when its date reads as past here", () => {
    // You are in Auckland; the plan is anchored to a partner in London. It is
    // already the 21st where you are, but their 20th-at-23:00 dinner is still
    // two hours away. Filtering on the calendar date in the device's zone —
    // which is what the old code did — dropped it.
    const state = stateWith({
      me: { name: "Me", timeZone: "Pacific/Auckland", handles: {} },
      them: { name: "Them", timeZone: "Europe/London", handles: {} },
      events: [plan({ anchor: "them", date: "2026-04-20", time: "23:00" })],
    });
    // 2026-04-20 21:00 London == 2026-04-21 09:00 Auckland.
    const now = new Date(Date.UTC(2026, 3, 20, 20, 0));

    const planned = planNotifications(state, now);

    expect(planned).toHaveLength(1);
    // 23:00 BST is 22:00 UTC, so the nudge is at 21:30 UTC — still ahead of
    // `now`, which is the whole point.
    expect(planned[0]!.at.toISOString()).toBe("2026-04-20T21:30:00.000Z");
    expect(planned[0]!.at.getTime()).toBeGreaterThan(now.getTime());
  });

  it("drops a plan that has already started even when its date reads as today", () => {
    const state = stateWith({
      me: { name: "Me", timeZone: "Pacific/Auckland", handles: {} },
      them: { name: "Them", timeZone: "Pacific/Honolulu", handles: {} },
      events: [plan({ anchor: "them", date: "2026-04-20", time: "08:00" })],
    });
    // 2026-04-20 18:00 UTC is 08:00 on the 20th in Honolulu — the plan is
    // under way — while the device in Auckland already reads the 21st.
    const now = new Date(Date.UTC(2026, 3, 20, 18, 0));

    expect(planNotifications(state, now)).toHaveLength(0);
  });

  it("fires thirty minutes before the plan, in the anchor's zone", () => {
    const state = stateWith({
      me: { name: "Me", timeZone: "America/New_York", handles: {} },
      them: { name: "Them", timeZone: "Europe/London", handles: {} },
      events: [plan({ anchor: "me", date: "2026-04-20", time: "19:00" })],
    });
    const now = new Date(Date.UTC(2026, 3, 20, 12, 0));

    const [nudge] = planNotifications(state, now);

    // 19:00 EDT is 23:00 UTC; the nudge lands at 22:30 UTC.
    expect(nudge!.at.toISOString()).toBe("2026-04-20T22:30:00.000Z");
    expect(nudge!.body).toBe("Starts in 30 minutes.");
  });

  it("ignores a plan with no time", () => {
    const state = stateWith({ events: [plan({ time: undefined })] });
    expect(planNotifications(state, new Date(Date.UTC(2026, 0, 1)))).toHaveLength(0);
  });

  it("returns them soonest first", () => {
    const state = stateWith({
      milestones: [birthday],
      events: [
        plan({ id: "late", date: "2026-06-20", time: "19:00" }),
        plan({ id: "soon", date: "2026-04-20", time: "19:00" }),
      ],
    });
    const planned = planNotifications(state, new Date(Date.UTC(2026, 3, 1, 12)));

    const times = planned.map((n) => n.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(planned.length).toBeGreaterThan(2);
  });

  it("caps at what the OS will hold, keeping the soonest", () => {
    // 200 plans, one per day, listed *latest first* — so an implementation
    // that cut before sorting would hand the device next winter's reminders
    // and drop this week's.
    const days = Array.from({ length: 200 }, (_, i) => 199 - i);
    const events = days.map((d, i) =>
      plan({
        id: `e${i}`,
        title: `Plan ${d}`,
        date: `2026-${String(1 + Math.floor(d / 28)).padStart(2, "0")}-${String(
          1 + (d % 28),
        ).padStart(2, "0")}`,
        time: "19:00",
      }),
    );
    const now = new Date(Date.UTC(2025, 11, 1));

    const planned = planNotifications(stateWith({ events }), now);

    expect(planned).toHaveLength(MAX_SCHEDULED_NOTIFICATIONS);
    // Exactly the 64 earliest survive: the first 64 days, in order.
    expect(planned.map((n) => n.title)).toEqual(
      days
        .slice()
        .sort((a, b) => a - b)
        .slice(0, MAX_SCHEDULED_NOTIFICATIONS)
        .map((d) => `Plan ${d}`),
    );
  });

  it("never hands the device two notifications sharing an id", () => {
    const state = stateWith({
      milestones: [birthday],
      events: [
        plan({ id: "e1", date: "2026-04-20", time: "19:00" }),
        // The same plan id twice is not reachable through the UI, but a
        // corrupt archive or a merge could produce it, and a duplicate id
        // means one silently replaces the other on the device.
        plan({ id: "e1", title: "Duplicate", date: "2026-05-20", time: "19:00" }),
      ],
    });
    const planned = planNotifications(state, new Date(Date.UTC(2026, 3, 1)));

    expect(new Set(planned.map((n) => n.id)).size).toBe(planned.length);
    // The soonest of the two survives.
    expect(planned.some((n) => n.title === "Dinner")).toBe(true);
    expect(planned.some((n) => n.title === "Duplicate")).toBe(false);
  });

  it("is stable: replanning an unchanged archive gives the same ids", () => {
    const state = stateWith({
      milestones: [birthday],
      events: [plan({ date: "2026-04-20", time: "19:00" })],
    });
    const now = new Date(Date.UTC(2026, 3, 1));

    expect(planNotifications(state, now).map((n) => n.id)).toEqual(
      planNotifications(state, now).map((n) => n.id),
    );
  });

  it("does not renumber the remaining plans when one is removed", () => {
    // A running counter did exactly this, so deleting the first plan changed
    // the id of every plan after it.
    const events = [
      plan({ id: "a", date: "2026-04-20", time: "19:00" }),
      plan({ id: "b", date: "2026-04-21", time: "19:00" }),
      plan({ id: "c", date: "2026-04-22", time: "19:00" }),
    ];
    const now = new Date(Date.UTC(2026, 3, 1));

    const before = planNotifications(stateWith({ events }), now);
    const after = planNotifications(stateWith({ events: events.slice(1) }), now);

    const idOf = (list: { id: number; title: string }[], at: number) => list[at]!.id;
    expect(idOf(after, 0)).toBe(idOf(before, 1));
    expect(idOf(after, 1)).toBe(idOf(before, 2));
  });
});
