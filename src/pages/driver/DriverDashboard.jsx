import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import DriverBottomNav from "../../components/DriverBottomNav";
import "../../styles/DriverDashboard.css";

const DriverDashboard = () => {
  const navigate = useNavigate();

  const [isHindi, setIsHindi] = useState(false);
  const [routeDetails, setRouteDetails] = useState({
    departure: "Central Station",
    destination: "North Terminal",
    stops: [],
    startTime: "08:00",
    endTime: "16:00",
    routeCode: "RTE-42A",
    driverName: "Driver",
  });

  useEffect(() => {
    try {
      setIsHindi(localStorage.getItem("bussinn_lang") === "hi");

      const savedConfig = localStorage.getItem("driver_route_config");
      if (!savedConfig) return;

      const parsed = JSON.parse(savedConfig);
      setRouteDetails((current) => ({
        ...current,
        ...parsed,
        stops: Array.isArray(parsed.stops) ? parsed.stops : [],
      }));
    } catch (error) {
      console.error("Failed to load driver settings:", error);
    }
  }, []);

  const routeStops = Array.isArray(routeDetails.selectedBus?.stops)
    ? routeDetails.selectedBus.stops
    : routeDetails.stops;

  const startTime =
    routeDetails.selectedBus?.departureTime || routeDetails.startTime;
  const endTime =
    routeDetails.selectedBus?.arrivalTime || routeDetails.endTime;

  const toggleLanguage = () => {
    const nextIsHindi = !isHindi;
    setIsHindi(nextIsHindi);

    try {
      localStorage.setItem("bussinn_lang", nextIsHindi ? "hi" : "en");
    } catch (error) {
      console.error("Failed to save language preference:", error);
    }
  };

  const content = isHindi
    ? {
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
      }
    : {
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
      };

  const startTrip = () => {
    try {
      localStorage.setItem("trigger_coin_reward", "pending");
      localStorage.setItem(
        "shift_start_proof",
        JSON.stringify({ at: Date.now(), gateEnabled: false }),
      );
    } catch (error) {
      // Navigation should still work if browser storage is unavailable.
      console.warn("Could not save shift data:", error);
    }

    navigate({ to: "/driver/live-tracking" });
  };

  const stopName = (stop) =>
    typeof stop === "string"
      ? stop
      : stop?.station_name || stop?.name || "Stop";

  return (
    <div className="mobile-page-container">
      <div className="app-content dashboard-layout">
        <header className="dash-header">
          <h1 className="brand-title">BussInn</h1>
          <button
            className="btn-lang-pill"
            onClick={toggleLanguage}
            title="Change Language"
            type="button"
          >
            EN / HI
          </button>
        </header>

        <main className="dash-content">
          <section className="welcome-card">
            <h2 className="welcome-title">{content.greeting}</h2>
            <p className="welcome-subtitle">{content.subtitle}</p>

            <button
              type="button"
              className="btn-trip"
              onClick={startTrip}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="trip-icon">
                <path d="M8 5v14l11-7z" />
              </svg>
              {content.startTrip}
            </button>
          </section>

          <section className="info-card route-details-card">
            <div className="card-indicator" />

            <div className="route-card-header">
              <div>
                <span className="label-small">{content.currentRoute}</span>
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
                {content.ready}
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-label">{content.startTime}</span>
                <span className="stat-value text-primary">{startTime}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">{content.endTime}</span>
                <span className="stat-value">{endTime}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">{content.totalStops}</span>
                <span className="stat-value text-tertiary">
                  {routeStops.length + 2}
                </span>
              </div>
              <div className="stat-box">
                <span className="stat-label">{content.routeCode}</span>
                <span className="stat-value">{routeDetails.routeCode}</span>
              </div>
            </div>
          </section>

          <section className="quick-stats-row">
            <div className="quick-stat-card">
              <div className="stat-icon-circle bg-orange-light">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f57c00"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="stat-text-group">
                <span className="stat-label">{content.dutyHours}</span>
                <span className="stat-value-large">0h 0m</span>
              </div>
            </div>

            <div className="quick-stat-card">
              <div className="stat-icon-circle bg-teal-light">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#00838f"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
              <div className="stat-text-group">
                <span className="stat-label">{content.routeFlow}</span>
                <span className="stat-value-large">{content.inbound}</span>
              </div>
            </div>
          </section>

          <section className="schedule-section">
            <div className="schedule-header">
              <h3 className="section-title">{content.todaysSchedule}</h3>
            </div>

            <div className="timeline">
              <div className="timeline-item">
                <div className="time-block">
                  <span className="time">{startTime}</span>
                </div>
                <div className="timeline-node bg-blue-light">
                  <span className="text-primary">●</span>
                </div>
                <div className="timeline-content">
                  <h4 className="timeline-title">
                    {content.startRoute}: {routeDetails.departure}
                  </h4>
                  <p className="timeline-desc">
                    {content.firstStop} {routeDetails.departure}
                  </p>
                </div>
              </div>

              {routeStops.map((stop, index) => (
                <div className="timeline-item" key={stop?.id ?? index}>
                  <div className="time-block">
                    <span className="time">Stop {index + 1}</span>
                  </div>
                  <div className="timeline-node bg-gray-light">
                    <span className="text-gray">●</span>
                  </div>
                  <div className="timeline-content">
                    <h4 className="timeline-title">
                      {content.intermediateStop}
                    </h4>
                    <p className="timeline-desc">{stopName(stop)}</p>
                  </div>
                </div>
              ))}

              <div className="timeline-item">
                <div className="time-block">
                  <span className="time">{endTime}</span>
                </div>
                <div className="timeline-node bg-gray-light">
                  <span className="text-gray">●</span>
                </div>
                <div className="timeline-content">
                  <h4 className="timeline-title">
                    {content.endRoute}: {routeDetails.destination}
                  </h4>
                  <p className="timeline-desc">
                    {content.finalStop} {routeDetails.destination}
                  </p>
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