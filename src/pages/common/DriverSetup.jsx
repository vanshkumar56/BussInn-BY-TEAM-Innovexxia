
import { supabase } from "../../lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MapPin, BusFront } from "lucide-react";
import locations from "../../data/locations.json";
import "../../styles/DriverSetup.css";

const normalizeLocation = (value = "") =>
  String(value).trim().toLowerCase().replace(/\s+/g, " ");

const getLocationSuggestions = (query) => {
  const normalizedQuery = normalizeLocation(query);
  if (!normalizedQuery) return [];

  return locations
    .filter((location) =>
      [location.name, location.district, location.state].some(
        (value) => normalizeLocation(value).startsWith(normalizedQuery)
      )
    )
    .slice(0, 8);
};

const getMinutes = (time) => {
  if (!time || !/^\d{1,2}:\d{2}/.test(String(time))) return null;

  const [hours, minutes] = String(time)
    .slice(0, 5)
    .split(":")
    .map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

const withinTenMinutes = (scheduledTime, requestedTime) => {
  const scheduled = getMinutes(scheduledTime);
  const requested = getMinutes(requestedTime);

  if (scheduled === null || requested === null) return false;

  const difference = Math.abs(scheduled - requested);

  // Supports time differences that cross midnight.
  return Math.min(difference, 1440 - difference) <= 10;
};

const findBusMatches = (
  buses,
  departure,
  destination,
  shiftStart,
  shiftEnd
) => {
  const from = normalizeLocation(departure);
  const to = normalizeLocation(destination);

  if (!from || !to || from === to || !shiftStart || !shiftEnd) {
    return [];
  }

  return buses.flatMap((bus) => {
    const routeStops = [...(bus.bus_schedule || [])].sort(
      (a, b) => Number(a.stop_order) - Number(b.stop_order)
    );

    if (!routeStops.length) return [];

    const departureIndex = routeStops.findIndex(
      (stop) => normalizeLocation(stop.station_name) === from
    );

    const destinationIndex = routeStops.findIndex(
      (stop) => normalizeLocation(stop.station_name) === to
    );

    // Both locations must exist, in the correct travel order.
    if (
      departureIndex < 0 ||
      destinationIndex <= departureIndex
    ) {
      return [];
    }

    const departureStop = routeStops[departureIndex];
    const destinationStop = routeStops[destinationIndex];

    if (!departureStop || !destinationStop) return [];

    const scheduledDeparture =
      departureStop.departure_time || departureStop.arrival_time || "";

    const scheduledArrival =
      destinationStop.arrival_time || destinationStop.departure_time || "";

    if (
      !withinTenMinutes(scheduledDeparture, shiftStart) ||
      !withinTenMinutes(scheduledArrival, shiftEnd)
    ) {
      return [];
    }

    return [
      {
        ...bus,
        matchedDeparture: departureStop.station_name,
        matchedDestination: destinationStop.station_name,
        matchedDepartureTime: String(scheduledDeparture).slice(0, 5),
        matchedArrivalTime: String(scheduledArrival).slice(0, 5),
        scheduleVerified: true,
        stops: routeStops
          .slice(departureIndex, destinationIndex + 1)
          .map((stop) => ({
            name: stop.station_name,
            stopOrder: stop.stop_order,
            arrivalTime: stop.arrival_time || "",
            departureTime: stop.departure_time || "",
          })),
      },
    ];
  });
};

const DriverSetup = () => {
  const navigate = useNavigate();

  const [isHindi, setIsHindi] = useState(
    () => localStorage.getItem("bussinn_lang") === "hi"
  );

  const [departurePoint, setDeparturePoint] = useState("");
  const [destinationPoint, setDestinationPoint] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [error, setError] = useState("");
  const [activeLocationField, setActiveLocationField] = useState(null);

  const [buses, setBuses] = useState([]);
  const [selectedBusId, setSelectedBusId] = useState(null);
  const [busLoading, setBusLoading] = useState(false);
  const [busLoadError, setBusLoadError] = useState("");

  const toggleLanguage = () => {
    const next = !isHindi;
    setIsHindi(next);
    localStorage.setItem("bussinn_lang", next ? "hi" : "en");
  };

  useEffect(() => {
    let cancelled = false;

    const loadBuses = async () => {
      setBusLoading(true);
      setBusLoadError("");

      try {
        const { data, error } = await supabase
          .from("buses")
          .select(`
            *,
            bus_schedule (
              id,
              stop_order,
              station_name,
              arrival_time,
              departure_time
            )
          `)
          .eq("is_active", true);

        if (error) throw error;

        const scheduledBuses = (data || []).map((bus) => ({
          ...bus,
          bus_schedule: [...(bus.bus_schedule || [])].sort(
            (a, b) => Number(a.stop_order) - Number(b.stop_order)
          ),
        }));

        if (!cancelled) setBuses(scheduledBuses);
      } catch (err) {
        console.error("Unable to load buses:", err);

        if (!cancelled) {
          setBusLoadError(
            err?.message || "Unable to load buses. Please try again."
          );
        }
      } finally {
        if (!cancelled) setBusLoading(false);
      }
    };

    loadBuses();

    return () => {
      cancelled = true;
    };
  }, []);

  const departureSuggestions = useMemo(
    () =>
      activeLocationField === "departure"
        ? getLocationSuggestions(departurePoint)
        : [],
    [activeLocationField, departurePoint]
  );

  const destinationSuggestions = useMemo(
    () =>
      activeLocationField === "destination"
        ? getLocationSuggestions(destinationPoint)
        : [],
    [activeLocationField, destinationPoint]
  );

  const matchedBuses = useMemo(
    () =>
      findBusMatches(
        buses,
        departurePoint,
        destinationPoint,
        startTime,
        endTime
      ),
    [buses, departurePoint, destinationPoint, startTime, endTime]
  );

  const selectLocation = (field, location) => {
    if (field === "departure") {
      setDeparturePoint(location.name);
    } else {
      setDestinationPoint(location.name);
    }

    setActiveLocationField(null);
    setSelectedBusId(null);
    setError("");
  };

  const content = {
    en: {
      title: "Driver Setup",
      subtitle: "Configure your route details before starting your shift.",
      departureLabel: "Departure Point",
      departurePlaceholder: "Starts from...",
      destinationLabel: "Destination Point",
      destinationPlaceholder: "Ends at...",
      startTimeLabel: "Shift Start Time",
      endTimeLabel: "Shift End Time",
      continueBtn: "Continue",
      errorMsg:
        "Please enter your departure, destination, and shift times.",
      note:
        "Choose a bus whose scheduled departure and arrival are within ±10 minutes of your entered times.",
    },
    hi: {
      title: "ड्राइवर सेटअप",
      subtitle: "अपनी शिफ्ट शुरू करने से पहले मार्ग का विवरण भरें।",
      departureLabel: "प्रस्थान बिंदु",
      departurePlaceholder: "यहाँ से शुरू करें...",
      destinationLabel: "गंतव्य बिंदु",
      destinationPlaceholder: "यहाँ समाप्त करें...",
      startTimeLabel: "शिफ्ट शुरू होने का समय",
      endTimeLabel: "शिफ्ट समाप्त होने का समय",
      continueBtn: "जारी रखें",
      errorMsg: "कृपया शुरुआती स्थान, गंतव्य और शिफ्ट का समय भरें।",
      note:
        "बस का निर्धारित समय आपके दर्ज किए गए समय से ±10 मिनट के भीतर होना चाहिए।",
    },
  };

  const t = isHindi ? content.hi : content.en;

  const handleContinue = () => {
    if (
      !departurePoint.trim() ||
      !destinationPoint.trim() ||
      !startTime ||
      !endTime
    ) {
      setError(t.errorMsg);
      return;
    }

    if (getMinutes(startTime) === getMinutes(endTime)) {
      setError("Shift start and end times cannot be identical.");
      return;
    }

    const matchedBus = matchedBuses.find(
      (bus) => String(bus.id) === String(selectedBusId)
    );

    if (!matchedBus) {
      setError("Please select a matching bus before continuing.");
      return;
    }

    const driverRouteData = {
      driverName: localStorage.getItem("bussinn_signup_name") || "Driver",
      departure: departurePoint,
      destination: destinationPoint,
      startTime,
      endTime,
      routeCode: "RTE-" + Math.floor(10 + Math.random() * 90) + "A",
      selectedBus: {
        id: matchedBus.id,
        name:
          matchedBus.name ||
          matchedBus.bus_name ||
          matchedBus.bus_number ||
          "Bus",
        source: matchedBus.matchedDeparture,
        destination: matchedBus.matchedDestination,
        stops: matchedBus.stops,
        departureTime: matchedBus.matchedDepartureTime,
        arrivalTime: matchedBus.matchedArrivalTime,
        scheduleVerified: matchedBus.scheduleVerified,
      },
    };

    localStorage.setItem(
      "driver_route_config",
      JSON.stringify(driverRouteData)
    );

    navigate({ to: "/driver/dashboard" });
  };

  const renderSuggestions = (field, suggestions) => {
    const query =
      field === "departure" ? departurePoint : destinationPoint;

    if (activeLocationField !== field || !query.trim()) return null;

    return (
      <ul className="driver-location-suggestions">
        {suggestions.length > 0 ? (
          suggestions.map((location) => (
            <li key={`${field}-${location.name}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectLocation(field, location)}
              >
                <MapPin size={16} />
                <span>
                  <strong>{location.name}</strong>
                  <small>
                    {location.district}, {location.state}
                  </small>
                </span>
              </button>
            </li>
          ))
        ) : (
          <li className="driver-no-suggestions">
            No matching locations found.
          </li>
        )}
      </ul>
    );
  };

  return (
    <div className="mobile-page-container">
      <div className="app-content driver-layout">
        <header className="driver-header">
          <div className="brand-info">
            <BusFront size={26} />
            <span className="brand-name">BussInn</span>
          </div>

          <button
            type="button"
            className="btn-lang-pill"
            onClick={toggleLanguage}
            title="Change Language"
          >
            EN / HI
          </button>
        </header>

        <div className="setup-card">
          <div className="card-header">
            <div className="icon-badge">
              <MapPin size={24} />
            </div>
            <h1 className="card-title">{t.title}</h1>
            <p className="card-subtitle">{t.subtitle}</p>
          </div>

          <form
            className="setup-form"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="form-group">
              <label className="form-label">{t.departureLabel}</label>

              <div className="input-box">
                <MapPin className="input-icon" size={20} />
                <input
                  type="text"
                  placeholder={t.departurePlaceholder}
                  value={departurePoint}
                  onFocus={() => setActiveLocationField("departure")}
                  onChange={(event) => {
                    setDeparturePoint(event.target.value);
                    setActiveLocationField("departure");
                    setSelectedBusId(null);
                    setError("");
                  }}
                />
              </div>

              {renderSuggestions("departure", departureSuggestions)}
            </div>

            <div className="form-group">
              <label className="form-label">{t.destinationLabel}</label>

              <div className="input-box">
                <MapPin className="input-icon" size={20} />
                <input
                  type="text"
                  placeholder={t.destinationPlaceholder}
                  value={destinationPoint}
                  onFocus={() => setActiveLocationField("destination")}
                  onChange={(event) => {
                    setDestinationPoint(event.target.value);
                    setActiveLocationField("destination");
                    setSelectedBusId(null);
                    setError("");
                  }}
                />
              </div>

              {renderSuggestions("destination", destinationSuggestions)}
            </div>

            <div className="time-group">
              <div className="form-group flex-1">
                <label className="form-label">{t.startTimeLabel}</label>
                <div className="input-box">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => {
                      setStartTime(event.target.value);
                      setSelectedBusId(null);
                      setError("");
                    }}
                  />
                </div>
              </div>

              <div className="form-group flex-1">
                <label className="form-label">{t.endTimeLabel}</label>
                <div className="input-box">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(event) => {
                      setEndTime(event.target.value);
                      setSelectedBusId(null);
                      setError("");
                    }}
                  />
                </div>
              </div>
            </div>

            {departurePoint.trim() &&
              destinationPoint.trim() &&
              startTime &&
              endTime && (
                <section
                  className="driver-bus-matches"
                  aria-live="polite"
                >
                  <h2>Matching Buses</h2>

                  {busLoading && <p>Loading buses...</p>}

                  {busLoadError && (
                    <p className="setup-error">{busLoadError}</p>
                  )}

                  {!busLoading &&
                    !busLoadError &&
                    matchedBuses.length === 0 && (
                      <p>
                        No matching buses found. Check the route, times, and
                        Supabase schedules.
                      </p>
                    )}

                  {matchedBuses.map((bus) => (
                    <article
                      key={bus.id}
                      className={`driver-match-card ${
                        String(selectedBusId) === String(bus.id)
                          ? "selected"
                          : ""
                      }`}
                      onClick={() => setSelectedBusId(bus.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" ||
                          event.key === " "
                        ) {
                          event.preventDefault();
                          setSelectedBusId(bus.id);
                        }
                      }}
                      aria-pressed={
                        String(selectedBusId) === String(bus.id)
                      }
                    >
                      <div className="driver-match-title">
                        <BusFront size={22} />
                        <div>
                          <strong>
                            {bus.name || bus.bus_number || "Bus"}
                          </strong>
                          <small>{bus.operator || "UPSRTC"}</small>
                        </div>
                      </div>

                      <p>
                        {bus.matchedDeparture} → {bus.matchedDestination}
                      </p>

                      <p>
                        {bus.matchedDepartureTime} –{" "}
                        {bus.matchedArrivalTime}
                      </p>

                      {String(selectedBusId) === String(bus.id) && (
                        <p className="selected-bus-label">
                          Selected bus
                        </p>
                      )}
                    </article>
                  ))}
                </section>
              )}

            {error && <p className="setup-error">{error}</p>}

            <button
              type="button"
              className="action-btn"
              onClick={handleContinue}
            >
              {t.continueBtn}
            </button>

            <p className="footer-note">{t.note}</p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DriverSetup;
