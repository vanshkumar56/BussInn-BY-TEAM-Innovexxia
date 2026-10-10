import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

function getCoordinates(stop) {
  if (!stop) return null;

  const lat = Number(
    stop.latitude ?? stop.lat ?? stop.coordinates?.[1] ?? stop.location?.lat
  );
  const lng = Number(
    stop.longitude ?? stop.lng ?? stop.lon ?? stop.coordinates?.[0] ?? stop.location?.lng
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

export default function DriverRouteMap({ startStop, driverPosition }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const start = getCoordinates(startStop);

  useEffect(() => {
    if (!containerRef.current || !start || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      // Public demo style for development. Choose a production tile/style provider before deployment.
      style: "https://demotiles.maplibre.org/style.json",
      center: [start.lng, start.lat],
      zoom: 15,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const busElement = document.createElement("div");
    busElement.className = "driver-bus-marker";
    busElement.textContent = "🚌";
    busElement.setAttribute("aria-label", "Bus location");

    markerRef.current = new maplibregl.Marker({
      element: busElement,
      anchor: "bottom",
    })
      .setLngLat([start.lng, start.lat])
      .addTo(map);

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [start?.lat, start?.lng]);

  useEffect(() => {
    if (!driverPosition || !markerRef.current || !mapRef.current) return;

    const lat = Number(driverPosition.latitude ?? driverPosition.lat);
    const lng = Number(driverPosition.longitude ?? driverPosition.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    markerRef.current.setLngLat([lng, lat]);
    mapRef.current.easeTo({ center: [lng, lat], duration: 500 });
  }, [driverPosition]);

  if (!start) {
    return (
      <div className="map-missing-stop">
        The selected bus’s first stop needs valid latitude and longitude.
      </div>
    );
  }

  return <div ref={containerRef} className="driver-route-map" />;
}