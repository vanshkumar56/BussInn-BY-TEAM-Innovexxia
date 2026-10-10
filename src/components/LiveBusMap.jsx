import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import DriverBottomNav from "../../components/DriverBottomNav";
import LiveBusMap from "../../components/LiveBusMap";
import { useShiftGate } from "../../hooks/useShiftGate";
import "../../styles/DriverDashboard.css";

const SHIFT_START_RADIUS_M = 1000;

const gateMessage = (gate) => {
  switch (gate.status) {
    case "locating":     return "Getting your GPS location…";
    case "unsupported":  return "Location is not supported on this device.";
    case "no_stop":      return "No bus stand is set for this route.";
    case "low_accuracy": return `GPS accuracy is ${gate.accuracy}m. Move to an open area (needs 50m or better).`;
    case "stale":        return "Waiting for a fresh GPS fix…";
    case "suspicious":   return "Sudden location jump detected. Turn off mock-location apps and try again.";
    case "too_far":      return `You are ${gate.distance}m from the bus stand. Get within 1 km to start.`;
    case "verifying":    return "Inside the bus stand area. Hold still while we confirm…";
    case "ready":        return "You're at the bus stand. You can start your shift.";
    default:             return "Location unavailable. Check your GPS permission.";
  }
};

const DriverDashboard = () => {
  const navigate = useNavigate();

  // Global language state
  const [isHindi, setIsHindi] = useState(false);

  // Route details, loaded from localStorage on mount
  const [routeDetails, setRouteDetails] = useState({
    departure: "Central Station",
    destination: "North Terminal",
    stops: [],
    startTime: "08:00",
    endTime: "16:00",
    routeCode: "RTE-42A",
    driverName: "Driver",
  });

  const [timeError] = useState("");

  useEffect(() => {
    const savedLanguage = localStorage.getItem("bussinn_lang");
    setIsHindi(savedLanguage === "hi");
  }, []);

  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem("driver_route_config");
      if (!savedConfig) return;

      const parsedConfig = JSON.parse(savedConfig);
      setRouteDetails((current) => ({
        ...current,
        ...parsedConfig,
        stops: Array.isArray(parsedConfig.stops) ? parsedConfig.stops : [],
      }));
    } catch (error) {
      console.error("Failed to load driver route configuration:", error);
    }
  }, []);

  // Bus stand = first stop of the selected bus, or the configured start stop
  const startStop =
    routeDetails.selectedBus?.stops?.[0] ?? routeDetails.startStop ?? null;

  const gate = useShiftGate(
  routeGates.start ? startStop : null,
  SHIFT_START_RADIUS_M,
  routeGates.maxAccuracyM
);

  const routeStops =
    routeDetails.selectedBus?.stops?.length > 0
      ? routeDetails.selectedBus.stops
      : routeDetails.stops || [];

  const displayStartTime =
    routeDetails.selectedBus?.departureTime || routeDetails.startTime;

  const displayEndTime =
    routeDetails.selectedBus?.arrivalTime || routeDetails.endTime;

  const toggleLanguage = () => {
    const newLangState = !isHindi;
    setIsHindi(newLangState);
    localStorage.setItem("bussinn_lang", newLangState ? "hi" : "en");
  };

  const content = {
    en: {
      greeting: `Welcome, ${routeDetails.driverName}`,
      subtitle: "Ready for your shift? Your custom route configuration is active.",
      startTrip: "Start Trip",
      currentRoute: "CUSTOM ROUTE",
      startTime: "Start Time",
      endTime: "End Time",
      totalStops: "Total Stops",
      routeCode: "Route Code",
      dutyHours: "Duty Hours",
      routeFlow: "Route Flow",
      inbound: "Inbound",
      todaysSchedule: "Configured Stops & Schedule",
      viewDetails: "View Full Details",
      startRoute: "Route Departure",
      firstStop: "Starts from:",
      intermediateStop: "Intermediate Stop",
      endRoute: "Route Destination",
      finalStop: "Ends at:",
      ready: "Ready",
    },
    hi: {
      greeting: `स्वागत है, ${routeDetails.driverName}`,
      subtitle: "क्या आप अपनी शिफ्ट के लिए तैयार हैं? आपका कस्टम मार्ग सक्रिय है।",
      startTrip: "यात्रा शुरू करें",
      currentRoute: "कस्टम मार्ग",
      startTime: "शुरू होने का समय",
      endTime: "समाप्त होने का समय",
      totalStops: "कुल स्टॉप",
      routeCode: "रूट कोड",
      dutyHours: "ड्यूटी के घंटे",
      routeFlow: "मार्ग प्रवाह",
      inbound: "इनबाउंड",
      todaysSchedule: "कॉन्फ़िगर किए गए स्टॉप और शेड्यूल",
      viewDetails: "पूरा विवरण देखें",
      startRoute: "मार्ग प्रस्थान",
      firstStop: "यहाँ से शुरू:",
      intermediateStop: "मध्यवर्ती स्टॉप",
      endRoute: "मार्ग गंतव्य",
      finalStop: "यहाँ समाप्त:",
      ready: "तैयार",
    },
  };

  const t = isHindi ? content.hi : content.en;

  const handleTripToggle = () => {
    if (gate.status !== "ready") return;

    localStorage.setItem("trigger_coin_reward", "pending");
    // Location proof at shift start, for the backend to verify later
    localStorage.setItem(
      "shift_start_proof",
      JSON.stringify({
        at: Date.now(),
        ...gate.position,
        accuracy: gate.accuracy,
        distanceM: gate.distance,
      })
    );
    navigate({ to: "/driver/live-tracking" });
  };

  return (
    <div className="mobile-page-container">
      <div className="app-content dashboard-layout">
        <header className="dash-header">
          <h1 className="brand-title">BussInn</h1>
          <button
            className="btn-lang-pill"
            onClick={toggleLanguage}
            title="Change Language"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="icon-small">
              <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
            </svg>
            EN / HI
          </button>
        </header>

        <main className="dash-content">
          {/* Welcome & action card */}
          <section className="welcome-card">
            <h2 className="welcome-title">{t.greeting}</h2>
            <p className="welcome-subtitle">{t.subtitle}</p>

            {timeError && <p className="error-banner">{timeError}</p>}

            <p className={`gate-status gate-${gate.status}`}>{gateMessage(gate)}</p>

            <button
              className="btn-trip"
              onClick={handleTripToggle}
              disabled={gate.status !== "ready"}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="trip-icon">
                <path d="M8 5v14l11-7z" />
              </svg>
              {t.startTrip}
            </button>
          </section>

          {/* Route details card */}
          <section className="info-card route-details-card">
            <div className="card-indicator" />

            <div className="route-card-header">
              <div>
                <span className="label-small">{t.currentRoute}</span>
                <h3 className="route-name">
                  {routeDetails.departure} → {routeDetails.destination}
                </h3>
                {routeDetails.selectedBus && (
                  <p className="selected-bus-name">
                    Bus:{" "}
                    {routeDetails.selectedBus.name ||
                      routeDetails.selectedBus.bus_name ||
                      routeDetails.selectedBus.bus_number ||
                      "Selected bus"}
                  </p>
                )}
              </div>
              <div className="status-badge">
                <span className="status-dot" />
                {t.ready}
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-label">{t.startTime}</span>
                <span className="stat-value text-primary">{displayStartTime}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">{t.endTime}</span>
                <span className="stat-value">{displayEndTime}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">{t.totalStops}</span>
                <span className="stat-value text-tertiary">{routeStops.length + 2}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">{t.routeCode}</span>
                <span className="stat-value">{routeDetails.routeCode}</span>
              </div>
            </div>
          </section>

          {/* Live map */}
          <section className="live-map-section">
            <LiveBusMap
              position={gate.position}
              startStop={startStop}
              radiusM={SHIFT_START_RADIUS_M}
              busLabel="Bus"
            />
          </section>

          {/* Quick stats */}
          <section className="quick-stats-row">
            <div className="quick-stat-card">
              <div className="stat-icon-circle bg-orange-light">
                <svg viewBox="0 0 24 24" fill="none" stroke="#f57c00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="stat-text-group">
                <span className="stat-label">{t.dutyHours}</span>
                <span className="stat-value-large">0h 0m</span>
              </div>
            </div>

            <div className="quick-stat-card">
              <div className="stat-icon-circle bg-teal-light">
                <svg viewBox="0 0 24 24" fill="none" stroke="#00838f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
              <div className="stat-text-group">
                <span className="stat-label">{t.routeFlow}</span>
                <span className="stat-value-large">{t.inbound}</span>
              </div>
            </div>
          </section>

          {/* Schedule timeline */}
          <section className="schedule-section">
            <div className="schedule-header">
              <h3 className="section-title">{t.todaysSchedule}</h3>
              <a href="#" className="link-text">{t.viewDetails}</a>
            </div>

            <div className="timeline">
              <div className="timeline-item">
                <div className="time-block">
                  <span className="time">{displayStartTime}</span>
                </div>
                <div className="timeline-node bg-blue-light">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                    <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z" />
                  </svg>
                </div>
                <div className="timeline-content">
                  <h4 className="timeline-title">{t.startRoute}: {routeDetails.departure}</h4>
                  <p className="timeline-desc">{t.firstStop} {routeDetails.departure}</p>
                </div>
              </div>

              {routeStops.map((stop, idx) => (
                <div className="timeline-item" key={idx}>
                  <div className="time-block">
                    <span className="time">Stop {idx + 1}</span>
                  </div>
                  <div className="timeline-node bg-gray-light">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="text-gray">
                      <circle cx="12" cy="12" r="6" />
                    </svg>
                  </div>
                  <div className="timeline-content">
                    <h4 className="timeline-title">{t.intermediateStop}</h4>
                    <p className="timeline-desc">
                      {typeof stop === "string" ? stop : stop.station_name || stop.name || "Stop"}
                    </p>
                  </div>
                </div>
              ))}

              <div className="timeline-item">
                <div className="time-block">
                  <span className="time">{displayEndTime}</span>
                </div>
                <div className="timeline-node bg-gray-light">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="text-gray">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                  </svg>
                </div>
                <div className="timeline-content">
                  <h4 className="timeline-title">{t.endRoute}: {routeDetails.destination}</h4>
                  <p className="timeline-desc">{t.finalStop} {routeDetails.destination}</p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <div className="bottom-nav-placeholder">
          <DriverBottomNav />
        </div>
      </div>
    </div>
  );
};

export default DriverDashboard;