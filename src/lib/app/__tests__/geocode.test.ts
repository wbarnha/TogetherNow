import { describe, expect, it } from "vitest";
import { parseLatLng, shortLabel } from "../geocode";

describe("parseLatLng", () => {
  it("parses a comma separated pair", () => {
    expect(parseLatLng("40.7128, -74.006")).toMatchObject({ lat: 40.7128, lng: -74.006 });
  });

  it("parses coordinates out of a Google Maps link", () => {
    expect(parseLatLng("https://maps.google.com/?q=x/@48.8584,2.2945,17z")).toMatchObject({
      lat: 48.8584,
      lng: 2.2945,
    });
  });

  it("rejects out of range and non-coordinate text", () => {
    expect(parseLatLng("120.0, 5.0")).toBeNull();
    expect(parseLatLng("brooklyn coffee")).toBeNull();
    expect(parseLatLng("")).toBeNull();
  });
});

describe("shortLabel", () => {
  it("trims long display names", () => {
    expect(shortLabel("Cafe, Main St, Brooklyn, Kings County, New York, USA")).toBe(
      "Cafe, Main St, Brooklyn",
    );
  });
});
