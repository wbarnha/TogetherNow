/**
 * Runtime validation for every value that enters the app from outside the
 * running page: a partner's share code, a `?code=` invite link, and whatever
 * happens to be sitting in localStorage.
 *
 * None of that is trustworthy. A share code is a compressed blob a stranger
 * can hand you over any channel, and the previous version of this app fed it
 * straight through `JSON.parse(...) as SharePayload` into React state and back
 * into storage. That let a hostile code:
 *
 *   - carry a `javascript:` link into an `<a href>` on the Ideas screen,
 *   - pin its own items forever with `updatedAt: Infinity` so the merge could
 *     never overwrite them,
 *   - blow up localStorage (and freeze the tab) with unbounded arrays,
 *   - and put values outside every declared union straight into state, so
 *     rendering crashed on data the type system swore was safe.
 *
 * Everything here is total: a bad field drops the one item that carried it,
 * never the whole import. Sizes are capped so a hostile payload costs bounded
 * memory and bounded time.
 */

import { safeHttpUrl } from "./safe-url";
import {
  emptyProfile,
  initialState,
  type AppState,
  type CalendarSource,
  type ChatImport,
  type ChatMessage,
  type Expense,
  type ExpenseCategory,
  type MessengerId,
  type Milestone,
  type MilestoneKind,
  type MoodEntry,
  type MoodScore,
  type Owner,
  type Place,
  type PlaceCategory,
  type PlanEvent,
  type Profile,
  type SavingsGoal,
  type SharingPrefs,
  type SplitMode,
  type TravelMode,
  type TravelOption,
  type Trip,
  type TripStatus,
  type WatchEntry,
  type WatchImport,
  type WatchService,
} from "./types";

/* ----------------------------- size ceilings ---------------------------- */

/**
 * Upper bounds, not expectations. They exist so a hostile or corrupt payload
 * costs a predictable amount of memory and main-thread time; real couples are
 * orders of magnitude under every one of them.
 */
export const LIMITS = {
  shortText: 200,
  text: 500,
  note: 4_000,
  url: 2_048,
  events: 5_000,
  milestones: 1_000,
  places: 10_000,
  trips: 500,
  travelOptions: 100,
  moods: 2_000,
  expenses: 10_000,
  goals: 500,
  watchEntries: 50_000,
  watchImports: 500,
  chatMessages: 200_000,
  chatImports: 500,
  calendarSources: 200,
  handles: 20,
  reminders: 12,
  /** compressed share code, before decompression */
  shareCode: 4_000_000,
  /** decompressed share-code JSON */
  sharePayload: 16_000_000,
} as const;

/** An `updatedAt` further ahead than this is a clock error or an attempt to
 * pin an item so no later edit can ever win the merge. */
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/* ------------------------------ primitives ------------------------------ */

/**
 * C0/C1 controls except tab and newline. They render as nothing, so they are
 * a cheap way to make one label masquerade as another.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A trimmed, length-capped string, or undefined when absent or empty. */
function str(v: unknown, max: number = LIMITS.text): string | undefined {
  if (typeof v !== "string") return undefined;
  const cleaned = v.replace(CONTROL_CHARS, "").trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, max);
}

/** A required string; falls back rather than dropping the item. */
function strOr(v: unknown, fallback: string, max: number = LIMITS.text): string {
  return str(v, max) ?? fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** A finite number inside [min, max], or undefined. */
function num(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function numOr(v: unknown, fallback: number, min: number, max: number): number {
  return num(v, min, max) ?? fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function oneOfOr<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return oneOf(v, allowed) ?? fallback;
}

/** `yyyy-MM-dd` that names a real calendar day. */
function isoDate(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  // Reject 31 February and friends.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return undefined;
  return `${y}-${mo}-${d}`;
}

/** `HH:mm` on a 24-hour clock. */
function isoTime(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  if (Number(m[1]) > 23 || Number(m[2]) > 59) return undefined;
  return `${m[1]}:${m[2]}`;
}

/**
 * An identifier safe to use as a `Map` key and as a React `key`.
 * `__proto__` is excluded because ids flow into object literals downstream.
 */
function id(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > 128) return undefined;
  if (trimmed === "__proto__" || trimmed === "constructor" || trimmed === "prototype") {
    return undefined;
  }
  if (!/^[\w.:@+-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * A timestamp that is finite and not implausibly far in the future, so a
 * payload cannot make its items permanently un-overwritable.
 */
function timestamp(v: unknown, now = Date.now()): number | undefined {
  return num(v, 0, now + MAX_CLOCK_SKEW_MS);
}

function timestampOr(v: unknown, fallback: number, now = Date.now()): number {
  return timestamp(v, now) ?? fallback;
}

/** An IANA zone the runtime actually knows, else the fallback. */
function timeZone(v: unknown, fallback: string): string {
  const raw = str(v, 64);
  if (!raw) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return fallback;
  }
}

/**
 * Map a capped slice of an array through a validator, dropping anything that
 * fails. Non-arrays become an empty list rather than throwing.
 */
function list<T>(v: unknown, max: number, each: (item: unknown) => T | undefined): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v.slice(0, max)) {
    const parsed = each(item);
    if (parsed !== undefined) out.push(parsed);
  }
  return out;
}

/** Drop items sharing an id, keeping the first — ids are merge keys. */
function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/* -------------------------------- unions -------------------------------- */

const OWNERS = ["me", "them", "us"] as const satisfies readonly Owner[];
const SIDES = ["me", "them"] as const;
const MILESTONE_KINDS = [
  "birthday",
  "anniversary",
  "first-met",
  "custom",
] as const satisfies readonly MilestoneKind[];
const PLACE_CATEGORY_VALUES = [
  "food",
  "drinks",
  "outdoors",
  "culture",
  "nightlife",
  "stay",
  "shopping",
  "other",
] as const satisfies readonly PlaceCategory[];
const PLACE_SOURCES = ["google", "apple", "manual"] as const satisfies readonly Place["source"][];
const MESSENGER_IDS = [
  "imessage",
  "facetime",
  "discord",
  "instagram",
  "whatsapp",
  "telegram",
] as const satisfies readonly MessengerId[];
const TRAVEL_MODES = [
  "flight",
  "train",
  "bus",
  "drive",
  "ferry",
] as const satisfies readonly TravelMode[];
const TRIP_STATUSES = ["idea", "researching", "booked"] as const satisfies readonly TripStatus[];
const EXPENSE_CATEGORIES = [
  "travel",
  "gifts",
  "dates",
  "subscriptions",
  "calls",
  "other",
] as const satisfies readonly ExpenseCategory[];
const SPLIT_MODES = ["even", "mine", "theirs", "custom"] as const satisfies readonly SplitMode[];
const CHAT_SOURCES = [
  "imessage",
  "discord",
  "instagram",
  "unknown",
] as const satisfies readonly ChatMessage["source"][];
const WATCH_SERVICE_IDS = [
  "netflix",
  "hulu",
  "steam",
  "crunchyroll",
  "other",
] as const satisfies readonly WatchService[];
const CALENDAR_KINDS = [
  "ics-file",
  "ics-paste",
] as const satisfies readonly CalendarSource["kind"][];

function moodScore(v: unknown): MoodScore | undefined {
  const n = num(v, 1, 5);
  if (n === undefined) return undefined;
  return Math.round(n) as MoodScore;
}

/** ISO 4217-ish: three letters. Anything else falls back. */
function currency(v: unknown, fallback = "USD"): string {
  const raw = str(v, 8)?.toUpperCase();
  return raw && /^[A-Z]{3}$/.test(raw) ? raw : fallback;
}

/** Money, capped well above any real shared expense but far below Infinity. */
function money(v: unknown): number | undefined {
  return num(v, -1e12, 1e12);
}

function moneyOr(v: unknown, fallback = 0): number {
  return money(v) ?? fallback;
}

/* ------------------------------- entities ------------------------------- */

export function validEvent(raw: unknown, now = Date.now()): PlanEvent | undefined {
  if (!isRecord(raw)) return undefined;
  const eventId = id(raw["id"]);
  const date = isoDate(raw["date"]);
  if (!eventId || !date) return undefined;
  return {
    id: eventId,
    title: strOr(raw["title"], "Untitled plan"),
    date,
    time: isoTime(raw["time"]),
    anchor: oneOfOr(raw["anchor"], SIDES, "me"),
    notes: str(raw["notes"], LIMITS.note),
    owner: oneOfOr(raw["owner"], OWNERS, "us"),
    updatedAt: timestampOr(raw["updatedAt"], now, now),
  };
}

export function validMilestone(raw: unknown, now = Date.now()): Milestone | undefined {
  if (!isRecord(raw)) return undefined;
  const milestoneId = id(raw["id"]);
  const date = isoDate(raw["date"]);
  if (!milestoneId || !date) return undefined;
  const reminders = Array.isArray(raw["reminders"])
    ? [
        ...new Set(
          list(raw["reminders"], LIMITS.reminders, (d) => num(d, 0, 365)).map((d) => Math.round(d)),
        ),
      ].sort((a, b) => a - b)
    : undefined;
  return {
    id: milestoneId,
    title: strOr(raw["title"], "Untitled date"),
    kind: oneOfOr(raw["kind"], MILESTONE_KINDS, "custom"),
    date,
    recurring: bool(raw["recurring"], true),
    owner: oneOfOr(raw["owner"], OWNERS, "us"),
    reminders,
    remindersOff: typeof raw["remindersOff"] === "boolean" ? raw["remindersOff"] : undefined,
    updatedAt: timestampOr(raw["updatedAt"], now, now),
  };
}

export function validPlace(raw: unknown, now = Date.now()): Place | undefined {
  if (!isRecord(raw)) return undefined;
  const placeId = id(raw["id"]);
  const name = str(raw["name"]);
  if (!placeId || !name) return undefined;
  return {
    id: placeId,
    name,
    address: str(raw["address"]),
    note: str(raw["note"], LIMITS.note),
    // The single most important line in this file: a place URL is the one
    // untrusted string that reaches an href.
    url: safeHttpUrl(str(raw["url"], LIMITS.url)),
    lat: num(raw["lat"], -90, 90),
    lng: num(raw["lng"], -180, 180),
    owner: oneOfOr(raw["owner"], OWNERS, "them"),
    source: oneOfOr(raw["source"], PLACE_SOURCES, "manual"),
    category: oneOf(raw["category"], PLACE_CATEGORY_VALUES),
    visited: bool(raw["visited"]),
    shortlisted: typeof raw["shortlisted"] === "boolean" ? raw["shortlisted"] : undefined,
    updatedAt: timestampOr(raw["updatedAt"], now, now),
  };
}

export function validMood(raw: unknown, now = Date.now()): MoodEntry | undefined {
  if (!isRecord(raw)) return undefined;
  const moodId = id(raw["id"]);
  const date = isoDate(raw["date"]);
  const score = moodScore(raw["score"]);
  if (!moodId || !date || score === undefined) return undefined;
  return {
    id: moodId,
    owner: oneOfOr(raw["owner"], SIDES, "them"),
    date,
    score,
    note: str(raw["note"], LIMITS.note),
    updatedAt: timestampOr(raw["updatedAt"], now, now),
  };
}

export function validExpense(raw: unknown, now = Date.now()): Expense | undefined {
  if (!isRecord(raw)) return undefined;
  const expenseId = id(raw["id"]);
  const date = isoDate(raw["date"]);
  const amount = money(raw["amount"]);
  if (!expenseId || !date || amount === undefined) return undefined;
  const split = oneOfOr(raw["split"], SPLIT_MODES, "even");
  return {
    id: expenseId,
    title: strOr(raw["title"], "Expense"),
    amount,
    currency: currency(raw["currency"]),
    date,
    paidBy: oneOfOr(raw["paidBy"], SIDES, "me"),
    split,
    myPercent: split === "custom" ? numOr(raw["myPercent"], 50, 0, 100) : undefined,
    category: oneOfOr(raw["category"], EXPENSE_CATEGORIES, "other"),
    tripId: id(raw["tripId"]),
    notes: str(raw["notes"], LIMITS.note),
    settled: bool(raw["settled"]),
    updatedAt: timestampOr(raw["updatedAt"], now, now),
  };
}

export function validGoal(raw: unknown, now = Date.now()): SavingsGoal | undefined {
  if (!isRecord(raw)) return undefined;
  const goalId = id(raw["id"]);
  const target = money(raw["target"]);
  if (!goalId || target === undefined) return undefined;
  return {
    id: goalId,
    title: strOr(raw["title"], "Savings goal"),
    target,
    currency: currency(raw["currency"]),
    deadline: isoDate(raw["deadline"]),
    savedByMe: moneyOr(raw["savedByMe"]),
    savedByThem: moneyOr(raw["savedByThem"]),
    monthlyByMe: moneyOr(raw["monthlyByMe"]),
    monthlyByThem: moneyOr(raw["monthlyByThem"]),
    tripId: id(raw["tripId"]),
    notes: str(raw["notes"], LIMITS.note),
    updatedAt: timestampOr(raw["updatedAt"], now, now),
  };
}

function validTravelOption(raw: unknown, now = Date.now()): TravelOption | undefined {
  if (!isRecord(raw)) return undefined;
  const optionId = id(raw["id"]);
  if (!optionId) return undefined;
  return {
    id: optionId,
    mode: oneOfOr(raw["mode"], TRAVEL_MODES, "flight"),
    carrier: str(raw["carrier"], LIMITS.shortText),
    cost: money(raw["cost"]),
    durationMinutes: num(raw["durationMinutes"], 0, 60 * 24 * 30),
    detail: str(raw["detail"]),
    url: safeHttpUrl(str(raw["url"], LIMITS.url)),
    chosen: bool(raw["chosen"]),
    updatedAt: timestampOr(raw["updatedAt"], now, now),
  };
}

export function validTrip(raw: unknown, now = Date.now()): Trip | undefined {
  if (!isRecord(raw)) return undefined;
  const tripId = id(raw["id"]);
  if (!tripId) return undefined;
  return {
    id: tripId,
    title: strOr(raw["title"], "Trip"),
    traveller: oneOfOr(raw["traveller"], OWNERS, "me"),
    origin: strOr(raw["origin"], ""),
    destination: strOr(raw["destination"], ""),
    startDate: isoDate(raw["startDate"]),
    endDate: isoDate(raw["endDate"]),
    status: oneOfOr(raw["status"], TRIP_STATUSES, "idea"),
    currency: currency(raw["currency"]),
    budget: money(raw["budget"]),
    savedByMe: moneyOr(raw["savedByMe"]),
    savedByThem: moneyOr(raw["savedByThem"]),
    notes: str(raw["notes"], LIMITS.note),
    options: uniqueById(
      list(raw["options"], LIMITS.travelOptions, (o) => validTravelOption(o, now)),
    ),
    updatedAt: timestampOr(raw["updatedAt"], now, now),
  };
}

export function validWatchEntry(raw: unknown, now = Date.now()): WatchEntry | undefined {
  if (!isRecord(raw)) return undefined;
  const entryId = id(raw["id"]);
  const title = str(raw["title"]);
  if (!entryId || !title) return undefined;
  return {
    id: entryId,
    importId: id(raw["importId"]),
    service: oneOfOr(raw["service"], WATCH_SERVICE_IDS, "other"),
    title,
    detail: str(raw["detail"]),
    owner: oneOfOr(raw["owner"], SIDES, "them"),
    at: timestampOr(raw["at"], now, now),
    dateUnknown: typeof raw["dateUnknown"] === "boolean" ? raw["dateUnknown"] : undefined,
    minutes: num(raw["minutes"], 0, 60 * 24 * 365),
    together: typeof raw["together"] === "boolean" ? raw["together"] : undefined,
  };
}

function validWatchImport(raw: unknown, now = Date.now()): WatchImport | undefined {
  if (!isRecord(raw)) return undefined;
  const importId = id(raw["id"]);
  if (!importId) return undefined;
  return {
    id: importId,
    service: oneOfOr(raw["service"], WATCH_SERVICE_IDS, "other"),
    label: strOr(raw["label"], "Import", LIMITS.shortText),
    owner: oneOfOr(raw["owner"], SIDES, "me"),
    entryCount: numOr(raw["entryCount"], 0, 0, LIMITS.watchEntries),
    importedAt: timestampOr(raw["importedAt"], now, now),
  };
}

function validChatMessage(raw: unknown, now = Date.now()): ChatMessage | undefined {
  if (!isRecord(raw)) return undefined;
  const messageId = id(raw["id"]);
  const text = str(raw["text"], LIMITS.note);
  if (!messageId || !text) return undefined;
  return {
    id: messageId,
    // Preserved, not derived: dropping it here would orphan every message on
    // the next hydration and make its import undeletable.
    importId: id(raw["importId"]),
    source: oneOfOr(raw["source"], CHAT_SOURCES, "unknown"),
    owner: oneOfOr(raw["owner"], SIDES, "them"),
    senderName: strOr(raw["senderName"], "Unknown", LIMITS.shortText),
    text,
    at: timestampOr(raw["at"], now, now),
  };
}

function validChatImport(raw: unknown, now = Date.now()): ChatImport | undefined {
  if (!isRecord(raw)) return undefined;
  const importId = id(raw["id"]);
  if (!importId) return undefined;
  return {
    id: importId,
    source: oneOfOr(raw["source"], CHAT_SOURCES, "unknown"),
    label: strOr(raw["label"], "Import", LIMITS.shortText),
    messageCount: numOr(raw["messageCount"], 0, 0, LIMITS.chatMessages),
    firstAt: timestampOr(raw["firstAt"], 0, now),
    lastAt: timestampOr(raw["lastAt"], now, now),
    importedAt: timestampOr(raw["importedAt"], now, now),
  };
}

function validCalendarSource(raw: unknown, now = Date.now()): CalendarSource | undefined {
  if (!isRecord(raw)) return undefined;
  const sourceId = id(raw["id"]);
  if (!sourceId) return undefined;
  return {
    id: sourceId,
    label: strOr(raw["label"], "Calendar", LIMITS.shortText),
    kind: oneOfOr(raw["kind"], CALENDAR_KINDS, "ics-file"),
    owner: oneOfOr(raw["owner"], OWNERS, "us"),
    anchor: oneOfOr(raw["anchor"], SIDES, "me"),
    eventCount: numOr(raw["eventCount"], 0, 0, LIMITS.events),
    lastImportAt: timestampOr(raw["lastImportAt"], now, now),
  };
}

export function validProfile(raw: unknown, fallback: Profile): Profile {
  if (!isRecord(raw)) return fallback;
  const handles: Profile["handles"] = {};
  if (isRecord(raw["handles"])) {
    for (const key of MESSENGER_IDS) {
      const handle = str(raw["handles"][key], LIMITS.shortText);
      if (handle) handles[key] = handle;
    }
  }
  return {
    name: strOr(raw["name"], "", LIMITS.shortText),
    timeZone: timeZone(raw["timeZone"], fallback.timeZone),
    handles,
  };
}

function validSharingPrefs(raw: unknown, fallback: SharingPrefs): SharingPrefs {
  if (!isRecord(raw)) return fallback;
  const keys = Object.keys(fallback) as (keyof SharingPrefs)[];
  const out = { ...fallback };
  for (const key of keys) out[key] = bool(raw[key], fallback[key]);
  return out;
}

/* ------------------------------ whole state ----------------------------- */

/**
 * Rebuild an {@link AppState} from whatever was in storage. Never throws and
 * never returns a partially-typed object: unknown keys are dropped, missing
 * ones take their default, and malformed items are discarded individually so
 * one bad record cannot cost the user their whole archive.
 */
export function validAppState(raw: unknown, now = Date.now()): AppState {
  const base = initialState();
  if (!isRecord(raw) || raw["version"] !== 1) return base;

  return {
    version: 1,
    onboarded: bool(raw["onboarded"], base.onboarded),
    me: validProfile(raw["me"], base.me),
    them: validProfile(raw["them"], base.them),
    startDate: isoDate(raw["startDate"]) ?? null,
    pairedAt: timestamp(raw["pairedAt"], now) ?? null,
    inviteSentAt: timestamp(raw["inviteSentAt"], now) ?? null,
    inviteFailedAt: timestamp(raw["inviteFailedAt"], now) ?? null,
    events: uniqueById(list(raw["events"], LIMITS.events, (v) => validEvent(v, now))),
    milestones: uniqueById(
      list(raw["milestones"], LIMITS.milestones, (v) => validMilestone(v, now)),
    ),
    places: uniqueById(list(raw["places"], LIMITS.places, (v) => validPlace(v, now))),
    trips: uniqueById(list(raw["trips"], LIMITS.trips, (v) => validTrip(v, now))),
    moods: uniqueById(list(raw["moods"], LIMITS.moods, (v) => validMood(v, now))),
    expenses: uniqueById(list(raw["expenses"], LIMITS.expenses, (v) => validExpense(v, now))),
    goals: uniqueById(list(raw["goals"], LIMITS.goals, (v) => validGoal(v, now))),
    reminderLeadDays: numOr(raw["reminderLeadDays"], base.reminderLeadDays, 0, 365),
    reminderHour: Math.round(numOr(raw["reminderHour"], base.reminderHour, 0, 23)),
    theme: oneOfOr(raw["theme"], ["light", "dark"] as const, base.theme),
    sharing: validSharingPrefs(raw["sharing"], base.sharing),
    calendarSources: uniqueById(
      list(raw["calendarSources"], LIMITS.calendarSources, (v) => validCalendarSource(v, now)),
    ),
    chatMessages: uniqueById(
      list(raw["chatMessages"], LIMITS.chatMessages, (v) => validChatMessage(v, now)),
    ),
    chatImports: uniqueById(
      list(raw["chatImports"], LIMITS.chatImports, (v) => validChatImport(v, now)),
    ),
    watchEntries: uniqueById(
      list(raw["watchEntries"], LIMITS.watchEntries, (v) => validWatchEntry(v, now)),
    ),
    watchImports: uniqueById(
      list(raw["watchImports"], LIMITS.watchImports, (v) => validWatchImport(v, now)),
    ),
    lastSharedAt: timestamp(raw["lastSharedAt"], now) ?? null,
    lastReceivedAt: timestamp(raw["lastReceivedAt"], now) ?? null,
  };
}

/* --------------------- shared with the share-code parser ------------------ */

export { isRecord, isoDate, list, str, strOr, timeZone, uniqueById };
