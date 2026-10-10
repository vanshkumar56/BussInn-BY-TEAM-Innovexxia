import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import DriverBottomNav from "../../components/DriverBottomNav";
import "../../styles/DriverLiveTracking.css";

const DEFAULT_ROUTE = {
  departure: "Central Station",
  destination: "North Terminal",
  routeCode: "RTE-42A",
  stops: [],
};

const DriverLiveTracking = () => {
  const navigate = useNavigate();

  const [isHindi, setIsHindi] = useState(false);
  const [routeInfo, setRouteInfo] = useState(DEFAULT_ROUTE);
  const [currentStopIndex] = useState(0);
  const [gpsStatus, setGpsStatus] = useState("Waiting for GPS...");

  useEffect(() => {
    try {
      setIsHindi(localStorage.getItem("bussinn_lang") === "hi");

      const savedConfig = localStorage.getItem("driver_route_config");
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);

        setRouteInfo({
          ...DEFAULT_ROUTE,
          ...parsed,
          stops: Array.isArray(parsed.stops) ? parsed.stops : [],
        });
      }
    } catch (error) {
      console.error("Failed to load driver route configuration:", error);
    }

    if (!navigator.geolocation) {
      setGpsStatus("GPS is not supported by this browser");
      return;
    }

    setGpsStatus("Getting your location...");

    const watchId = navigator.geolocation.watchPosition(
      () => setGpsStatus("GPS Active"),
      (error) => {
        console.error("GPS Error:", error);

        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGpsStatus("Location permission denied");
            break;
          case error.POSITION_UNAVAILABLE:
            setGpsStatus("Location unavailable");
            break;
          case error.TIMEOUT:
            setGpsStatus("GPS timeout");
            break;
          default:
            setGpsStatus("GPS error");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const toggleLanguage = () => {
    const nextIsHindi = !isHindi;
    setIsHindi(nextIsHindi);

    try {
      localStorage.setItem("bussinn_lang", nextIsHindi ? "hi" : "en");
    } catch (error) {
      console.error("Failed to save language preference:", error);
    }
  };

  const text = isHindi
    ? {
        title: "लाइव रूट ट्रैकिंग",
        subtext: "यात्रियों को बस की लाइव लोकेशन दिखाई जा रही है...",
        endTrip: "यात्रा समाप्त करें",
        routeDetails: "रूट और स्टॉप प्रगति",
        departure: "प्रस्थान",
        destination: "गंतव्य",
        passed: "पार कर लिया",
        current: "वर्तमान स्टॉप",
        upcoming: "आगामी",
        scroll: "रूट और स्टॉप देखने के लिए नीचे स्क्रॉल करें",
      }
    : {
        title: "Live Route Tracking",
        subtext: "Broadcasting live bus location to passengers...",
        endTrip: "End Trip",
        routeDetails: "Route & Stop Progress",
        departure: "Departure",
        destination: "Destination",
        passed: "Passed",
        current: "Current Stop",
        upcoming: "Upcoming",
        scroll: "Scroll down for route & stops",
      };

  const allStops = [
    { name: routeInfo.departure, type: "departure" },
    ...routeInfo.stops.map((stop) => ({
      name:
        typeof stop === "string"
          ? stop
          : stop?.station_name || stop?.name || "Stop",
      type: "intermediate",
    })),
    { name: routeInfo.destination, type: "destination" },
  ];

  return (
    <div className="mobile-page-container">
      <div className="app-content tracking-layout">
        <header className="dash-header">
          <h1 className="brand-title">BussInn</h1>
          <button
            className="btn-lang-pill"
            onClick={toggleLanguage}
            type="button"
            aria-label="Change language"
          >
            EN / HI
          </button>
        </header>

        <h2>{text.title}</h2>
        <p>{text.subtext}</p>

        <section className="map-viewport-section">
          <div className="map-overlay-badge">
            <span className="live-pulsing-dot" />
            <span>
              {routeInfo.routeCode} • {gpsStatus}
            </span>
          </div>

          <div className="map-canvas-placeholder">
            <p>{gpsStatus}</p>
          </div>

          <div className="map-bottom-sheet-handle">
            <span />
            <p>{text.scroll}</p>
          </div>
        </section>

        <section className="route-details-scroll-section">
          <div className="section-title-row">
            <h3 className="section-heading">{text.routeDetails}</h3>
            <span className="route-code-pill">{routeInfo.routeCode}</span>
          </div>

          <div className="live-timeline">
            {allStops.map((stop, index) => {
              const isPassed = index < currentStopIndex;
              const isCurrent = index === currentStopIndex;

              const status = isPassed
                ? text.passed
                : isCurrent
                  ? text.current
                  : text.upcoming;

              const type =
                stop.type === "departure"
                  ? text.departure
                  : stop.type === "destination"
                    ? text.destination
                    : `Stop ${index}`;

              return (
                <div
                  key={`${stop.type}-${index}`}
                  className={`live-timeline-node-item ${
                    isPassed ? "passed" : ""
                  } ${isCurrent ? "active" : ""}`}
                >
                  <div className="node-marker-wrapper">
                    <div className="node-dot" />
                    {index < allStops.length - 1 && (
                      <div className="node-line" />
                    )}
                  </div>

                  <div className="node-content-box">
                    <div className="node-top-row">
                      <h4 className="stop-title-text">{stop.name}</h4>
                      <span
                        className={`stop-status-tag ${
                          isCurrent ? "tag-active" : ""
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                    <span className="stop-type-subtext">{type}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="tracking-bottom-actions">
            <button
              onClick={() => navigate({ to: "/driver/recent-trips" })}
              className="btn-end-trip-action"
              type="button"
            >
              {text.endTrip}
            </button>
          </div>
        </section>

        <div className="bottom-nav-placeholder">
          <DriverBottomNav />
        </div>
      </div>
    </div>
  );
};

export default DriverLiveTracking;