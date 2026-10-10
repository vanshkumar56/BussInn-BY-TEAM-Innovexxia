import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  BusFront,
  CalendarDays,
  ExternalLink,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  X,
} from "lucide-react";

import PassengerBottomNav from "../../components/PassengerBottomNav";
import { supabase } from "../../lib/supabase";
import { getUpsrtcStops, searchUpsrtcBuses } from "../../lib/tinyfish";
import "../../styles/LiveBusResults.css";

const AC_IMAGE =
  "https://www.onlineupsrtc.co.in/assets/icons/bus_ac_janrath_2x2.png";

const ORDINARY_IMAGE =
  "https://www.onlineupsrtc.co.in/assets/icons/Ordinary.png";

const UPSRTC_HOME = "https://www.onlineupsrtc.co.in/#/home";

// How long a TinyFish answer is reused before we pay for a new run.
const SEARCH_TTL = 60 * 60 * 1000; // bus list: 1 hour
const EMPTY_SEARCH_TTL = 10 * 60 * 1000; // "no buses": 10 minutes
const STOPS_TTL = 7 * 24 * 60 * 60 * 1000; // stop list of a trip: 7 days

const DEMO_STOPS = [
  { stop_order: 1, station_name: "Stop S" },
  { stop_order: 2, station_name: "Stop A" },
  { stop_order: 3, station_name: "Stop B" },
  { stop_order: 4, station_name: "Stop C" },
];

const normalize = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

/* ------------------------------------------------------------------ */
/* Cache: memory (dedupe) -> this browser -> Supabase (shared)         */
/* ------------------------------------------------------------------ */

const inflight = new Map();
let warnedAboutCacheTable = false;

function writeLocal(key, payload, expiresAt) {
  try {
    localStorage.setItem(key, JSON.stringify({ payload, expiresAt }));
  } catch {
    /* storage full or unavailable */
  }
}

async function readCache(key) {
  try {
    const text = localStorage.getItem(key);

    if (text) {
      const cached = JSON.parse(text);

      if (cached.expiresAt > Date.now()) return cached.payload;

      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }

  try {
    const { data, error } = await supabase
      .from("bus_search_cache")
      .select("payload, expires_at")
      .eq("cache_key", key)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const expiresAt = new Date(data.expires_at).getTime();

      if (expiresAt > Date.now()) {
        writeLocal(key, data.payload, expiresAt);
        return data.payload;
      }
    }
  } catch (error) {
    if (!warnedAboutCacheTable) {
      warnedAboutCacheTable = true;
      console.warn(
        "Shared cache (bus_search_cache table) is unavailable:",
        error,
      );
    }
  }

  return null;
}

async function writeCache(key, payload, ttl) {
  const expiresAt = Date.now() + ttl;

  writeLocal(key, payload, expiresAt);

  try {
    const { error } = await supabase.from("bus_search_cache").upsert(
      {
        cache_key: key,
        payload,
        expires_at: new Date(expiresAt).toISOString(),
      },
      { onConflict: "cache_key" },
    );

    if (error) throw error;
  } catch (error) {
    if (!warnedAboutCacheTable) {
      warnedAboutCacheTable = true;
      console.warn("Could not save to the shared cache:", error);
    }
  }
}

// Same key at the same time (React StrictMode, double clicks) = ONE TinyFish run.
function cachedFetch(key, ttl, fetcher) {
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    const cached = await readCache(key);

    if (cached) return cached;

    const fresh = await fetcher();

    await writeCache(key, fresh, typeof ttl === "function" ? ttl(fresh) : ttl);

    return fresh;
  })().finally(() => inflight.delete(key));

  inflight.set(key, promise);

  return promise;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function formatTime(value) {
  if (!value) return "Not available";

  const match = String(value).match(/(\d{1,2}):(\d{2})/);

  if (!match) return String(value);

  const hour = Number(match[1]);

  if (hour > 23) return String(value);

  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

function formatDate(value) {
  if (!value) return "";

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function busImage(bus) {
  const type = normalize(
    bus.bus_type || bus.busType || bus.category || "",
  );

  return type.includes("ac") &&
    !type.includes("non-ac") &&
    !type.includes("non ac")
    ? AC_IMAGE
    : ORDINARY_IMAGE;
}

function getStops(bus) {
  return [...(bus?.bus_schedule || bus?.stops || [])].sort(
    (a, b) => Number(a.stop_order || 0) - Number(b.stop_order || 0),
  );
}

function routeStops(bus, from, to) {
  const stops = getStops(bus);

  if (!stops.length) {
    return [
      {
        stop_order: 1,
        station_name: bus.source || from,
        departure_time: bus.departure_time,
      },
      {
        stop_order: 2,
        station_name: bus.destination || to,
        arrival_time: bus.arrival_time,
      },
    ];
  }

  const start = stops.findIndex(
    (stop) => normalize(stop.station_name) === normalize(from),
  );

  const end = stops.findIndex(
    (stop) => normalize(stop.station_name) === normalize(to),
  );

  if (start >= 0 && end > start) {
    return stops.slice(start, end + 1);
  }

  return stops;
}

function SkeletonCard() {
  return (
    <article className="lbr-skeleton-card" aria-hidden="true">
      <div className="lbr-skeleton-card-header">
        <div className="lbr-skeleton-title">
          <span className="lbr-skeleton skeleton-line" />
          <span className="lbr-skeleton skeleton-short" />
        </div>
        <span className="lbr-skeleton skeleton-bus-icon" />
      </div>

      <div className="lbr-skeleton-route">
        <div className="lbr-skeleton-station">
          <span className="lbr-skeleton skeleton-short" />
          <span className="lbr-skeleton skeleton-line" />
          <span className="lbr-skeleton skeleton-time" />
        </div>

        <span className="lbr-skeleton skeleton-route-line" />

        <div className="lbr-skeleton-station right">
          <span className="lbr-skeleton skeleton-short" />
          <span className="lbr-skeleton skeleton-line" />
          <span className="lbr-skeleton skeleton-time" />
        </div>
      </div>

      <div className="lbr-skeleton-footer">
        <span className="lbr-skeleton skeleton-short" />
        <span className="lbr-skeleton skeleton-short" />
        <span className="lbr-skeleton skeleton-button" />
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LiveBusResults() {
  const search = useSearch({ strict: false });

  const from = search?.from || search?.source || "";
  const to = search?.to || search?.destination || "";
  const date = search?.date || "";

  const [savedBuses, setSavedBuses] = useState([]);
  const [liveLocations, setLiveLocations] = useState({});
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");

  const [websiteBuses, setWebsiteBuses] = useState([]);
  const [websiteLoading, setWebsiteLoading] = useState(false);
  const [websiteError, setWebsiteError] = useState("");
  const [retry, setRetry] = useState(0);

  const [selectedRoute, setSelectedRoute] = useState(null);
  const [stopsLoadingId, setStopsLoadingId] = useState(null);
  const [stopsError, setStopsError] = useState("");

  // Load schedules already stored in Supabase.
  useEffect(() => {
    let active = true;

    async function loadSavedBuses() {
      setDatabaseLoading(true);
      setDatabaseError("");

      try {
        const { data, error } = await supabase
          .from("buses")
          .select("*, bus_schedule(*)")
          .eq("is_active", true);

        if (error) throw error;

        if (active) {
          setSavedBuses(
            (data || []).map((bus) => ({
              ...bus,
              bus_schedule: getStops(bus),
            })),
          );
        }
      } catch (error) {
        console.error("Supabase bus loading error:", error);

        if (active) {
          setDatabaseError("Could not load saved bus schedules.");
        }
      } finally {
        if (active) setDatabaseLoading(false);
      }
    }

    loadSavedBuses();

    return () => {
      active = false;
    };
  }, []);

  // Subscribe to GPS updates for saved buses.
  useEffect(() => {
    let active = true;

    async function loadLocations() {
      const { data, error } = await supabase
        .from("live_locations")
        .select("*");

      if (error) {
        console.warn("Live locations could not be loaded:", error);
        return;
      }

      if (!active) return;

      const next = {};

      (data || []).forEach((location) => {
        if (location.bus_id) {
          next[location.bus_id] = location;
        }
      });

      setLiveLocations(next);
    }

    loadLocations();

    const channel = supabase
      .channel("bussinn-live-bus-results")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_locations",
        },
        (event) => {
          const location = event.new;

          if (!location?.bus_id) return;

          setLiveLocations((previous) => ({
            ...previous,
            [location.bus_id]: location,
          }));
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Bus list from the UPSRTC website via TinyFish (cache first).
  useEffect(() => {
    let active = true;

    if (!from.trim() || !to.trim() || !date) {
      setWebsiteBuses([]);
      setWebsiteError("");
      setWebsiteLoading(false);
      return undefined;
    }

    const key = [
      "search",
      "v3",
      normalize(from),
      normalize(to),
      date,
    ].join(":");

    setWebsiteLoading(true);
    setWebsiteError("");
    setWebsiteBuses([]);

    cachedFetch(
      key,
      (buses) => (buses.length ? SEARCH_TTL : EMPTY_SEARCH_TTL),
      async () => {
        const result = await searchUpsrtcBuses({
          data: { from: from.trim(), to: to.trim(), date },
        });

        if (!Array.isArray(result?.buses)) {
          throw new Error("TinyFish did not return a valid bus list.");
        }

        return result.buses;
      },
    )
      .then((buses) => {
        if (!active) return;

        setWebsiteBuses(
          buses.map((bus, index) => ({
            ...bus,
            id: `upsrtc-${bus.trip_label || "bus"}-${index}`,
            name: bus.name || "UPSRTC Bus",
            operator: bus.operator || "UPSRTC",
            source: bus.source || from,
            destination: bus.destination || to,
            bus_type: bus.bus_type || "Ordinary",
            bus_schedule: bus.stops || [],
            isWebsiteResult: true,
          })),
        );
      })
      .catch((error) => {
        console.error("UPSRTC search error:", error);

        if (active) {
          setWebsiteError(
            error instanceof Error
              ? error.message
              : "Could not search the UPSRTC website.",
          );
        }
      })
      .finally(() => {
        if (active) setWebsiteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [from, to, date, retry]);

  const matchingSavedBuses = useMemo(() => {
    if (!normalize(from) || !normalize(to)) return [];

    return savedBuses.filter((bus) => {
      const stops = getStops(bus);

      if (stops.length) {
        const start = stops.findIndex(
          (stop) => normalize(stop.station_name) === normalize(from),
        );

        const end = stops.findIndex(
          (stop) => normalize(stop.station_name) === normalize(to),
        );

        return start >= 0 && end > start;
      }

      return (
        normalize(bus.source) === normalize(from) &&
        normalize(bus.destination) === normalize(to)
      );
    });
  }, [savedBuses, from, to]);

  const demoBus = {
    id: "demo-bus",
    name: "BussInn Demo Bus",
    demo: true,
    bus_schedule: DEMO_STOPS,
  };

  // The modal always shows the latest copy (stops arrive after it opens).
  const activeRoute = selectedRoute?.isWebsiteResult
    ? websiteBuses.find((bus) => bus.id === selectedRoute.id) || selectedRoute
    : selectedRoute;

  function stopsFor(bus) {
    if (bus.demo) return DEMO_STOPS;
    if (bus.isWebsiteResult) {
      return bus.bus_schedule?.length
        ? bus.bus_schedule
        : routeStops(bus, from, to);
    }
    return routeStops(bus, from, to);
  }

  // Stops are fetched only when the passenger opens "Route" for one bus.
  async function loadStops(bus) {
    if (!bus?.isWebsiteResult || bus.bus_schedule?.length) return;

    setStopsLoadingId(bus.id);
    setStopsError("");

    const key = bus.trip_label
      ? ["stops", "v1", normalize(bus.trip_label)].join(":")
      : [
          "stops",
          "v1",
          normalize(bus.name),
          bus.departure_time || "",
          normalize(from),
          normalize(to),
        ].join(":");

    try {
      const stops = await cachedFetch(key, STOPS_TTL, async () => {
    const result = await getUpsrtcStops({
  data: {
    from: from.trim(),
    to: to.trim(),
    date,
    trip_label: bus.trip_label || "",
    departure_time: bus.departure_time || "",
    schedule_id: bus.schedule_id || "",
  },
});

        if (!Array.isArray(result?.stops) || result.stops.length === 0) {
          throw new Error("No stops were returned for this bus.");
        }

        return result.stops;
      });

      setWebsiteBuses((previous) =>
        previous.map((item) =>
          item.id === bus.id ? { ...item, bus_schedule: stops } : item,
        ),
      );
    } catch (error) {
      console.error("UPSRTC stops error:", error);

      setStopsError(
        error instanceof Error
          ? error.message
          : "Could not load the stops for this bus.",
      );
    } finally {
      setStopsLoadingId(null);
    }
  }

  function openRoute(bus) {
    setSelectedRoute(bus);
    setStopsError("");

    if (bus.isWebsiteResult) loadStops(bus);
  }

  function closeRoute() {
    setSelectedRoute(null);
    setStopsError("");
  }

  const stopsPending =
    Boolean(activeRoute?.isWebsiteResult) &&
    !activeRoute.bus_schedule?.length;

  const stopsAreLoading =
    stopsPending && stopsLoadingId === activeRoute?.id;

  return (
    <div className="lbr-page">
      <header className="lbr-header">
        <div>
          <h1>Live Buses</h1>
          <p>
            {from || "Boarding point"} → {to || "Destination"}
          </p>
        </div>

        <div className="lbr-live-pill">
          <span />
          LIVE
        </div>
      </header>

      <section className="lbr-search-summary">
        <div className="lbr-search-route">
          <div className="lbr-place">
            <span className="lbr-place-dot blue" />
            <div>
              <small>FROM</small>
              <strong>{from || "Not selected"}</strong>
            </div>
          </div>

          <div className="lbr-route-arrow">→</div>

          <div className="lbr-place">
            <span className="lbr-place-dot red" />
            <div>
              <small>TO</small>
              <strong>{to || "Not selected"}</strong>
            </div>
          </div>
        </div>

        {date && (
          <div className="lbr-date">
            <CalendarDays size={14} />
            {formatDate(date)}
          </div>
        )}
      </section>

      {websiteLoading && (
        <section className="lbr-skeleton-list" aria-live="polite">
          <div className="lbr-skeleton-heading">
            <h2>Searching UPSRTC buses...</h2>
            <p>
              Checking the official booking website. A new route can take
              up to a minute or two.
            </p>
          </div>

          {[1, 2, 3].map((item) => (
            <SkeletonCard key={item} />
          ))}
        </section>
      )}

      {websiteError && (
        <div className="lbr-error" role="alert">
          <p>{websiteError}</p>
          <button
            type="button"
            className="lbr-route-button"
            disabled={websiteLoading}
            onClick={() => setRetry((value) => value + 1)}
          >
            <RefreshCw size={16} />
            Retry search
          </button>
        </div>
      )}

      {databaseError && (
        <div className="lbr-error">
          <p>{databaseError}</p>
        </div>
      )}

      {!websiteLoading && (
        <section className="lbr-results-heading">
          <h2>Available buses</h2>
          <p>
            {websiteBuses.length + matchingSavedBuses.length} matching
            bus(es)
          </p>
        </section>
      )}

      <main className="lbr-list">
        {/* Demonstration bus — clearly labelled, not a real service. */}
        <article className="lbr-bus-card">
          <div className="lbr-card-header">
            <div className="lbr-card-title-area">
              <h2>BussInn Demo Bus</h2>
              <p>GPS tracking demonstration</p>
              <span className="lbr-category-label">DEMO ONLY</span>
            </div>

            <img
              src={ORDINARY_IMAGE}
              alt="Demo bus"
              className="lbr-bus-category-image"
            />
          </div>

          <div className="lbr-route-box">
            <div className="lbr-route-station">
              <span className="lbr-route-label">START</span>
              <strong>Stop S</strong>
              <span className="lbr-route-time">Demo</span>
            </div>

            <div className="lbr-route-middle">
              <div className="lbr-route-line">
                <span />
                <div />
                <span />
              </div>
              <small>4 stops</small>
            </div>

            <div className="lbr-route-station right">
              <span className="lbr-route-label">END</span>
              <strong>Stop C</strong>
              <span className="lbr-route-time">Demo</span>
            </div>
          </div>

          <div className="lbr-actions">
            <button
              type="button"
              className="lbr-route-button"
              onClick={() => openRoute(demoBus)}
            >
              <RouteIcon size={17} />
              <span>Route</span>
            </button>

            <Link
              to="/trackbus"
              search={{
                busId: "demo-bus",
                from: "Stop S",
                to: "Stop C",
                date,
              }}
              className="lbr-track-button"
            >
              <Navigation size={17} />
              <span>Track Demo</span>
            </Link>
          </div>
        </article>

        {/* Actual results returned by TinyFish. */}
        {websiteBuses.map((bus) => (
          <article key={bus.id} className="lbr-bus-card">
            <div className="lbr-card-header">
              <div className="lbr-card-title-area">
                <h2>{bus.name}</h2>
                <p>
                  {bus.operator}
                  {bus.depot ? ` • ${bus.depot}` : ""}
                </p>
                <span className="lbr-category-label">
                  WEBSITE RESULT
                </span>
              </div>

              <img
                src={busImage(bus)}
                alt={`${bus.bus_type} bus`}
                className="lbr-bus-category-image"
              />
            </div>

            <div className="lbr-route-box">
              <div className="lbr-route-station">
                <span className="lbr-route-label">BOARDING</span>
                <strong>{bus.source}</strong>
                <span className="lbr-route-time">
                  {formatTime(bus.departure_time)}
                </span>
              </div>

              <div className="lbr-route-middle">
                <div className="lbr-route-line">
                  <span />
                  <div />
                  <span />
                </div>
                <small>{bus.duration || "Duration unavailable"}</small>
              </div>

              <div className="lbr-route-station right">
                <span className="lbr-route-label">ARRIVAL</span>
                <strong>{bus.destination}</strong>
                <span className="lbr-route-time">
                  {formatTime(bus.arrival_time)}
                </span>
              </div>
            </div>

            <div className="lbr-info-row">
              <div>
                <small>Fare</small>
                <strong>
                  {bus.fare == null || bus.fare === ""
                    ? "Unavailable"
                    : `₹${bus.fare}`}
                </strong>
              </div>

              <div>
                <small>Seats</small>
                <strong>{bus.available_seats ?? "Unavailable"}</strong>
              </div>

              <div>
                <small>Type</small>
                <strong>{bus.bus_type}</strong>
              </div>
            </div>

            <div className="lbr-actions">
              <button
                type="button"
                className="lbr-route-button"
                onClick={() => openRoute(bus)}
              >
                <RouteIcon size={17} />
                <span>Route</span>
              </button>

              <a
                href={
                  bus.source_url &&
                  /^https?:\/\//i.test(bus.source_url)
                    ? bus.source_url
                    : UPSRTC_HOME
                }
                target="_blank"
                rel="noreferrer"
                className="lbr-track-button"
              >
                <ExternalLink size={17} />
                <span>{bus.source_name ? `Schedule source: ${bus.source_name}` : "Open schedule source"}</span>
              </a>
            </div>
          </article>
        ))}

        {/* Buses saved in Supabase with ordered stops. */}
        {matchingSavedBuses.map((bus) => {
          const stops = routeStops(bus, from, to);
          const first = stops[0];
          const last = stops[stops.length - 1];
          const isLive = Boolean(liveLocations[bus.id]);

          return (
            <article key={bus.id} className="lbr-bus-card">
              <div className="lbr-card-header">
                <div className="lbr-card-title-area">
                  <h2>{bus.name || bus.bus_name || "UPSRTC Bus"}</h2>
                  <p>{bus.operator || "UPSRTC"}</p>
                </div>

                <img
                  src={busImage(bus)}
                  alt="Bus category"
                  className="lbr-bus-category-image"
                />
              </div>

              <div className="lbr-route-box">
                <div className="lbr-route-station">
                  <span className="lbr-route-label">BOARDING</span>
                  <strong>{first?.station_name || from}</strong>
                  <span className="lbr-route-time">
                    {formatTime(
                      first?.departure_time || first?.arrival_time,
                    )}
                  </span>
                </div>

                <div className="lbr-route-middle">
                  <div className="lbr-route-line">
                    <span />
                    <div />
                    <span />
                  </div>
                  <small>{stops.length} stops</small>
                </div>

                <div className="lbr-route-station right">
                  <span className="lbr-route-label">ARRIVAL</span>
                  <strong>{last?.station_name || to}</strong>
                  <span className="lbr-route-time">
                    {formatTime(
                      last?.arrival_time || last?.departure_time,
                    )}
                  </span>
                </div>
              </div>

              <div className="lbr-info-row">
                <div>
                  <small>Fare</small>
                  <strong>
                    {bus.fare == null ? "Unavailable" : `₹${bus.fare}`}
                  </strong>
                </div>

                <div>
                  <small>Stops</small>
                  <strong>{stops.length}</strong>
                </div>

                <div>
                  <small>Status</small>
                  <strong className={isLive ? "lbr-green" : "lbr-gray"}>
                    {isLive ? "Live GPS" : "Scheduled"}
                  </strong>
                </div>
              </div>

              <div className="lbr-actions">
                <button
                  type="button"
                  className="lbr-route-button"
                  onClick={() => openRoute(bus)}
                >
                  <RouteIcon size={17} />
                  <span>Route</span>
                </button>

                <Link
                  to="/trackbus"
                  search={{ busId: String(bus.id), from, to, date }}
                  className="lbr-track-button"
                >
                  <Navigation size={17} />
                  <span>Track</span>
                </Link>
              </div>
            </article>
          );
        })}
      </main>

      {!websiteLoading &&
        !databaseLoading &&
        !websiteError &&
        websiteBuses.length === 0 &&
        matchingSavedBuses.length === 0 && (
          <div className="lbr-empty">
            <BusFront size={32} />
            <h2>No matching buses found</h2>
            <p>
              The UPSRTC website showed no buses for this route and date.
              Try another date.
            </p>
          </div>
        )}

      {activeRoute && (
        <div className="lbr-modal-overlay" onClick={closeRoute}>
          <div
            className="lbr-route-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="lbr-modal-header">
              <div>
                <span>BUS ROUTE</span>
                <h2>
                  {activeRoute.name ||
                    activeRoute.bus_name ||
                    "Bus Route"}
                </h2>
              </div>

              <button
                type="button"
                className="lbr-modal-close"
                onClick={closeRoute}
                aria-label="Close route"
              >
                <X size={20} />
              </button>
            </div>

            {stopsAreLoading && (
              <p className="lbr-gray" style={{ margin: "4px 0 12px" }}>
                Fetching every stop from the UPSRTC website. This can take
                up to a minute the first time; after that it loads
                instantly.
              </p>
            )}

            {stopsPending && !stopsAreLoading && stopsError && (
              <div className="lbr-error" role="alert">
                <p>{stopsError}</p>
                <button
                  type="button"
                  className="lbr-route-button"
                  onClick={() => openRoute(activeRoute)}
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
              </div>
            )}

            <div className="lbr-modal-route">
              {stopsFor(activeRoute).map((stop, index, allStops) => (
                <div
                  key={stop.id || `${stop.stop_order}-${index}`}
                  className="lbr-modal-stop"
                >
                  <div className="lbr-modal-timeline">
                    <span
                      className={
                        index === 0
                          ? "start"
                          : index === allStops.length - 1
                            ? "end"
                            : ""
                      }
                    />
                    {index < allStops.length - 1 && <div />}
                  </div>

                  <div className="lbr-modal-stop-info">
                    <div>
                      <strong>{stop.station_name}</strong>
                      <small>
                        {index === 0
                          ? "Boarding"
                          : index === allStops.length - 1
                            ? "Destination"
                            : "Stop"}
                      </small>
                    </div>
                  </div>

                  <div className="lbr-modal-time">
                    <strong>
                      {formatTime(
                        stop.arrival_time || stop.departure_time,
                      )}
                    </strong>
                  </div>
                </div>
              ))}
            </div>

            {activeRoute.demo ? (
              <Link
                to="/trackbus"
                search={{
                  busId: "demo-bus",
                  from: "Stop S",
                  to: "Stop C",
                  date,
                }}
                className="lbr-modal-track"
              >
                <Navigation size={18} />
                <span>Track Demo Bus</span>
              </Link>
            ) : activeRoute.isWebsiteResult ? (
              <a
                href={
                  activeRoute.booking_url &&
                  /^https?:\/\//i.test(activeRoute.booking_url)
                    ? activeRoute.booking_url
                    : UPSRTC_HOME
                }
                target="_blank"
                rel="noreferrer"
                className="lbr-modal-track"
              >
                <ExternalLink size={18} />
                <span>Open UPSRTC Website</span>
              </a>
            ) : (
              <Link
                to="/trackbus"
                search={{
                  busId: String(activeRoute.id),
                  from,
                  to,
                  date,
                }}
                className="lbr-modal-track"
              >
                <Navigation size={18} />
                <span>Track This Bus</span>
              </Link>
            )}
          </div>
        </div>
      )}

      <PassengerBottomNav />
    </div>
  );
}
