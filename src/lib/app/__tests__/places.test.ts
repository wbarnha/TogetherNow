import { describe, expect, it } from "vitest";
import {
  dedupeParsed,
  distanceMeters,
  guessCategory,
  isSamePlace,
  nameSimilarity,
  parsePlaces,
  placeId,
} from "../places";

describe("parsePlaces", () => {
  it("reads a Google Maps saved-places CSV", () => {
    const csv = `Title,Note,URL\n"Blue Bottle Coffee","morning spot","https://maps.google.com/?q=37.7749,-122.4194"\n"Dolores Park",,"https://maps.google.com/?q=37.7596,-122.4269"`;
    const places = parsePlaces(csv, "saved_places.csv");
    expect(places).toHaveLength(2);
    expect(places[0]!.name).toBe("Blue Bottle Coffee");
    expect(places[0]!.lat).toBeCloseTo(37.7749, 3);
  });
});

describe("matching helpers", () => {
  it("scores similar names highly", () => {
    expect(nameSimilarity("Blue Bottle Coffee", "blue bottle coffee")).toBe(1);
    expect(nameSimilarity("Blue Bottle Coffee", "Dolores Park")).toBeLessThan(0.3);
  });

  it("measures distance between coordinates", () => {
    const d = distanceMeters({ lat: 37.7749, lng: -122.4194 }, { lat: 37.7749, lng: -122.4194 });
    expect(d).toBe(0);
    const far = distanceMeters({ lat: 37.7749, lng: -122.4194 }, { lat: 37.7596, lng: -122.4269 });
    expect(far).toBeGreaterThan(1000);
  });

  it("treats nearby same-named pins as one place", () => {
    expect(
      isSamePlace(
        { name: "Blue Bottle Coffee", lat: 37.7749, lng: -122.4194 },
        { name: "Blue Bottle  coffee", lat: 37.77495, lng: -122.41945 },
      ),
    ).toBe(true);
    expect(
      isSamePlace(
        { name: "Blue Bottle Coffee", lat: 37.7749, lng: -122.4194 },
        { name: "Dolores Park", lat: 37.7596, lng: -122.4269 },
      ),
    ).toBe(false);
  });

  it("collapses duplicates on import", () => {
    const { places, merged } = dedupeParsed([
      { name: "Blue Bottle Coffee", lat: 37.7749, lng: -122.4194 },
      { name: "blue bottle coffee", lat: 37.7749, lng: -122.4194, note: "cortado" },
      { name: "Dolores Park", lat: 37.7596, lng: -122.4269 },
    ]);
    expect(places).toHaveLength(2);
    expect(merged).toBe(1);
    expect(places[0]!.note).toBe("cortado");
  });
});

describe("placeId", () => {
  it("is stable across re-imports", () => {
    const p = { name: "Dolores Park", lat: 37.7596, lng: -122.4269 };
    expect(placeId(p)).toBe(placeId({ ...p }));
  });
});

describe("guessCategory", () => {
  it("infers a category from the name", () => {
    expect(guessCategory({ name: "Blue Bottle Coffee" })).toBe("drinks");
    expect(guessCategory({ name: "Sushi Ramen House" })).toBe("food");
  });
});
