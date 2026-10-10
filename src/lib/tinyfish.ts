import { createServerFn } from "@tanstack/react-start";

export type BusSearchInput = {
  from: string;
  to: string;
  date: string;
};

export type StopsInput = BusSearchInput & {
  trip_label: string;
  departure_time: string;
};

export type BusStop = {
  stop_order: number;
  station_name: string;
  arrival_time: string;
  departure_time: string;
};

export type UpsrtcBus = {
  name: string;
  operator: string;
  bus_type: string;
  bus_number: string;
  trip_label: string;
  depot: string;
  trip_route: string;
  source: string;
  destination: string;
  departure_time: string;
  arrival_time: string;
  fare: number | null;
  duration: string;
  available_seats: number | null;
  distance_km: number | null;
  booking_url: string;
  source_name: string;
  source_url: string;
  stops: BusStop[];
};

type JsonObject = Record<string, unknown>;

const UPSRTC_BUSTIME_URL = "https://www.onlineupsrtc.co.in/#/bustime";
const BOOKING_URL = "https://www.onlineupsrtc.co.in/";
const RUN_URL = "https://agent.tinyfish.ai/v1/automation/run-async";
const RUNS_URL = "https://agent.tinyfish.ai/v1/runs";

const POLL_MS = 3000;
const MAX_WAIT_MS = 185000;

/* ------------------------------------------------------------------ */
/* Server-only environment                                             */
/* ------------------------------------------------------------------ */

/**
 * Loads the root .env file. This runs only inside server handlers, never at
 * module top level, so the browser bundle never touches `process.cwd`.
 */
async function loadServerEnv(): Promise<void> {
  const { config } = await import("dotenv");
  config();
}

function getApiKey(): string {
  const apiKey = process.env["TINYFISH_API_KEY"];

  if (!apiKey) {
    throw new Error("TINYFISH_API_KEY is missing. Add it to your root .env file.");
  }

  return apiKey;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const key = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function stringValue(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  return String(value).trim() || fallback;
}

function numberValue(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toHHMM(value: unknown): string {
  const match = String(value ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";

  const hours = match[1] ?? "";
  const minutes = match[2] ?? "";
  if (!hours || !minutes) return "";

  return `${hours.padStart(2, "0")}:${minutes}`;
}

function formatDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;

  const year = match[1] ?? "";
  const month = match[2] ?? "";
  const day = match[3] ?? "";
  return `${day}/${month}/${year}`;
}

function validateSearch(input: BusSearchInput) {
  const from = stringValue(input?.from);
  const to = stringValue(input?.to);
  const date = stringValue(input?.date);

  if (!from || !to || !date) {
    throw new Error("Origin, destination, and travel date are required.");
  }

  if (key(from) === key(to)) {
    throw new Error("Origin and destination must be different.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date must use YYYY-MM-DD format.");
  }

  return { from, to, date };
}

function findArray(value: unknown, keys: string[], depth = 0): unknown[] | null {
  if (depth > 6 || value === null || value === undefined) return null;

  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      return findArray(JSON.parse(value), keys, depth + 1);
    } catch {
      return null;
    }
  }

  if (typeof value !== "object") return null;

  const object = value as JsonObject;

  for (const k of keys) {
    const candidate = object[k];
    if (Array.isArray(candidate)) return candidate;
  }

  for (const k of ["result", "output", "data", "content"]) {
    const found = findArray(object[k], keys, depth + 1);
    if (found) return found;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Normalizing TinyFish output                                         */
/* ------------------------------------------------------------------ */

function normalizeStop(value: unknown, index: number): BusStop | null {
  if (!value || typeof value !== "object") return null;

  const stop = value as JsonObject;
  const station = stringValue(
    stop["station_name"] ?? stop["stationName"] ?? stop["station"] ?? stop["name"],
  );

  if (!station) return null;

  return {
    stop_order:
      numberValue(stop["stop_order"] ?? stop["sequence"] ?? stop["sn"]) ?? index + 1,
    station_name: station,
    arrival_time: toHHMM(stop["arrival_time"] ?? stop["arrivalTime"] ?? stop["arrival"]),
    departure_time: toHHMM(
      stop["departure_time"] ?? stop["departureTime"] ?? stop["departure"],
    ),
  };
}

function normalizeBus(value: unknown, from: string, to: string): UpsrtcBus | null {
  if (!value || typeof value !== "object") return null;

  const bus = value as JsonObject;

  const rawStops = Array.isArray(bus["stops"])
    ? (bus["stops"] as unknown[])
    : Array.isArray(bus["route_stops"])
      ? (bus["route_stops"] as unknown[])
      : [];

  const stops = rawStops
    .map((stop, index) => normalizeStop(stop, index))
    .filter((stop): stop is BusStop => stop !== null)
    .sort((a, b) => a.stop_order - b.stop_order);

  const tripLabel = stringValue(bus["trip_label"] ?? bus["tripLabel"]);
  const busType = stringValue(
    bus["bus_type"] ?? bus["busType"] ?? bus["category"],
    "Ordinary",
  );

  return {
    name: stringValue(
      bus["name"] ?? bus["bus_name"] ?? bus["service_name"],
      tripLabel ? `${busType} - ${tripLabel}` : "UPSRTC Bus",
    ),
    operator: stringValue(bus["operator"], "UPSRTC"),
    bus_type: busType,
    bus_number: stringValue(bus["bus_number"] ?? bus["busNumber"]),
    trip_label: tripLabel,
    depot: stringValue(bus["depot"]),
    trip_route: stringValue(bus["trip_route"] ?? bus["tripRoute"]),
    source: stringValue(bus["source"] ?? bus["from"], from),
    destination: stringValue(bus["destination"] ?? bus["to"], to),
    departure_time: toHHMM(
      bus["departure_time"] ?? bus["departureTime"] ?? bus["boarding_time"],
    ),
    arrival_time: toHHMM(bus["arrival_time"] ?? bus["arrivalTime"] ?? bus["eta"]),
    fare: numberValue(bus["fare"] ?? bus["price"]),
    duration: stringValue(bus["duration"] ?? bus["travel_time"]),
    available_seats: numberValue(bus["available_seats"] ?? bus["availableSeats"]),
    distance_km: numberValue(bus["distance_km"] ?? bus["kms"]),
    booking_url: stringValue(bus["booking_url"] ?? bus["bookingUrl"], BOOKING_URL),
    source_name: stringValue(bus["source_name"] ?? bus["sourceName"], "Source not provided"),
    source_url: stringValue(bus["source_url"] ?? bus["sourceUrl"] ?? bus["url"]),
    stops,
  };
}

/**
 * Keeps only the part of a bus route from `from` to `to`.
 * Returns null if the bus does not pass both stops in that order.
 */
function segmentForRoute(bus: UpsrtcBus, from: string, to: string): UpsrtcBus | null {
  const fromIndex = bus.stops.findIndex((s) => key(s.station_name) === key(from));
  if (fromIndex < 0) return null;

  const toIndex = bus.stops.findIndex(
    (s, i) => i > fromIndex && key(s.station_name) === key(to),
  );
  if (toIndex < 0) return null;

  const segment = bus.stops.slice(fromIndex, toIndex + 1);
  if (segment.length < 2) return null;

  const first = segment[0];
  const last = segment[segment.length - 1];
  if (!first || !last) return null;

  return {
    ...bus,
    source: first.station_name,
    destination: last.station_name,
    departure_time: first.departure_time || first.arrival_time || bus.departure_time,
    arrival_time: last.arrival_time || last.departure_time || bus.arrival_time,
    stops: segment,
  };
}

/* ------------------------------------------------------------------ */
/* TinyFish run: start, poll, and cancel on timeout                    */
/* ------------------------------------------------------------------ */

async function runTinyFish(goal: string, outputSchema: JsonObject): Promise<unknown> {
  const apiKey = getApiKey();

  const response = await fetch(RUN_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url: UPSRTC_BUSTIME_URL,
      goal,
      browser_profile: "lite",
      output_schema: outputSchema,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `TinyFish start failed (${response.status}): ${message.slice(0, 300)}`,
    );
  }

  const started = (await response.json()) as JsonObject;
  const runId = stringValue(started["run_id"]);

  if (!runId) throw new Error("TinyFish did not return a run ID.");

  console.info("TinyFish started run:", runId);

  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));

    const poll = await fetch(`${RUNS_URL}/${runId}`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });

    // Temporary server or rate-limit errors: keep polling.
    if (poll.status === 429 || poll.status >= 500) continue;

    if (!poll.ok) {
      throw new Error(`TinyFish polling failed: HTTP ${poll.status}`);
    }

    const run = (await poll.json()) as JsonObject;
    const status = stringValue(run["status"]).toUpperCase();

    if (status === "COMPLETED") {
      if (run["result"] == null) {
        throw new Error("TinyFish completed but returned no result.");
      }
      return run["result"];
    }

    if (status === "FAILED" || status === "CANCELLED") {
      const error = run["error"];
      const message =
        error && typeof error === "object"
          ? [
              stringValue((error as JsonObject)["message"]),
              stringValue((error as JsonObject)["category"]),
            ]
              .filter(Boolean)
              .join(" — ")
          : stringValue(error);

      console.error("TinyFish run", runId, "ended with status", status);
      throw new Error(message || `TinyFish run ${status.toLowerCase()}.`);
    }
  }

  // Our wait limit expired: cancel the run so it stops using credits.
  await fetch(`${RUNS_URL}/${runId}/cancel`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
  }).catch(() => undefined);

  throw new Error(
    `TinyFish exceeded the ${Math.round(MAX_WAIT_MS / 1000)}-second wait limit.`,
  );
}

/* ------------------------------------------------------------------ */
/* Output schemas sent to TinyFish                                     */
/* ------------------------------------------------------------------ */

const BUS_SCHEMA: JsonObject = {
  type: "object",
  properties: {
    buses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          bus_type: { type: "string" },
          trip_label: { type: "string" },
          depot: { type: "string" },
          trip_route: { type: "string" },
          source: { type: "string" },
          destination: { type: "string" },
          departure_time: { type: "string" },
          arrival_time: { type: "string" },
          duration: { type: "string" },
          fare: { type: "number" },
          distance_km: { type: "number" },
          bus_number: { type: "string" },
          source_name: { type: "string" },
          source_url: { type: "string" },
          stops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                stop_order: { type: "integer" },
                station_name: { type: "string" },
                arrival_time: { type: "string" },
                departure_time: { type: "string" },
              },
              required: ["station_name"],
            },
          },
        },
        required: ["trip_label", "stops"],
      },
    },
  },
  required: ["buses"],
};

const STOPS_SCHEMA: JsonObject = {
  type: "object",
  properties: {
    stops: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stop_order: { type: "integer" },
          station_name: { type: "string" },
          arrival_time: { type: "string" },
          departure_time: { type: "string" },
        },
        required: ["station_name"],
      },
    },
  },
  required: ["stops"],
};

/* ------------------------------------------------------------------ */
/* Server functions                                                    */
/* ------------------------------------------------------------------ */

/**
 * 1. If the route was searched recently, return it from Supabase.
 * 2. Otherwise run TinyFish, keep buses that pass both stops in order,
 *    save them to Supabase, and return them.
 */
export const searchUpsrtcBuses = createServerFn({ method: "POST" })
  .inputValidator((input: BusSearchInput) => validateSearch(input))
  .handler(async ({ data }): Promise<{ buses: UpsrtcBus[]; fromCache: boolean }> => {
    await loadServerEnv();
    // Imported after .env is loaded, because the Supabase client reads it.
    const store = await import("./upsrtcStore");

    if (await store.isRouteFresh(data.from, data.to)) {
      const cached = await store.loadBusesFromDb(data.from, data.to);
      return { buses: cached, fromCache: true };
    }

    const goal = `
Search for published UPSRTC (UP Parivahan) bus timetables.

Origin: ${data.from}
Destination: ${data.to}
Journey date: ${formatDate(data.date)}

Use the search form on this page to find services for the origin and destination.
Return every distinct service whose ordered route includes ${data.from} and then ${data.to}.
Services may start before ${data.from} or continue beyond ${data.to}; include them.
For each service return: trip label, bus type, depot, route name, source, destination,
departure time, arrival time, duration, distance in km, fare, and the complete ordered
list of stops with arrival and departure times where shown.

Use only information shown on the page. Never invent stops, times, or fares.
If no service matches, return {"buses": []}.
Do not click "Book Now" and do not submit any personal details.
`;

    const result = await runTinyFish(goal, BUS_SCHEMA);
    const rawBuses = findArray(result, ["buses", "results", "items"]);

    if (!rawBuses) {
      throw new Error("TinyFish returned no readable bus list.");
    }

    const buses = rawBuses
      .map((bus) => normalizeBus(bus, data.from, data.to))
      .filter((bus): bus is UpsrtcBus => bus !== null)
      .map((bus) => segmentForRoute(bus, data.from, data.to))
      .filter((bus): bus is UpsrtcBus => bus !== null);

    console.info("TinyFish buses matching route:", buses.length);

    await store.saveBuses(buses, data.from, data.to);

    return { buses, fromCache: false };
  });

/**
 * Runs when a passenger opens "Route" for one bus. Stops are saved so the
 * next request for this bus is instant.
 */
export const getUpsrtcStops = createServerFn({ method: "POST" })
  .inputValidator((input: StopsInput) => {
    const search = validateSearch(input);
    const trip_label = stringValue(input?.trip_label);
    const departure_time = toHHMM(input?.departure_time);

    if (!trip_label && !departure_time) {
      throw new Error("A trip label or departure time is required.");
    }

    return { ...search, trip_label, departure_time };
  })
  .handler(async ({ data }): Promise<{ stops: BusStop[] }> => {
    await loadServerEnv();

    const goal = `
Search the UPSRTC website for ${data.from} to ${data.to} on ${formatDate(data.date)}.

Find the service with:
Trip label: ${data.trip_label || "not provided"}
Departure time: ${data.departure_time || "not provided"}

Open its route/schedule details. Return every stop in the displayed order with
station name, arrival time, and departure time.
Never guess missing stops or times. If the schedule cannot be found, return an empty list.
Do not click "Book Now".
`;

    const result = await runTinyFish(goal, STOPS_SCHEMA);
    const rawStops = findArray(result, ["stops", "schedule", "rows"]);

    if (!rawStops) {
      throw new Error("TinyFish returned no readable stop list.");
    }

    const stops = rawStops
      .map((stop, index) => normalizeStop(stop, index))
      .filter((stop): stop is BusStop => stop !== null)
      .sort((a, b) => a.stop_order - b.stop_order);

    if (stops.length > 0 && data.trip_label) {
      const store = await import("./upsrtcStore");
      await store.saveStopsForTrip(data.trip_label, stops);
    }

    return { stops };
  });