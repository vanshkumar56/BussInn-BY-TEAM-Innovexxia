import { createClient } from "@supabase/supabase-js";
import type { BusStop, UpsrtcBus } from "./tinyfish";

const FRESH_HOURS_WITH_BUSES = 24;
const FRESH_HOURS_EMPTY = 1;
const BOOKING_URL = "https://www.onlineupsrtc.co.in/";

/**
 * Creates the Supabase client when it is needed, not when the file loads.
 * By then the root .env has been read by the server handler.
 */
function getAdmin() {
  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. Check the root .env file (no VITE_ prefix).",
    );
  }

  return createClient(url, serviceKey);
}

const key = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export const routeKey = (from: string, to: string) =>
  `${key(from)}:${key(to)}`;

/* ------------------------------------------------------------------ */
/* Freshness                                                           */
/* ------------------------------------------------------------------ */

/**
 * True if this route was searched recently enough to serve from the database.
 * Routes with buses are trusted for 24 hours; empty results for 1 hour.
 */
export async function isRouteFresh(from: string, to: string): Promise<boolean> {
  const admin = getAdmin();

  const { data, error } = await admin
    .from("upsrtc_searches")
    .select("last_run_at, bus_count")
    .eq("route_key", routeKey(from, to))
    .maybeSingle();

  if (error || !data) return false;

  const maxAgeHours =
    Number(data.bus_count) > 0 ? FRESH_HOURS_WITH_BUSES : FRESH_HOURS_EMPTY;

  const ageMs = Date.now() - new Date(data.last_run_at).getTime();
  return ageMs < maxAgeHours * 3600_000;
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

/** Replaces all stops of one bus with the latest copy. */
async function replaceStops(busId: string, stops: BusStop[]) {
  const admin = getAdmin();

  const { error: deleteError } = await admin
    .from("upsrtc_bus_stops")
    .delete()
    .eq("bus_id", busId);

  if (deleteError) {
    console.error("Deleting old stops failed:", deleteError);
    return;
  }

  if (stops.length === 0) return;

  const { error } = await admin.from("upsrtc_bus_stops").insert(
    stops.map((stop) => ({
      bus_id: busId,
      stop_order: stop.stop_order,
      station_key: key(stop.station_name),
      station_name: stop.station_name,
      arrival_time: stop.arrival_time,
      departure_time: stop.departure_time,
    })),
  );

  if (error) console.error("Inserting stops failed:", error);
}

/**
 * Saves the buses found by a TinyFish search, then records that the route
 * was searched so the next request can be served from the database.
 */
export async function saveBuses(
  buses: UpsrtcBus[],
  from: string,
  to: string,
) {
  const admin = getAdmin();

  for (const bus of buses) {
    if (!bus.trip_label) continue;

    const { data: row, error } = await admin
      .from("upsrtc_buses")
      .upsert(
        {
          trip_label: bus.trip_label,
          name: bus.name,
          operator: bus.operator,
          bus_type: bus.bus_type,
          bus_number: bus.bus_number,
          depot: bus.depot,
          trip_route: bus.trip_route,
          source: bus.source,
          destination: bus.destination,
          departure_time: bus.departure_time,
          arrival_time: bus.arrival_time,
          duration: bus.duration,
          fare: bus.fare,
          distance_km: bus.distance_km,
          source_name: bus.source_name,
          source_url: bus.source_url,
          booking_url: bus.booking_url || BOOKING_URL,
          last_scraped_at: new Date().toISOString(),
        },
        { onConflict: "trip_label" },
      )
      .select("id")
      .single();

    if (error || !row) {
      console.error("Saving bus failed:", error);
      continue;
    }

    await replaceStops(String(row.id), bus.stops);
  }

  const { error } = await admin.from("upsrtc_searches").upsert(
    {
      route_key: routeKey(from, to),
      last_run_at: new Date().toISOString(),
      bus_count: buses.length,
    },
    { onConflict: "route_key" },
  );

  if (error) console.error("Saving search record failed:", error);
}

/** Saves the stops fetched when a passenger opens "Route" for one bus. */
export async function saveStopsForTrip(tripLabel: string, stops: BusStop[]) {
  if (!tripLabel || stops.length === 0) return;

  const admin = getAdmin();

  const { data: bus, error } = await admin
    .from("upsrtc_buses")
    .select("id")
    .eq("trip_label", tripLabel)
    .maybeSingle();

  if (error || !bus) return;

  await replaceStops(String(bus.id), stops);
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

/**
 * Returns every saved bus that passes `from` and then `to` in order,
 * with only the stops between them.
 */
export async function loadBusesFromDb(
  from: string,
  to: string,
): Promise<UpsrtcBus[]> {
  const admin = getAdmin();
  const fromKey = key(from);
  const toKey = key(to);

  // 1. Find the stop rows for either station.
  const { data: hits, error: hitsError } = await admin
    .from("upsrtc_bus_stops")
    .select("bus_id, stop_order, station_key")
    .in("station_key", [fromKey, toKey]);

  if (hitsError) throw hitsError;

  // 2. For each bus, note the earliest "from" stop and the latest "to" stop.
  const positions = new Map<string, { from?: number; to?: number }>();

  for (const hit of hits ?? []) {
    const busId = String(hit.bus_id);
    const entry = positions.get(busId) ?? {};
    const order = Number(hit.stop_order);

    if (hit.station_key === fromKey) {
      entry.from = entry.from === undefined ? order : Math.min(entry.from, order);
    }

    if (hit.station_key === toKey) {
      entry.to = entry.to === undefined ? order : Math.max(entry.to, order);
    }

    positions.set(busId, entry);
  }

  // 3. Keep only buses where "from" comes before "to".
  const validIds: string[] = [];
  for (const [busId, pos] of positions) {
    if (pos.from !== undefined && pos.to !== undefined && pos.from < pos.to) {
      validIds.push(busId);
    }
  }

  if (validIds.length === 0) return [];

  // 4. Load the bus rows and their stops.
  const [busResult, stopResult] = await Promise.all([
    admin.from("upsrtc_buses").select("*").in("id", validIds),
    admin
      .from("upsrtc_bus_stops")
      .select("bus_id, stop_order, station_name, arrival_time, departure_time")
      .in("bus_id", validIds)
      .order("stop_order", { ascending: true }),
  ]);

  if (busResult.error) throw busResult.error;
  if (stopResult.error) throw stopResult.error;

  const stopsByBus = new Map<string, BusStop[]>();

  for (const stop of stopResult.data ?? []) {
    const busId = String(stop.bus_id);
    const list = stopsByBus.get(busId) ?? [];

    list.push({
      stop_order: Number(stop.stop_order),
      station_name: String(stop.station_name),
      arrival_time: String(stop.arrival_time ?? ""),
      departure_time: String(stop.departure_time ?? ""),
    });

    stopsByBus.set(busId, list);
  }

  // 5. Build the bus objects, limited to the requested segment.
  const buses: UpsrtcBus[] = [];

  for (const row of busResult.data ?? []) {
    const busId = String(row.id);
    const pos = positions.get(busId);
    if (!pos) continue;

    const fromOrder = pos.from;
    const toOrder = pos.to;
    if (fromOrder === undefined || toOrder === undefined) continue;

    const segment = (stopsByBus.get(busId) ?? []).filter(
      (stop) => stop.stop_order >= fromOrder && stop.stop_order <= toOrder,
    );

    if (segment.length < 2) continue;

    const first = segment[0];
    const last = segment[segment.length - 1];
    if (!first || !last) continue;

    buses.push({
      name: String(row.name ?? "UPSRTC Bus"),
      operator: String(row.operator ?? "UPSRTC"),
      bus_type: String(row.bus_type ?? "Ordinary"),
      bus_number: String(row.bus_number ?? ""),
      trip_label: String(row.trip_label ?? ""),
      depot: String(row.depot ?? ""),
      trip_route: String(row.trip_route ?? ""),
      source: first.station_name,
      destination: last.station_name,
      departure_time: first.departure_time || first.arrival_time,
      arrival_time: last.arrival_time || last.departure_time,
      fare: row.fare == null ? null : Number(row.fare),
      duration: String(row.duration ?? ""),
      available_seats: null,
      distance_km: row.distance_km == null ? null : Number(row.distance_km),
      booking_url: String(row.booking_url ?? BOOKING_URL),
      source_name: String(row.source_name ?? "Source not provided"),
      source_url: String(row.source_url ?? ""),
      stops: segment,
    });
  }

  return buses;
}