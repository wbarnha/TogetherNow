export type Owner = "me" | "them" | "us";

export type PlanEvent = {
  id: string;
  title: string;
  /** ISO date, yyyy-MM-dd */
  date: string;
  /** HH:mm in the anchor person's zone, optional */
  time?: string | undefined;
  /** whose local time the `time` field is expressed in */
  anchor: "me" | "them";
  notes?: string | undefined;
  owner: Owner;
  updatedAt: number;
};

export type MilestoneKind = "birthday" | "anniversary" | "first-met" | "custom";

export type Milestone = {
  id: string;
  title: string;
  kind: MilestoneKind;
  /** ISO date, yyyy-MM-dd — the original date */
  date: string;
  /** repeat every year */
  recurring: boolean;
  owner: Owner;
  updatedAt: number;
};

export type Place = {
  id: string;
  name: string;
  address?: string | undefined;
  note?: string | undefined;
  /** link back to Google/Apple Maps */
  url?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  owner: Owner;
  source: "google" | "apple" | "manual";
  /** already been there together */
  visited: boolean;
  updatedAt: number;
};

export type MessengerId =
  | "imessage"
  | "facetime"
  | "discord"
  | "instagram"
  | "whatsapp"
  | "telegram";

export type Profile = {
  name: string;
  timeZone: string;
  /** handle per messaging app */
  handles: Partial<Record<MessengerId, string>>;
};

export type AppState = {
  version: 1;
  onboarded: boolean;
  me: Profile;
  them: Profile;
  /** relationship start, yyyy-MM-dd */
  startDate: string | null;
  events: PlanEvent[];
  milestones: Milestone[];
  places: Place[];
  reminderLeadDays: number;
  theme: "light" | "dark";
};

export const emptyProfile = (name = ""): Profile => ({
  name,
  timeZone:
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      : "UTC",
  handles: {},
});

export const initialState = (): AppState => ({
  version: 1,
  onboarded: false,
  me: emptyProfile(),
  them: { ...emptyProfile(), timeZone: "Europe/London" },
  startDate: null,
  events: [],
  milestones: [],
  places: [],
  reminderLeadDays: 3,
  theme: "light",
});