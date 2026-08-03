import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Place } from "@/lib/app/types";

export type MappablePlace = Place & { lat: number; lng: number };

function markerIcon(owner: Place["owner"], visited: boolean) {
  const color =
    owner === "me" ? "var(--mine)" : owner === "them" ? "var(--theirs)" : "var(--ours)";
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
    html: `<span style="
      display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);border:2px solid var(--card);
      background:${color};opacity:${visited ? 0.55 : 1};
      box-shadow:0 2px 6px rgb(0 0 0 / 0.25);"></span>`,
  });
}

/** Keeps every pin in view whenever the visible set changes. */
function FitBounds({ places }: { places: MappablePlace[] }) {
  const map = useMap();
  const key = places.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|");

  useEffect(() => {
    if (places.length === 0) return;
    const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: false });
    // Tiles can mis-measure inside a freshly mounted flex container.
    const t = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);

  return null;
}

export default function PlacesMap({
  places,
  meName,
  themName,
  onSelect,
}: {
  places: MappablePlace[];
  meName: string;
  themName: string;
  onSelect: (place: Place) => void;
}) {
  const center = useMemo<[number, number]>(() => {
    if (places.length === 0) return [20, 0];
    const lat = places.reduce((s, p) => s + p.lat, 0) / places.length;
    const lng = places.reduce((s, p) => s + p.lng, 0) / places.length;
    return [lat, lng];
  }, [places]);

  return (
    <MapContainer
      center={center}
      zoom={places.length ? 11 : 2}
      scrollWheelZoom
      className="h-[420px] w-full"
      style={{ background: "var(--muted)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds places={places} />
      {places.map((place) => (
        <Marker
          key={place.id}
          position={[place.lat, place.lng]}
          icon={markerIcon(place.owner, place.visited)}
        >
          <Popup>
            <span className="block font-display text-base font-semibold text-foreground">
              {place.name}
            </span>
            {place.address ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">{place.address}</span>
            ) : null}
            <span className="mt-1 block text-xs text-muted-foreground">
              {place.owner === "me" ? meName || "Me" : place.owner === "them" ? themName || "Them" : "Together"}
              {place.visited ? " · been" : ""}
            </span>
            <button
              type="button"
              className="mt-2 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              onClick={() => onSelect(place)}
            >
              Plan it
            </button>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
