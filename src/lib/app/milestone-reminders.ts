import type { AppState, Milestone } from "./types";
import { startOfLocalDay } from "./time";
import { MILESTONE_ID_MAX, MILESTONE_ID_MIN, notificationId } from "./notification-ids";

export type ScheduledReminder = {
  /** stable numeric id so re-syncing replaces rather than duplicates */
  id: number;
  milestoneId: string;
  title: string;
  body: string;
  /** days before the milestone this fires */
  lead: number;
  /** the milestone occurrence this reminder points at */
  occurrence: Date;
  at: Date;
};

/** Sensible default ladder: a week out, the day before, and the morning of. */
export function defaultLeads(leadDays: number): number[] {
  const leads = new Set<number>([Math.max(0, Math.round(leadDays)), 1, 0]);
  return [...leads].sort((a, b) => b - a);
}

export function milestoneLeads(m: Milestone, state: AppState): number[] {
  if (m.remindersOff) return [];
  const custom = m.reminders?.filter((n) => Number.isFinite(n) && n >= 0);
  if (custom && custom.length) return [...new Set(custom.map(Math.round))].sort((a, b) => b - a);
  return defaultLeads(state.reminderLeadDays);
}

function occurrencesFor(m: Milestone, from: Date): Date[] {
  const [y, mo, d] = m.date.split("-").map(Number);
  if (!m.recurring) return [new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1)];
  const base = startOfLocalDay(from).getFullYear();
  return [new Date(base, (mo ?? 1) - 1, d ?? 1), new Date(base + 1, (mo ?? 1) - 1, d ?? 1)];
}

/**
 * Deterministic id inside the milestone band, so a reminder keeps the same id
 * across reloads and a resync replaces it rather than adding a second copy.
 */
function hashId(key: string) {
  return notificationId(key, MILESTONE_ID_MIN, MILESTONE_ID_MAX);
}

function yearsAt(m: Milestone, occurrence: Date) {
  if (!m.recurring) return null;
  const startYear = Number(m.date.split("-")[0]);
  if (!Number.isFinite(startYear)) return null;
  const n = occurrence.getFullYear() - startYear;
  return n > 0 ? n : null;
}

export function reminderBody(m: Milestone, lead: number, occurrence: Date) {
  const years = yearsAt(m, occurrence);
  const when = lead === 0 ? "is today" : lead === 1 ? "is tomorrow" : `is in ${lead} days`;
  if (m.kind === "birthday") {
    return years ? `${m.title} ${when} — turning ${years}.` : `${m.title} ${when}.`;
  }
  if (m.kind === "anniversary" || m.kind === "first-met") {
    return years ? `${m.title} ${when} — ${years} years.` : `${m.title} ${when}.`;
  }
  return `${m.title} ${when}.`;
}

/**
 * Pure planner: every future birthday/anniversary nudge for the next year.
 * Used both to schedule native notifications and to show the upcoming list.
 */
export function buildMilestoneReminders(
  state: AppState,
  from: Date = new Date(),
  horizonDays = 400,
): ScheduledReminder[] {
  const hour = Math.min(23, Math.max(0, Math.round(state.reminderHour ?? 9)));
  const limit = from.getTime() + horizonDays * 86400000;
  const out: ScheduledReminder[] = [];

  for (const m of state.milestones) {
    const leads = milestoneLeads(m, state);
    if (!leads.length) continue;
    for (const occurrence of occurrencesFor(m, from)) {
      for (const lead of leads) {
        const at = new Date(occurrence);
        at.setDate(at.getDate() - lead);
        at.setHours(hour, 0, 0, 0);
        if (at.getTime() <= from.getTime() || at.getTime() > limit) continue;
        out.push({
          id: hashId(`${m.id}:${occurrence.getFullYear()}:${lead}`),
          milestoneId: m.id,
          title: m.title,
          body: reminderBody(m, lead, occurrence),
          lead,
          occurrence,
          at,
        });
      }
    }
  }

  // Keep only the soonest reminder per milestone-occurrence pair ordering by time.
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Next upcoming reminder for one milestone, if any. */
export function nextReminderFor(state: AppState, milestoneId: string, from: Date = new Date()) {
  return buildMilestoneReminders(state, from).find((r) => r.milestoneId === milestoneId) ?? null;
}
