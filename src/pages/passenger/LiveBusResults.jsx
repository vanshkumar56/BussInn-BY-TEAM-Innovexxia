import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  BusFront,
  CalendarDays,
  Navigation,
  Route as RouteIcon,
  X,
} from "lucide-react";

import PassengerBottomNav from "../../components/PassengerBottomNav";
import { supabase } from "../../lib/supabase";
import "../../styles/LiveBusResults.css";

const AC_IMAGE =
  "https://www.onlineupsrtc.co.in/assets/icons/bus_ac_janrath_2x2.png";

const ORDINARY_IMAGE =
  "https://www.onlineupsrtc.co.in/assets/icons/Ordinary.png";

const DEMO_STOPS = [
  { stop_order: 1, station_name: "Stop S" },
  { stop_order: 2, station_name: "Stop A" },
  { stop_order: 3, station_name: "Stop B" },
  { stop_order: 4, station_name: "Stop C" },
];

const normalize = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

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
  const type = normalize(bus.bus_type || bus.busType || bus.category || "");

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

export default function LiveBusResults() {
  const search = useSearch({ strict: false });

  const from = search?.from || search?.source || "";
  const to = search?.to || search?.destination || "";
  const date = search?.date || "";

  const [savedBuses, setSavedBuses] = useState([]);
  const [liveLocations, setLiveLocations] = useState({});
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [selectedRoute, setSelectedRoute] = useState(null);

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

  function stopsFor(bus) {
    if (bus.demo) return DEMO_STOPS;
    return routeStops(bus, from, to);
  }

  function openRoute(bus) {
    setSelectedRoute(bus);
  }

  function closeRoute() {
    setSelectedRoute(null);
  }

  return (
    <div className="lbr-page">
      <header className="lbr-header">
        <div>
          <h1>Live Buses</h1>
          <p>Bus schedules and live tracking</p>
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

      {databaseError && (
        <div className="lbr-error" role="alert">
          <p>{databaseError}</p>
        </div>
      )}

      <section className="lbr-results-heading">
        <h2>Available buses</h2>
        <p>
          {matchingSavedBuses.length + 1} matching bus(es)
        </p>
      </section>

      <main className="lbr-list">
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

      {!databaseLoading &&
        !databaseError &&
        matchingSavedBuses.length === 0 && (
          <div className="lbr-empty">
            <BusFront size={32} />
            <h2>No saved buses found</h2>
            <p>
              There are no saved bus schedules matching this route yet.
            </p>
          </div>
        )}

      {selectedRoute && (
        <div className="lbr-modal-overlay" onClick={closeRoute}>
          <div
            className="lbr-route-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="lbr-modal-header">
              <div>
                <span>BUS ROUTE</span>
                <h2>
                  {selectedRoute.name ||
                    selectedRoute.bus_name ||
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

            <div className="lbr-modal-route">
              {stopsFor(selectedRoute).map((stop, index, allStops) => (
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

            {selectedRoute.demo ? (
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
            ) : (
              <Link
                to="/trackbus"
                search={{
                  busId: String(selectedRoute.id),
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