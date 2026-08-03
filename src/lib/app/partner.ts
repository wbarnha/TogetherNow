import { emptyProfile, type AppState, type SharingPrefs } from "./types";

export const SHARING_ITEMS: { key: keyof SharingPrefs; label: string; hint: string }[] = [
  { key: "plans", label: "Calendar plans", hint: "Events you own or that are marked as ours" },
  { key: "dates", label: "Important dates", hint: "Birthdays, anniversaries and milestones" },
  { key: "ideas", label: "Together ideas", hint: "Date ideas you added to the Together list" },
  { key: "moods", label: "Mood check-ins", hint: "Your last 30 daily check-ins" },
  { key: "money", label: "Money", hint: "Shared expenses and savings goals" },
];

/** How many of my items each sharing switch currently covers. */
export function sharingCounts(state: AppState): Record<keyof SharingPrefs, number> {
  return {
    plans: state.events.filter((e) => e.owner !== "them").length,
    dates: state.milestones.filter((m) => m.owner !== "them").length,
    ideas: state.places.filter((p) => p.shortlisted && p.owner !== "them").length,
    moods: state.moods.filter((m) => m.owner === "me").slice(-30).length,
    money: state.expenses.length + state.goals.length,
  };
}

/** Drop the pairing. Optionally delete everything that came from them. */
export function disconnectPartner(state: AppState, removeTheirItems = false): AppState {
  const base: AppState = {
    ...state,
    pairedAt: null,
    inviteSentAt: null,
    inviteFailedAt: null,
  };
  if (!removeTheirItems) return base;
  return {
    ...base,
    events: base.events.filter((e) => e.owner !== "them"),
    milestones: base.milestones.filter((m) => m.owner !== "them"),
    places: base.places.filter((p) => p.owner !== "them"),
    moods: base.moods.filter((m) => m.owner !== "them"),
    expenses: base.expenses.filter((e) => e.paidBy !== "them"),
  };
}

/** Clear the partner profile and everything of theirs, ready for a new invite. */
export function switchPartner(state: AppState, name = ""): AppState {
  const cleared = disconnectPartner(state, true);
  return {
    ...cleared,
    them: { ...emptyProfile(name), timeZone: state.them.timeZone },
    goals: cleared.goals.map((g) => ({ ...g, savedByThem: 0, monthlyByThem: 0 })),
    trips: cleared.trips.map((t) => ({ ...t, savedByThem: 0 })),
  };
}
