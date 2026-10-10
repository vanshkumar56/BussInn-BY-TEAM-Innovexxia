// Distance between two lat/lng points, in meters (haversine)
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Accepts a stop as { latitude, longitude } / { lat, lng } / { lat, lon }
export function getStopCoords(stop) {
  if (!stop) return null;
  const lat = Number(stop.latitude ?? stop.lat);
  const lng = Number(stop.longitude ?? stop.lng ?? stop.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

// GeoJSON circle polygon, used to draw the 1 km gate radius on the map
export function circlePolygon(lng, lat, radiusM, steps = 64) {
  const latDeg = radiusM / 111320;
  const lngDeg = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    coords.push([lng + lngDeg * Math.cos(angle), lat + latDeg * Math.sin(angle)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}