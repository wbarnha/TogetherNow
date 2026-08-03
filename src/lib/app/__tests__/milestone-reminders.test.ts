import { describe, expect, it } from "vitest";
import {
  buildMilestoneReminders,
  defaultLeads,
  reminderBody,
} from "../milestone-reminders";
import { initialState } from "../types";
import type { AppState, Milestone } from "../types";

function stateWith(milestones: Milestone[]): AppState {
  return { ...initialState(), milestones } as AppState;
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

describe("milestone reminders", () => {
  it("defaults to a ladder of lead days", () => {
    expect(defaultLeads(7)).toEqual([7, 1, 0]);
    expect(defaultLeads(0)).toEqual([1, 0]);
  });

  it("schedules future reminders at the configured hour", () => {
    const now = new Date(2026, 4, 1, 12, 0, 0);
    const rs = buildMilestoneReminders(stateWith([birthday]), now);
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) {
      expect(r.at.getTime()).toBeGreaterThan(now.getTime());
      expect(r.at.getHours()).toBe(9);
    }
    const dayOf = rs.find((r) => r.lead === 0 && r.occurrence.getFullYear() === 2026);
    expect(dayOf?.at.getMonth()).toBe(5);
    expect(dayOf?.at.getDate()).toBe(10);
  });

  it("rolls over to next year once the date has passed", () => {
    const now = new Date(2026, 6, 1, 12, 0, 0);
    const rs = buildMilestoneReminders(stateWith([birthday]), now);
    expect(rs.every((r) => r.occurrence.getFullYear() === 2027)).toBe(true);
  });

  it("skips silenced milestones", () => {
    const rs = buildMilestoneReminders(
      stateWith([{ ...birthday, remindersOff: true }]),
      new Date(2026, 4, 1),
    );
    expect(rs).toHaveLength(0);
  });

  it("uses stable ids across runs", () => {
    const a = buildMilestoneReminders(stateWith([birthday]), new Date(2026, 4, 1, 8));
    const b = buildMilestoneReminders(stateWith([birthday]), new Date(2026, 4, 1, 9));
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });

  it("writes friendly copy with the year count", () => {
    expect(reminderBody(birthday, 0, new Date(2026, 5, 10))).toContain("turning 30");
    expect(reminderBody(birthday, 1, new Date(2026, 5, 10))).toContain("tomorrow");
  });
});