import { digestOf } from "./digest";
import type { Owner } from "./types";

export type ChatSourceId = "imessage" | "discord" | "instagram" | "unknown";

export type ParsedMessage = {
  /** epoch ms */
  at: number;
  senderName: string;
  text: string;
  /** true when the export marks this as sent by the exporter */
  mine: boolean | null;
};

export type ParsedExport = {
  source: ChatSourceId;
  /** distinct sender names found, in order of first appearance */
  senders: string[];
  messages: ParsedMessage[];
};

export const CHAT_SOURCES: { id: ChatSourceId; name: string; accent: string; how: string }[] = [
  {
    id: "imessage",
    name: "iMessage",
    accent: "#34c759",
    how: "Export a conversation as .txt or .csv (iMazing, imessage-exporter, or Mac Messages copy/paste).",
  },
  {
    id: "discord",
    name: "Discord",
    accent: "#5865f2",
    how: "Settings → Privacy & Safety → Request my data, then pick messages.csv or messages.json from the package.",
  },
  {
    id: "instagram",
    name: "Instagram",
    accent: "#e1306c",
    how: "Settings → Your activity → Download your information (JSON), then pick message_1.json.",
  },
];

/* ------------------------------- helpers -------------------------------- */

function clean(s: string) {
  return s.replace(/\r/g, "").trim();
}

/** Instagram JSON exports are mojibake-encoded UTF-8; repair the common cases. */
export function fixInstagramText(s: string) {
  try {
    const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return decoded.includes("\uFFFD") ? s : decoded;
  } catch {
    return s;
  }
}

/** Minimal RFC 4180 CSV row splitter. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function collect(messages: ParsedMessage[], source: ChatSourceId): ParsedExport {
  const senders: string[] = [];
  for (const m of messages)
    if (m.senderName && !senders.includes(m.senderName)) senders.push(m.senderName);
  messages.sort((a, b) => a.at - b.at);
  return { source, senders, messages };
}

/* ------------------------------- parsers -------------------------------- */

/** Instagram "Download your information" message_1.json. */
export function parseInstagramJson(data: unknown): ParsedExport | null {
  const root = data as { messages?: unknown[]; participants?: { name?: string }[] };
  if (!Array.isArray(root?.messages)) return null;
  const out: ParsedMessage[] = [];
  for (const raw of root.messages) {
    const m = raw as { sender_name?: string; timestamp_ms?: number; content?: string };
    if (!m || typeof m.timestamp_ms !== "number") continue;
    const text = clean(fixInstagramText(m.content ?? ""));
    if (!text) continue;
    out.push({
      at: m.timestamp_ms,
      senderName: fixInstagramText(m.sender_name ?? "Unknown"),
      text,
      mine: null,
    });
  }
  return out.length ? collect(out, "instagram") : null;
}

/** Discord data package messages.json (everything in it was sent by you). */
export function parseDiscordJson(data: unknown, me = "Me"): ParsedExport | null {
  if (!Array.isArray(data)) return null;
  const out: ParsedMessage[] = [];
  for (const raw of data) {
    const m = raw as {
      Timestamp?: string;
      timestamp?: string;
      Contents?: string;
      contents?: string;
    };
    const ts = m?.Timestamp ?? m?.timestamp;
    const body = clean(m?.Contents ?? m?.contents ?? "");
    if (!ts || !body) continue;
    const at = Date.parse(ts);
    if (Number.isNaN(at)) continue;
    out.push({ at, senderName: me, text: body, mine: true });
  }
  return out.length ? collect(out, "discord") : null;
}

/** Discord messages.csv, or an iMessage CSV export with sender/date/text columns. */
export function parseCsvExport(text: string, me = "Me"): ParsedExport | null {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return null;
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const tsCol = idx("timestamp", "date", "time", "message date", "date sent");
  const bodyCol = idx("contents", "content", "text", "message", "body");
  if (tsCol < 0 || bodyCol < 0) return null;
  const senderCol = idx("sender", "sender name", "from", "author", "who");
  const source: ChatSourceId =
    header.includes("contents") && senderCol < 0 ? "discord" : "imessage";

  const out: ParsedMessage[] = [];
  for (const row of rows.slice(1)) {
    const at = Date.parse((row[tsCol] ?? "").trim());
    const body = clean(row[bodyCol] ?? "");
    if (Number.isNaN(at) || !body) continue;
    const senderName = senderCol >= 0 ? clean(row[senderCol] ?? "") || "Unknown" : me;
    out.push({
      at,
      senderName,
      text: body,
      mine: senderCol < 0 ? true : /^(me|you)$/i.test(senderName) ? true : null,
    });
  }
  return out.length ? collect(out, source) : null;
}

/**
 * A timestamp line, optionally followed by " - Sender:".
 *
 * The trailing part was once `(?:\])?\s*(?:-\s*(.+?):)?\s*$`, with a `\s*`
 * on both sides of the optional group. A run of spaces could be divided
 * between the two in every possible way, so a line ending in whitespace and
 * one stray character cost time quadratic in its length: 16,000 spaces took
 * 241 ms, and an imported file may be 32 MB. Folding the leading `\s*` inside
 * the optional group leaves exactly one way to match a space run.
 *
 * The sender is bounded too. It is a name, not a document.
 */
const TS_LINE =
  /^(?:\[)?((?:\w{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})[,\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap]\.?[Mm]\.?)?)(?:\])?(?:\s*-\s*(.{1,64}?):)?\s*$/;

/**
 * Plain-text iMessage exports (imessage-exporter / iMazing / copy-paste).
 * Handles both "timestamp line, sender line, body" blocks and
 * "[timestamp] Sender: body" single lines.
 */
/**
 * "[timestamp] Sender: body" on one line.
 *
 * Every bound here is load-bearing. With an unbounded `(.+?)` for the stamp
 * and `\s+` for the separator, a run of spaces could be split between the two
 * in every possible way. A single line of 8,000 spaces took 14 seconds to
 * reject, and nothing stops an imported file being one 32 MB line — so any
 * chat export could freeze the tab for as long as it liked.
 *
 * A timestamp is never 64 characters and a separator is never four spaces, so
 * bounding both costs nothing real and makes the work per line constant. The
 * body stays unbounded: that is the part legitimately allowed to be long.
 */
const INLINE_LINE = /^\[?(.{1,64}?)\]?[ \t]{1,4}([^:]{1,60}):[ \t](.+)$/;

export function parseImessageText(text: string, me = "Me"): ParsedExport | null {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const out: ParsedMessage[] = [];
  let at: number | null = null;
  let sender: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const body = clean(buffer.join("\n"));
    buffer = [];
    if (at === null || !body) return;
    const name = sender?.trim() || "Unknown";
    out.push({
      at,
      senderName: name,
      text: body,
      mine: /^(me|you)$/i.test(name) ? true : null,
    });
  };

  for (const line of lines) {
    const match = TS_LINE.exec(line.trim());
    if (match) {
      flush();
      const parsed = Date.parse((match[1] ?? "").replace(/\./g, ""));
      at = Number.isNaN(parsed) ? null : parsed;
      sender = match[2] ? match[2].trim() : null;
      continue;
    }
    const inline = INLINE_LINE.exec(line.trim());
    if (inline && !Number.isNaN(Date.parse(inline[1] ?? ""))) {
      flush();
      at = Date.parse(inline[1] ?? "");
      sender = (inline[2] ?? "").trim();
      buffer = [inline[3] ?? ""];
      continue;
    }
    if (at === null) continue;
    if (/^(read|delivered|edited)\b/i.test(line.trim())) continue;
    if (sender === null && line.trim()) {
      sender = line.trim();
      continue;
    }
    buffer.push(line);
  }
  flush();
  if (!out.length) return null;
  for (const m of out) if (m.senderName === "Me") m.mine = true;
  return collect(out, "imessage");
}

/** Auto-detects the export format from its contents (and file name as a hint). */
export function parseChatExport(text: string, fileName = "", me = "Me"): ParsedExport | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed);
      const insta = parseInstagramJson(data);
      if (insta) return insta;
      const discord = parseDiscordJson(data, me);
      if (discord) return discord;
    } catch {
      /* fall through to text parsing */
    }
  }
  if (/\.csv$/i.test(fileName) || /^"?(id|timestamp|date|sender)/i.test(trimmed)) {
    const csv = parseCsvExport(trimmed, me);
    if (csv) return csv;
  }
  return parseImessageText(trimmed, me);
}

/* ----------------------------- normalisation ---------------------------- */

export type OwnerMap = Record<string, Owner>;

/** Guesses who each sender is from the two profile names. */
export function guessOwners(parsed: ParsedExport, meName: string, themName: string): OwnerMap {
  const map: OwnerMap = {};
  const norm = (s: string) => s.trim().toLowerCase();
  for (const sender of parsed.senders) {
    const first = parsed.messages.find((m) => m.senderName === sender);
    if (first?.mine) map[sender] = "me";
    else if (meName && norm(sender) === norm(meName)) map[sender] = "me";
    else if (themName && norm(sender) === norm(themName)) map[sender] = "them";
    else map[sender] = "them";
  }
  return map;
}

/** Stable id so re-importing the same export doesn't duplicate the thread. */
/**
 * Stable id so re-importing the same export doesn't duplicate the thread.
 *
 * Everything that identifies a message goes in. The previous version hashed
 * only source, timestamp and the first 120 characters into 32 bits — and then
 * `Math.abs(h) >>> 0` folded the sign away, leaving 31. Two people replying
 * in the same second with the same opening sentence collided outright, and at
 * the archive's 200,000-message ceiling ordinary collisions were expected
 * about five times over. A colliding message is not flagged: it is taken for a
 * duplicate and dropped.
 */
export function messageId(source: ChatSourceId, at: number, senderName: string, text: string) {
  return `msg-${digestOf(source, at, senderName, text)}`;
}

/**
 * The id this message would have had before the digest changed.
 *
 * Kept so `migrateItemIds` can recognise archives written by an older build.
 */
export function legacyMessageId(source: ChatSourceId, at: number, text: string) {
  let h = 2166136261;
  const key = `${source}|${at}|${text.slice(0, 120)}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `msg-${(Math.abs(h) >>> 0).toString(36)}`;
}
