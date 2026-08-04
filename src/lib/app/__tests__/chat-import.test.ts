import { describe, expect, it } from "vitest";
import {
  guessOwners,
  messageId,
  parseChatExport,
  parseCsvExport,
  parseDiscordJson,
  parseImessageText,
  parseInstagramJson,
} from "../chat-import";

describe("chat export parsing", () => {
  it("reads Instagram download JSON", () => {
    const parsed = parseInstagramJson({
      participants: [{ name: "Ada" }, { name: "Sam" }],
      messages: [
        { sender_name: "Ada", timestamp_ms: 1700000000000, content: "miss you" },
        { sender_name: "Sam", timestamp_ms: 1700000100000, content: "miss you more" },
        { sender_name: "Sam", timestamp_ms: 1700000200000 },
      ],
    });
    expect(parsed?.source).toBe("instagram");
    expect(parsed?.messages).toHaveLength(2);
    expect(parsed?.messages[0]?.text).toBe("miss you");
    expect(parsed?.senders).toEqual(["Ada", "Sam"]);
  });

  it("reads a Discord data package json as my own messages", () => {
    const parsed = parseDiscordJson(
      [
        { ID: "1", Timestamp: "2026-01-02T03:04:05+00:00", Contents: "goodnight" },
        { ID: "2", Timestamp: "nope", Contents: "dropped" },
      ],
      "Ada",
    );
    expect(parsed?.source).toBe("discord");
    expect(parsed?.messages).toHaveLength(1);
    expect(parsed?.messages[0]?.mine).toBe(true);
    expect(parsed?.messages[0]?.senderName).toBe("Ada");
  });

  it("reads a Discord messages.csv", () => {
    const csv = 'ID,Timestamp,Contents,Attachments\n1,2026-01-02T03:04:05+00:00,"hi, there",\n';
    const parsed = parseCsvExport(csv, "Ada");
    expect(parsed?.source).toBe("discord");
    expect(parsed?.messages[0]?.text).toBe("hi, there");
  });

  it("reads a plain-text iMessage export", () => {
    const txt = [
      "Jan 02, 2026  9:15:00 AM",
      "Me",
      "morning",
      "",
      "Jan 02, 2026  9:16:00 AM",
      "+15551234567",
      "morning to you",
      "too",
      "",
    ].join("\n");
    const parsed = parseImessageText(txt);
    expect(parsed?.source).toBe("imessage");
    expect(parsed?.messages).toHaveLength(2);
    expect(parsed?.messages[0]?.mine).toBe(true);
    expect(parsed?.messages[1]?.text).toBe("morning to you\ntoo");
  });

  it("auto-detects the format", () => {
    expect(
      parseChatExport('{"messages":[{"sender_name":"Ada","timestamp_ms":1,"content":"x"}]}')
        ?.source,
    ).toBe("instagram");
    expect(parseChatExport("Jan 02, 2026  9:15:00 AM\nMe\nhey", "chat.txt")?.source).toBe(
      "imessage",
    );
    expect(parseChatExport("   ")).toBeNull();
  });

  it("maps senders onto the two of you", () => {
    const parsed = parseInstagramJson({
      messages: [
        { sender_name: "Ada", timestamp_ms: 1, content: "a" },
        { sender_name: "Sam", timestamp_ms: 2, content: "b" },
      ],
    })!;
    expect(guessOwners(parsed, "Ada", "Sam")).toEqual({ Ada: "me", Sam: "them" });
  });

  it("gives stable ids so re-imports dedupe", () => {
    expect(messageId("imessage", 1000, "hey")).toBe(messageId("imessage", 1000, "hey"));
    expect(messageId("imessage", 1000, "hey")).not.toBe(messageId("discord", 1000, "hey"));
  });
});
