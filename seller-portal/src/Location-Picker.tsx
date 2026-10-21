import { useCallback, useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./location-picker.css";
import { LocateFixed, MapPin, Search } from "lucide-react";

/**
 * Map pin picker for the station application.
 *
 * - Seller searches, clicks the map, drags the pin, or uses device location.
 * - The pin is the source of truth for latitude/longitude.
 * - A street line is suggested from the pin (reverse geocoding) but never
 *   overwrites text the seller typed unless they press "Use as street address".
 *
 * Geocoding uses a Nominatim-compatible service. The public OpenStreetMap
 * instance is fine for development and low volume (lookups only happen on
 * user actions, at most one per second). For production traffic set
 * VITE_GEOCODER_URL / VITE_MAP_TILES_URL to your own or a paid provider.
 */

const GEOCODER_URL = (import.meta.env.VITE_GEOCODER_URL?.trim() || "https://nominatim.openstreetmap.org")
  .replace(/\/+$/, "");
const GEOCODER_EMAIL = import.meta.env.VITE_GEOCODER_EMAIL?.trim();
const TILE_URL = import.meta.env.VITE_MAP_TILES_URL?.trim()
  || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const PH_CENTER: L.LatLngTuple = [12.8797, 121.774];

interface Notice {
  kind: "success" | "error";
  text: string;
}

interface GeoAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  village?: string;
  city?: string;
  town?: string;
  municipality?: string;
  county?: string;
  state_district?: string;
  city_district?: string;
}

interface GeoPlace {
  lat: string;
  lon: string;
  display_name: string;
  address?: GeoAddress;
  error?: string;
}

interface PinInfo {
  text: string;
  street: string;
  address?: GeoAddress;
}

let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;

/** Serializes geocoder calls and keeps them at least 1.1 s apart. */
function geocode<T>(path: string, params: Record<string, string>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequest + 1100 - Date.now();
    if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
    lastRequest = Date.now();
    const query = new URLSearchParams({ format: "jsonv2", "accept-language": "en", ...params });
    if (GEOCODER_EMAIL) query.set("email", GEOCODER_EMAIL);
    const response = await fetch(`${GEOCODER_URL}${path}?${query.toString()}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Map lookup failed (HTTP ${response.status}).`);
    return (await response.json()) as T;
  });
  queue = run.catch(() => undefined);
  return run;
}

function parsePoint(lat: string, lng: string): L.LatLngTuple | null {
  if (!lat.trim() || !lng.trim()) return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return [a, b];
}

function streetFrom(address?: GeoAddress) {
  if (!address) return "";
  return [address.house_number, address.road].filter(Boolean).join(" ");
}

function normalizePlace(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(city of|municipality of|city|municipality)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pinOutsideCity(city: string, address?: GeoAddress) {
  if (!city || !address) return false;
  const wanted = normalizePlace(city);
  const found = [address.city, address.town, address.municipality, address.village, address.city_district, address.county, address.state_district]
    .filter(Boolean)
    .map((value) => normalizePlace(String(value)));
  if (!wanted || found.length === 0) return false;
  return !found.some((value) => value.includes(wanted) || wanted.includes(value));
}

const pinIcon = L.divIcon({
  className: "pin-marker",
  html: "<span></span>",
  iconSize: [34, 44],
  iconAnchor: [17, 40],
});

export function LocationPicker({
  latitude,
  longitude,
  areaQuery,
  areaZoom,
  selectedCity,
  onPin,
  onStreetSuggestion,
  onNotice,
}: {
  latitude: string;
  longitude: string;
  /** "Barangay, City, Province" used to center the map before a pin is placed. */
  areaQuery: string;
  areaZoom: number;
  selectedCity: string;
  onPin: (latitude: number, longitude: number) => void;
  onStreetSuggestion: (street: string, force: boolean) => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const lookupId = useRef(0);
  const handlers = useRef({ onPin, onStreetSuggestion });
  handlers.current = { onPin, onStreetSuggestion };

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [locating, setLocating] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [pinInfo, setPinInfo] = useState<PinInfo | null>(null);

  const point = parsePoint(latitude, longitude);
  const placed = point !== null;
  const outside = pinInfo ? pinOutsideCity(selectedCity, pinInfo.address) : false;

  const ensureMarker = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      return;
    }
    const marker = L.marker([lat, lng], { draggable: true, icon: pinIcon, title: "Station location" }).addTo(map);
    marker.on("dragend", () => {
      const next = marker.getLatLng();
      commit(next.lat, next.lng);
    });
    markerRef.current = marker;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookup = useCallback(async (lat: number, lng: number) => {
    const id = ++lookupId.current;
    setLookupBusy(true);
    setLookupError("");
    try {
      const place = await geocode<GeoPlace>("/reverse", { lat: String(lat), lon: String(lng), zoom: "18", addressdetails: "1" });
      if (id !== lookupId.current) return;
      if (place.error || !place.display_name) {
        setPinInfo(null);
        setLookupError(place.error || "No address suggestion was found for this pin.");
        return;
      }
      const street = streetFrom(place.address);
      setPinInfo({ text: place.display_name, street, address: place.address });
      if (street) handlers.current.onStreetSuggestion(street, false);
      else setLookupError("No street name was found near this pin. You can enter the street address manually.");
    } catch {
      if (id === lookupId.current) {
        setPinInfo(null);
        setLookupError("Could not look up an address. The pin is saved; enter the street address manually.");
      }
    } finally {
      if (id === lookupId.current) setLookupBusy(false);
    }
  }, []);

  const commit = useCallback((lat: number, lng: number) => {
    ensureMarker(lat, lng);
    handlers.current.onPin(lat, lng);
    void lookup(lat, lng);
  }, [ensureMarker, lookup]);

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const start = parsePoint(latitude, longitude);
    const map = L.map(container, { center: start ?? PH_CENTER, zoom: start ? 17 : 6, scrollWheelZoom: false });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    map.on("click", (event: L.LeafletMouseEvent) => commit(event.latlng.lat, event.latlng.lng));
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());
    mapRef.current = map;
    if (start) ensureMarker(start[0], start[1]);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in sync when coordinates are typed by hand.
  useEffect(() => {
    const map = mapRef.current;
    if (!point || !map) return;
    const marker = markerRef.current;
    if (marker) {
      const current = marker.getLatLng();
      if (Math.abs(current.lat - point[0]) < 1e-6 && Math.abs(current.lng - point[1]) < 1e-6) return;
    }
    ensureMarker(point[0], point[1]);
    map.setView(point, Math.max(map.getZoom(), 16));
    setPinInfo(null);
    const timer = window.setTimeout(() => void lookup(point[0], point[1]), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);

  // Center on the chosen barangay/city/province until the seller drops a pin.
  useEffect(() => {
    if (!areaQuery) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void geocode<GeoPlace[]>("/search", { q: `${areaQuery}, Philippines`, countrycodes: "ph", limit: "1" })
        .then((found) => {
          if (cancelled || found.length === 0 || markerRef.current) return;
          mapRef.current?.setView([Number(found[0].lat), Number(found[0].lon)], areaZoom);
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setSearchError(error instanceof Error ? error.message : "Could not center the map on that area.");
          }
        });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [areaQuery, areaZoom]);

  async function runSearch() {
    const text = query.trim();
    if (!text) return;
    setSearching(true);
    setSearchError("");
    setResults([]);
    try {
      const params: Record<string, string> = { q: text, countrycodes: "ph", limit: "5", addressdetails: "1" };
      const map = mapRef.current;
      if (map) {
        const bounds = map.getBounds();
        params.viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
      }
      const found = await geocode<GeoPlace[]>("/search", params);
      if (found.length === 0) setSearchError("No matches. Try a nearby landmark, or drop the pin by hand.");
      setResults(found);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed. Drop the pin by hand instead.");
    } finally {
      setSearching(false);
    }
  }

  function pick(place: GeoPlace) {
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    mapRef.current?.setView([lat, lng], 18);
    commit(lat, lng);
    setResults([]);
    setQuery("");
  }

  function locate() {
    if (!window.isSecureContext) {
      onNotice({ kind: "error", text: "Location access requires a secure page. Run the portal on localhost or open its deployed HTTPS URL." });
      return;
    }
    if (!navigator.geolocation) {
      onNotice({ kind: "error", text: "Location is not available in this browser. Drop the pin on the map instead." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = position.coords;
        mapRef.current?.setView([lat, lng], 18);
        commit(lat, lng);
        onNotice({ kind: "success", text: "Pin moved to your current location. Drag it if it's slightly off." });
      },
      (error) => {
        setLocating(false);
        const text = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Allow location access for this site in your browser settings, or drop the pin by hand."
          : error.code === error.POSITION_UNAVAILABLE
          ? "Your device could not determine a location. Turn on location services, or drop the pin by hand."
          : "Finding your location took too long. Try again, or drop the pin by hand.";
        onNotice({ kind: "error", text });
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 },
    );
  }

  return (
    <div className="map-picker">
      <div className="map-picker-head">
        <div>
          <strong>Station location</strong>
          <small>Search for your place, click the map, or drag the pin to your exact spot.</small>
        </div>
        <button className="button button-secondary button-small" type="button" disabled={locating} onClick={locate}>
          <LocateFixed size={15} />{locating ? "Finding…" : "Use my location"}
        </button>
      </div>

      <div className="map-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runSearch();
            }
          }}
          placeholder="Search a landmark, street or building"
          aria-label="Search for a place"
        />
        <button className="button button-primary button-small" type="button" disabled={searching || !query.trim()} onClick={() => void runSearch()}>
          {searching ? <span className="spinner spinner-light" /> : "Search"}
        </button>
      </div>
      {searchError && <p className="map-note map-note-error" role="alert">{searchError}</p>}
      {results.length > 0 && (
        <ul className="map-results" aria-label="Search results">
          {results.map((place) => (
            <li key={`${place.lat},${place.lon},${place.display_name}`}>
              <button type="button" onClick={() => pick(place)}><MapPin size={14} /><span>{place.display_name}</span></button>
            </li>
          ))}
        </ul>
      )}

      <div className="map-canvas-wrap">
        <div className="map-canvas" ref={containerRef} aria-label="Map for placing your station pin" />
        {!placed && <div className="map-hint"><MapPin size={14} /> Click the map to drop your pin</div>}
      </div>

      <div className="map-status" aria-live="polite">
        {placed ? (
          <>
            <span className="map-coords"><MapPin size={14} />{point![0].toFixed(5)}, {point![1].toFixed(5)}</span>
            {lookupBusy ? (
              <span className="map-note"><span className="spinner" /> Finding the address…</span>
            ) : pinInfo ? (
              <span className="map-address">
                <span title={pinInfo.text}>{pinInfo.text}</span>
                {pinInfo.street && (
                  <button className="text-link" type="button" onClick={() => onStreetSuggestion(pinInfo.street, true)}>Use “{pinInfo.street}” as street address</button>
                )}
              </span>
            ) : null}
          </>
        ) : (
          <span className="map-note">No pin yet. Your location is saved from the pin.</span>
        )}
      </div>
      {lookupError && <p className="map-note map-note-error" role="status">{lookupError}</p>}
      {outside && (
        <p className="map-note map-note-warning">This pin looks like it's outside {selectedCity}. Double-check that it's on your station.</p>
      )}
    </div>
  );
}
