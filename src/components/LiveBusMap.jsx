import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

function getCoordinates(stop) {
  if (!stop) return null;

  const latitude = Number(
    stop.latitude ?? stop.lat ?? stop.stop_lat
  );
  const longitude = Number(
    stop.longitude ?? stop.lng ?? stop.lon ?? stop.stop_lng
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return [latitude, longitude];
}

function getStopName(stop, fallback) {
  if (typeof stop === "string") return stop;

  return (
    stop?.name ??
    stop?.stop_name ??
    stop?.stopName ??
    stop?.station_name ??
    fallback
  );
}

function MapUpdater({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [30, 30] });
    } else if (points.length === 1) {
      map.setView(points[0], 14);
    }
  }, [map, points]);

  return null;
}

function LiveBusMap({
  latitude = 28.6139,
  longitude = 77.209,
  busNumber = "Bus",
  departure = "Route start",
  destination = "Route destination",
  stops = [],
}) {
  const validStops = useMemo(() => {
    if (!Array.isArray(stops)) return [];

    return stops
      .map((stop, index) => ({
        stop,
        index,
        coordinates: getCoordinates(stop),
      }))
      .filter((item) => item.coordinates !== null);
  }, [stops]);

  const liveLocation =
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
      ? [Number(latitude), Number(longitude)]
      : null;

  const routePoints = validStops.map((item) => item.coordinates);
  const mapPoints = [
    ...routePoints,
    ...(liveLocation ? [liveLocation] : []),
  ];
  const center = mapPoints[0] ?? [28.6139, 77.209];

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 4px" }}>Bus Route Map</h3>
        <p style={{ margin: 0, fontSize: 13 }}>
          {busNumber} · {validStops.length} mapped stops
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 13 }}>
          {departure} → {destination}
        </p>
      </div>

      <MapContainer
        center={center}
        zoom={13}
        style={{
          height: 400,
          width: "100%",
          borderRadius: 12,
          zIndex: 0,
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapUpdater points={mapPoints} />

        {routePoints.length > 1 && (
          <Polyline
            positions={routePoints}
            pathOptions={{ color: "#075bea", weight: 5 }}
          />
        )}

        {validStops.map((item, index) => (
          <Marker
            key={`${getStopName(item.stop, `Stop ${item.index + 1}`)}-${item.index}`}
            position={item.coordinates}
          >
            <Popup>
              <strong>
                {index === 0
                  ? "Start"
                  : index === validStops.length - 1
                    ? "Destination"
                    : `Stop ${index + 1}`}
              </strong>
              <br />
              {getStopName(item.stop, `Stop ${item.index + 1}`)}
            </Popup>
          </Marker>
        ))}

        {liveLocation && (
          <Marker position={liveLocation}>
            <Popup>
              <strong>🚌 {busNumber}</strong>
              <br />
              Current driver location
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {validStops.length === 0 && (
        <p style={{ fontSize: 13, marginTop: 10 }}>
          No stops with valid coordinates are available.
          Check that the selected route includes latitude and longitude.
        </p>
      )}
    </div>
  );
}

export default LiveBusMap;
