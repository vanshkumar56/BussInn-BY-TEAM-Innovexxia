
import { Link, useMatchRoute } from "@tanstack/react-router";
import "../styles/DriverBottomNav.css";

const DriverBottomNav = () => {
  const matchRoute = useMatchRoute();

  const isActive = (path) =>
    matchRoute({ to: path }) ? "active-tab" : "";

  const tabs = [
    {
      to: "/driver/dashboard",
      label: "Dashboard",
      icon: (
        <>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </>
      ),
    },
    {
      to: "/driver/recent-trips",
      label: "Trips",
      icon: (
        <>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </>
      ),
    },
    {
      to: "/driver/coins",
      label: "Coins",
      icon: (
        <>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </>
      ),
    },
    {
      to: "/driver/profile",
      label: "Profile",
      icon: (
        <>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </>
      ),
    },
  ];

  const activeIndex = tabs.findIndex(
    (tab) => isActive(tab.to) === "active-tab"
  );

  return (
    <nav
      className="driver-bottom-nav"
      aria-label="Driver navigation"
      style={{ "--driver-active-index": Math.max(activeIndex, 0) }}
    >
      <span className="driver-bottom-nav-indicator" />

      {tabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className={`driver-bottom-nav-item ${
            isActive(tab.to)
          }`}
          aria-current={
            isActive(tab.to) ? "page" : undefined
          }
        >
          <svg
            className="driver-bottom-nav-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {tab.icon}
          </svg>

          <span className="driver-bottom-nav-label">
            {tab.label}
          </span>
        </Link>
      ))}
    </nav>
  );
};

export default DriverBottomNav;
