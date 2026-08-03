import { describe, expect, it } from "vitest";
import { ideaMessage } from "../idea-share";
import type { Place } from "../types";

const place: Place = {
  id: "p1",
  name: "Rooftop Cinema",
  address: "12 Main St, Brooklyn",
  owner: "us",
  source: "manual",
  visited: false,
  updatedAt: 0,
};

describe("ideaMessage", () => {
  it("names the sender and includes the details", () => {
    const msg = ideaMessage(place, "Will");
    expect(msg).toContain("Will added a date idea");
    expect(msg).toContain("Rooftop Cinema");
    expect(msg).toContain("12 Main St, Brooklyn");
    expect(msg).toContain("http");
  });

  it("falls back when no name is set", () => {
    expect(ideaMessage(place, "  ")).toContain("Your partner added a date idea");
  });
});
