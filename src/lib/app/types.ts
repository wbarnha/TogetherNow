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

export type PlaceCategory =
  | "food"
  | "drinks"
  | "outdoors"
  | "culture"
  | "nightlife"
  | "stay"
  | "shopping"
  | "other";

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
  /** set by the user; when absent it is guessed from the name */
  category?: PlaceCategory | undefined;
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

export type TravelMode = "flight" | "train" | "bus" | "drive" | "ferry";

/** One researched way of making a trip happen. */
export type TravelOption = {
  id: string;
  mode: TravelMode;
  /** airline, rail operator, coach line… */
  carrier?: string | undefined;
  /** total price per person, in the trip's currency */
  cost?: number | undefined;
  /** door-to-door duration in minutes */
  durationMinutes?: number | undefined;
  /** free text like "1 stop in Reykjavik" */
  detail?: string | undefined;
  url?: string | undefined;
  /** the option you're going with */
  chosen: boolean;
  updatedAt: number;
};

export type TripStatus = "idea" | "researching" | "booked";

export type Trip = {
  id: string;
  title: string;
  /** who is doing the travelling */
  traveller: Owner;
  origin: string;
  destination: string;
  /** yyyy-MM-dd */
  startDate?: string | undefined;
  endDate?: string | undefined;
  status: TripStatus;
  currency: string;
  /** what the whole visit should cost */
  budget?: number | undefined;
  /** money set aside so far */
  savedByMe: number;
  savedByThem: number;
  notes?: string | undefined;
  options: TravelOption[];
  updatedAt: number;
};

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
  trips: Trip[];
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
  trips: [],
  reminderLeadDays: 3,
  theme: "light",
});