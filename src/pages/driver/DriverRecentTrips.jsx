import { useEffect, useState } from "react";
import DriverBottomNav from "../../components/DriverBottomNav";
import "../../styles/DriverRecentTrips.css";

const TRIPS_STORAGE_KEY = "driver_completed_trips";

const DriverRecentTrips = () => {
  const [isHindi, setIsHindi] = useState(false);
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    try {
      setIsHindi(localStorage.getItem("bussinn_lang") === "hi");
    } catch {
      setIsHindi(false);
    }
  }, []);

  useEffect(() => {
    const loadCompletedTrips = () => {
      try {
        const savedTrips = JSON.parse(
          localStorage.getItem(TRIPS_STORAGE_KEY) || "[]",
        );

        setTrips(Array.isArray(savedTrips) ? savedTrips : []);
      } catch {
        setTrips([]);
      }
    };

    loadCompletedTrips();

    window.addEventListener("storage", loadCompletedTrips);
    window.addEventListener("driver-completed-trip", loadCompletedTrips);

    return () => {
      window.removeEventListener("storage", loadCompletedTrips);
      window.removeEventListener("driver-completed-trip", loadCompletedTrips);
    };
  }, []);

  const toggleLanguage = () => {
    const newLangState = !isHindi;
    setIsHindi(newLangState);

    try {
      localStorage.setItem("bussinn_lang", newLangState ? "hi" : "en");
    } catch (error) {
      console.warn("Could not save language preference:", error);
    }
  };

  const content = {
    en: {
      title: "Recent Trips",
      subtitle: "View your driving history and completed shift logs.",
      noneTitle: "No Recent Trips",
      noneSubtext:
        "You haven't completed any trips yet. Once you finish a shift, your trip summary will appear here.",
      durationLabel: "Duration",
      stopsLabel: "Stops",
      statusCompleted: "Completed",
    },
    hi: {
      title: "हाल की यात्राएं",
      subtitle: "अपना ड्राइविंग इतिहास और पूर्ण शिफ्ट लॉग देखें।",
      noneTitle: "कोई हालिया यात्रा नहीं",
      noneSubtext:
        "आपने अभी तक कोई यात्रा पूरी नहीं की है। शिफ्ट पूरी करने के बाद आपका यात्रा सारांश यहाँ दिखाई देगा।",
      durationLabel: "अवधि",
      stopsLabel: "स्टॉप",
      statusCompleted: "पूर्ण",
    },
  };

  const t = isHindi ? content.hi : content.en;

  return (
    <div className="mobile-page-container">
      <div className="app-content trips-layout">
        <header className="dash-header">
          <h1 className="brand-title">BussInn</h1>

          <button
            type="button"
            className="btn-lang-pill"
            onClick={toggleLanguage}
            title="Change Language"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="icon-small"
              aria-hidden="true"
            >
              <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
            </svg>
            EN / HI
          </button>
        </header>

        <main className="trips-content">
          <div className="page-heading-block">
            <h2 className="page-title">{t.title}</h2>
            <p className="page-subtitle">{t.subtitle}</p>
          </div>

          {trips.length === 0 ? (
            <div className="empty-state-card">
              <div className="empty-icon-circle">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z" />
                </svg>
              </div>

              <h3 className="empty-title">{t.noneTitle}</h3>
              <p className="empty-desc">{t.noneSubtext}</p>
            </div>
          ) : (
            <div className="trips-list">
              {trips.map((trip) => (
                <div key={trip.id} className="trip-card">
                  <div className="trip-card-header">
                    <span className="trip-code">
                      {trip.routeCode || "Route"}
                    </span>
                    <span className="trip-status-badge">
                      {t.statusCompleted}
                    </span>
                  </div>

                  <div className="trip-route-info">
                    <h4 className="trip-endpoints">
                      {trip.departure || "Starting point"} →{" "}
                      {trip.destination || "Destination"}
                    </h4>
                    <span className="trip-date">{trip.date || ""}</span>
                  </div>

                  <div className="trip-metrics-grid">
                    <div className="metric-item">
                      <span className="metric-label">{t.durationLabel}</span>
                      <span className="metric-value">
                        {trip.duration || "—"}
                      </span>
                    </div>

                    <div className="metric-item">
                      <span className="metric-label">{t.stopsLabel}</span>
                      <span className="metric-value">
                        {Number(trip.stopsCount) || 0} Stops
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <div className="bottom-nav-placeholder">
          <DriverBottomNav />
        </div>
      </div>
    </div>
  );
};

export default DriverRecentTrips;