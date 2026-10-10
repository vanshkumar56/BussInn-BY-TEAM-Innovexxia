// Known bus stands, keyed by a normalized name (lowercase, letters only)
export const BUS_STANDS = {
  anandvihar: {
    name: "Anand Vihar ISBT",
    latitude: 28.6469,
    longitude: 77.3159,
  },
  hamirpur: {
    name: "Hamirpur Bus Stand",
    latitude: 25.9566,
    longitude: 80.152,
  },
};

// Per-route gate rules. Key = "departure|destination" normalized.
// start: require the driver to be near the start stand before starting.
// end: require the driver to be near the destination to end the trip.
// maxAccuracyM: the worst GPS accuracy (meters) accepted for this route.
export const ROUTE_GATES = {
  "anandvihar|hamirpur": {
    start: false, // Start Trip button is always enabled for this route
    end: false,
    maxAccuracyM: 100,
  },
};

export const DEFAULT_GATES = {
  start: true,
  end: true,
  maxAccuracyM: 50,
};

export const normalizeStopName = (name = "") =>
  String(name).toLowerCase().replace(/[^a-z]/g, "");

// Matches by prefix so "Anand Vihar ISBT" and "Hamirpur Bus Stand"
// still match the "anandvihar|hamirpur" rule.
export const getRouteGates = (departure, destination) => {
  const from = normalizeStopName(departure);
  const to = normalizeStopName(destination);

  const match = Object.entries(ROUTE_GATES).find(([key]) => {
    const [routeFrom, routeTo] = key.split("|");
    return from.startsWith(routeFrom) && to.startsWith(routeTo);
  });

  return match ? match[1] : DEFAULT_GATES;
};

// Resolve the start stand: explicit coordinates first, then the name lookup
export const resolveStartStop = (routeDetails) => {
  const explicit =
    routeDetails.selectedBus?.stops?.[0] ?? routeDetails.startStop;
  if (explicit?.latitude != null && explicit?.longitude != null) return explicit;

  const key = normalizeStopName(routeDetails.departure);
  const standKey = Object.keys(BUS_STANDS).find((k) => key.startsWith(k));
  return standKey ? BUS_STANDS[standKey] : null;
};