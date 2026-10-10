import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../../lib/supabase";

setWorkerUrl(workerUrl);

const BUS_MARKER_IMAGE =
  "https://i.pinimg.com/1200x/ff/03/23/ff0323b987a2a4c75d944828ec112de7.jpg";

function readCoordinates(stop) {
  const latitude = Number(stop?.latitude ?? stop?.lat);
  const longitude = Number(stop?.longitude ?? stop?.lng ?? stop?.lon);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? [longitude, latitude]
    : null;
}

async function findStopCoordinates(stop) {
  const direct = readCoordinates(stop);
  if (direct) return direct;
  const name = String(stop?.station_name || stop?.name || "").trim();
  if (!name) return null;
  const cacheKey = `bussinn-stop:${name.toUpperCase()}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* storage unavailable */ }

  for (const query of [`${name} bus stand`, `${name} bus station`, name]) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`
      );
      if (!response.ok) continue;
      const results = await response.json();
      if (results?.[0]) {
        const coords = [Number(results[0].lon), Number(results[0].lat)];
        if (coords.every(Number.isFinite)) {
          try { localStorage.setItem(cacheKey, JSON.stringify(coords)); } catch { /* ignore */ }
          return coords;
        }
      }
    } catch (error) {
      console.warn("Stop lookup failed:", error);
    }
  }
  return null;
}

function makeBusElement() {
  const element = document.createElement("div");
  element.style.cssText =
    "width:44px;height:58px;display:grid;place-items:center;background:transparent;";

  element.innerHTML = `
    <svg
      width="38"
      height="54"
      viewBox="0 0 38 54"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Bus"
    >
      <g stroke="#102a43" stroke-width="2.5" stroke-linejoin="round">
        <rect x="9" y="3" width="20" height="48" rx="7" fill="#1683e8" />
        <rect x="13" y="10" width="12" height="10" rx="2" fill="#dff3ff" />
        <rect x="13" y="24" width="12" height="10" rx="2" fill="#dff3ff" />
        <rect x="13" y="39" width="12" height="6" rx="2" fill="#dff3ff" />
        <path d="M9 15H6v7h3M29 15h3v7h-3M9 34H6v7h3M29 34h3v7h-3" fill="#102a43" />
      </g>
    </svg>
  `;

  return element;
}

function makeStopElement(index) {
  const element = document.createElement("div");
  element.style.cssText = "width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#dc2626;color:#fff;border:3px solid white;box-shadow:0 3px 12px #0003;font-weight:800;font-size:11px;box-sizing:border-box";
  element.textContent = String(index + 1);
  return element;
}

export default function BusTrackingMap({ busId, scheduleStops = [], className = "" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const busMarkerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [origin, setOrigin] = useState(null);
  const [live, setLive] = useState(null);
  const [mapError, setMapError] = useState("");

  const stops = useMemo(() => [...scheduleStops].sort((a, b) =>
    Number(a.stop_order ?? 0) - Number(b.stop_order ?? 0)
  ), [scheduleStops]);

  // Always anchor the parked bus at the first database stop on the full timetable.
  useEffect(() => {
    if (!busId) return undefined;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("bus_schedule")
        .select("id,bus_id,stop_order,station_name,latitude,longitude")
        .eq("bus_id", busId)
        .order("stop_order", { ascending: true })
        .limit(1);
      if (cancelled) return;
      const firstStop = !error && data?.[0] ? data[0] : stops[0];
      if (firstStop) setOrigin(await findStopCoordinates(firstStop));
    })();
    return () => { cancelled = true; };
  }, [busId, stops]);

    useEffect(() => {
    let mounted = true;
    setLive(null);

    if (!busId) return () => {
      mounted = false;
    };

    const isDemoBus = String(busId) === "demo-bus";
    const table = isDemoBus ? "demo_live_tracking" : "live_locations";
    const idColumn = isDemoBus ? "id" : "bus_id";
    const idValue = isDemoBus ? 1 : busId;

    const normalizeLive = (row) => {
      const latitude = Number(row?.latitude ?? row?.lat);
      const longitude = Number(row?.longitude ?? row?.lng ?? row?.lon);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      return [longitude, latitude];
    };

    const loadLocation = async () => {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq(idColumn, idValue)
        .maybeSingle();

      if (!error && mounted) {
        setLive(normalizeLive(data));
      }
    };

    loadLocation();

    const channel = supabase
      .channel(`passenger-map-${table}-${idValue}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${idColumn}=eq.${idValue}`,
        },
        (payload) => {
          if (!mounted || payload.eventType === "DELETE") return;

          const position = normalizeLive(payload.new);
          if (position) setLive(position);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [busId]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let disposed = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [78.0, 25.0], zoom: 5, attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("load", () => {
      if (disposed) return;
     
      setMapReady(true);
      setMapError("");
      setTimeout(() => { if (!disposed) map.resize(); }, 100);
    });
    map.on("error", (event) => {
      if (!map.isStyleLoaded() && !disposed) setMapError("Map could not load. Check your internet connection.");
      console.error("Map error:", event.error || event);
    });
    return () => { disposed = true; map.remove(); mapRef.current = null; busMarkerRef.current = null; setMapReady(false); };
  }, []);

    useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    let cancelled = false;
    const markers = [];

    (async () => {
      for (const [index, stop] of stops.entries()) {
        const coordinates = await findStopCoordinates(stop);
        if (cancelled) return;
        if (!coordinates) continue;

        const marker = new maplibregl.Marker({
          element: makeStopElement(index),
        })
          .setLngLat(coordinates)
          .setPopup(
            new maplibregl.Popup({ offset: 16 }).setText(
              stop.station_name || stop.name || `Stop ${index + 1}`
            )
          )
          .addTo(map);

        markers.push(marker);
      }
    })();

    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.remove());
    };
  }, [mapReady, stops]);

  useEffect(() => {
    const map = mapRef.current;
    const position = live || origin;
    if (!map || !mapReady || !position) return;
    if (!busMarkerRef.current) {
      busMarkerRef.current = new maplibregl.Marker({ element: makeBusElement(), anchor: "center" }).setLngLat(position).addTo(map);
    } else {
      busMarkerRef.current.setLngLat(position);
    }
    if (live) map.easeTo({ center: position, zoom: 16, duration: 450 });
    else map.jumpTo({ center: position, zoom: 16 });
  }, [mapReady, live, origin]);

  return (
    <section className={`passenger-live-map ${className}`} aria-label="Live bus map">
      <div ref={containerRef} className="passenger-live-map-canvas" />
      {!mapReady && !mapError && <div className="passenger-live-map-message">Loading map…</div>}
      {mapError && <div className="passenger-live-map-message">{mapError}</div>}
      {mapReady && !live && <div className="passenger-live-map-status">Bus shown at its first bus stand</div>}
    </section>
  );
}
