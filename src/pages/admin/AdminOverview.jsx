import { useEffect, useState, useCallback } from "react";
import AdminBottomNav from "../../components/AdminBottomNav";
import { supabase } from "../../lib/supabase";
import "../../styles/AdminOverview.css";

let keyCounter = 0;
const newKey = () => `stop-${++keyCounter}`;

const sortedStops = (bus) =>
  [...(bus?.bus_schedule || [])].sort(
    (a, b) => Number(a.stop_order || 0) - Number(b.stop_order || 0)
  );

// "HH:MM:SS" or "HH:MM" -> "HH:MM" (what <input type="time"> needs)
const toHHMM = (value) => {
  const m = String(value || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

const formatTime = (value) => {
  const m = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return "--:--";
  const hour = Number(m[1]);
  return `${hour % 12 || 12}:${m[2]} ${hour >= 12 ? "PM" : "AM"}`;
};

const normalizeBus = (bus) => {
  const stops = sortedStops(bus);
  const first = stops[0];
  const last = stops[stops.length - 1];

  return {
    ...bus,
    stops,
    displayName: bus.name || bus.bus_name || `Bus #${bus.id}`,
    departStop: first?.station_name || bus.source || "",
    arriveStop: last?.station_name || bus.destination || "",
    startTime: toHHMM(first?.departure_time || first?.arrival_time || bus.departure_time),
    arrivalTime: toHHMM(last?.arrival_time || last?.departure_time || bus.arrival_time),
    fare: bus.fare,
  };
};

const routeCss = `
.rt-stop { background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:12px; margin-bottom:10px; }
.rt-stop-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.rt-badge { font-size:12px; font-weight:700; color:#1d4ed8; background:#e0ecff; border-radius:999px; padding:3px 10px; }
.rt-tools { display:flex; gap:6px; }
.rt-btn { border:1px solid #cbd5e1; background:#fff; border-radius:8px; width:32px; height:32px; cursor:pointer; font-size:14px; }
.rt-btn:disabled { opacity:.35; cursor:default; }
.rt-btn.danger { color:#dc2626; border-color:#fecaca; background:#fef2f2; }
.rt-field label { display:block; font-size:12px; font-weight:600; color:#64748b; margin-bottom:4px; }
.rt-field input { width:100%; box-sizing:border-box; padding:9px; border:1px solid #cbd5e1; border-radius:10px; font-size:15px; }
.rt-times { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px; }
.rt-add { width:100%; padding:11px; border:2px dashed #94a3b8; background:transparent; border-radius:12px; font-weight:700; color:#334155; cursor:pointer; margin-bottom:12px; }
.rt-msg { padding:10px 12px; border-radius:10px; margin-bottom:10px; font-size:14px; background:#fef2f2; color:#b91c1c; }
`;

const BusIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 16c0 .74.4 1.38 1 1.72V19a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.28c.6-.34 1-.98 1-1.72V6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10Z"
      fill="currentColor"
    />
    <rect x="6" y="5.5" width="12" height="5" rx="1" fill="white" />
    <circle cx="7.5" cy="16.5" r="1.25" fill="white" />
    <circle cx="16.5" cy="16.5" r="1.25" fill="white" />
  </svg>
);

const RouteIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="19" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    <path
      d="M6.8 7.6c0 4 2 4 5.2 6 3.2 2 5.2 2 5.2 2.4"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeDasharray="2.5 2.5"
    />
  </svg>
);

const EditIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const TrashIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7h12Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const FleetIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="6" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M17 9h2.4L21 12v3h-4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="8" cy="17" r="1.6" fill="currentColor" />
    <circle cx="18" cy="17" r="1.6" fill="currentColor" />
  </svg>
);

const PinIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const AdminOverview = () => {
  const [buses, setBuses] = useState([]);
  const [editingBus, setEditingBus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // route editor state
  const [routeBus, setRouteBus] = useState(null);
  const [routeStops, setRouteStops] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeError, setRouteError] = useState("");

  const loadBuses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("buses")
        .select("*, bus_schedule(*)")
        .order("id", { ascending: true });

      if (error) throw error;

      setBuses((data || []).map(normalizeBus));
      setErrorMessage("");
    } catch (e) {
      console.error("Error loading buses:", e);
      setErrorMessage("Could not load buses from the database.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBuses();
    window.addEventListener("bussinn:buses", loadBuses);
    return () => window.removeEventListener("bussinn:buses", loadBuses);
  }, [loadBuses]);

  /* ---------- delete bus ---------- */
  const handleDelete = async (bus) => {
    if (!bus?.id) return;
    if (!window.confirm(`Delete ${bus.displayName}? This cannot be undone.`)) return;

    try {
      const { error: stopsError } = await supabase
        .from("bus_schedule")
        .delete()
        .eq("bus_id", bus.id);
      if (stopsError) throw stopsError;

      const { data, error } = await supabase
        .from("buses")
        .delete()
        .eq("id", bus.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No row deleted. Check Supabase row-level security.");
      }

      await loadBuses();
    } catch (error) {
      console.error("DELETE ERROR:", error);
      setErrorMessage(`Could not delete the bus: ${error.message}`);
    }
  };

  /* ---------- edit bus ---------- */
  const handleSaveBus = async (e) => {
    e.preventDefault();
    if (!editingBus || saving) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("buses")
        .update({
          name: editingBus.displayName,
          operator: editingBus.operator || null,
          fare: editingBus.fare === "" || editingBus.fare == null ? null : Number(editingBus.fare),
        })
        .eq("id", editingBus.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No row updated. Check Supabase row-level security.");
      }

      await loadBuses();
      setEditingBus(null);
    } catch (error) {
      console.error("ERROR UPDATING BUS:", error);
      setErrorMessage(`Could not update the bus: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  /* ---------- edit route (popup inside this page) ---------- */
  const openRoute = (bus) => {
    setRouteBus(bus);
    setRouteStops(
      bus.stops.map((s) => ({
        key: newKey(),
        id: s.id,
        station_name: s.station_name || "",
        arrival_time: toHHMM(s.arrival_time),
        departure_time: toHHMM(s.departure_time),
      }))
    );
    setRemovedIds([]);
    setRouteError("");
  };

  const closeRoute = () => {
    if (routeSaving) return;
    setRouteBus(null);
    setRouteStops([]);
    setRemovedIds([]);
    setRouteError("");
  };

  const updateStop = (key, field, value) => {
    setRouteStops((current) =>
      current.map((s) => (s.key === key ? { ...s, [field]: value } : s))
    );
    setRouteError("");
  };

  const addStop = () => {
    setRouteStops((current) => [
      ...current,
      { key: newKey(), id: null, station_name: "", arrival_time: "", departure_time: "" },
    ]);
    setRouteError("");
  };

  const removeStop = (stop) => {
    if (routeStops.length <= 2) {
      setRouteError("A route needs at least 2 stops.");
      return;
    }
    if (stop.id) setRemovedIds((current) => [...current, stop.id]);
    setRouteStops((current) => current.filter((s) => s.key !== stop.key));
    setRouteError("");
  };

  const moveStop = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= routeStops.length) return;
    setRouteStops((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSaveRoute = async () => {
    if (routeSaving || !routeBus) return;

    if (routeStops.length < 2) {
      setRouteError("A route needs at least 2 stops.");
      return;
    }
    if (routeStops.some((s) => !s.station_name.trim())) {
      setRouteError("Every stop needs a name.");
      return;
    }

    setRouteSaving(true);
    setRouteError("");

    try {
      // 1. delete removed stops
      if (removedIds.length > 0) {
        const { data, error } = await supabase
          .from("bus_schedule")
          .delete()
          .in("id", removedIds)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("No stop deleted. Check Supabase row-level security.");
        }
      }

      // 2. update existing stops, insert new ones, in the new order
      for (let i = 0; i < routeStops.length; i++) {
        const s = routeStops[i];
        const payload = {
          stop_order: i + 1,
          station_name: s.station_name.trim(),
          arrival_time: s.arrival_time || null,
          departure_time: s.departure_time || null,
        };

        if (s.id) {
          const { data, error } = await supabase
            .from("bus_schedule")
            .update(payload)
            .eq("id", s.id)
            .select();
          if (error) throw error;
          if (!data || data.length === 0) {
            throw new Error("No stop updated. Check Supabase row-level security.");
          }
        } else {
          const { error } = await supabase
            .from("bus_schedule")
            .insert({ ...payload, bus_id: routeBus.id })
            .select();
          if (error) throw error;
        }
      }

      // 3. keep the bus row in step with its first and last stop
      const first = routeStops[0];
      const last = routeStops[routeStops.length - 1];
      const { error: busError } = await supabase
        .from("buses")
        .update({
          source: first.station_name.trim(),
          destination: last.station_name.trim(),
          departure_time: first.departure_time || first.arrival_time || null,
          arrival_time: last.arrival_time || last.departure_time || null,
        })
        .eq("id", routeBus.id);
      if (busError) throw busError;

      await loadBuses();
      setRouteBus(null);
      setRouteStops([]);
      setRemovedIds([]);
    } catch (error) {
      console.error("Route save error:", error);
      setRouteError(`Could not save route: ${error.message}`);
    } finally {
      setRouteSaving(false);
    }
  };

  const totalStops = buses.reduce((n, b) => n + b.stops.length, 0);

  return (
    <div className="admin-choice-page">
      <style>{routeCss}</style>
      <div className="app-content admin-overview-layout">
        <div className="admin-topbar-card">
          <div className="admin-brand-group">
            <BusIcon className="admin-logo-icon" />
            <div className="admin-title-group">
              <h2>BussInn</h2>
              <p>Your city, connected.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            style={{
              backgroundColor: "#fee2e2",
              color: "#dc2626",
              border: "1px solid #fecaca",
              padding: "6px 14px",
              borderRadius: "20px",
              fontWeight: "650",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Log Out
          </button>
        </div>

        <div className="stat-grid-cards">
          <div className="stat-box-card">
            <div className="stat-box-icon"><FleetIcon /></div>
            <div className="stat-box-text">
              <strong>{buses.length}</strong>
              <span>Buses Listed</span>
            </div>
          </div>
          <div className="stat-box-card">
            <div className="stat-box-icon"><PinIcon /></div>
            <div className="stat-box-text">
              <strong>{totalStops}</strong>
              <span>Route Stops</span>
            </div>
          </div>
        </div>

        <h2 className="section-header-title">Fleet Management Directory</h2>

        {errorMessage && (
          <p className="empty-state-box" role="alert" style={{ color: "#dc2626" }}>
            {errorMessage}
          </p>
        )}

        {loading ? (
          <p className="empty-state-box">Loading buses…</p>
        ) : buses.length === 0 ? (
          <p className="empty-state-box">
            No buses registered yet. Add one from the menu below.
          </p>
        ) : (
          <div className="admin-buses-stack">
            {buses.map((bus) => (
              <div key={bus.id} className="admin-bus-card">
                <div className="bus-card-header-row">
                  <div className="bus-identity">
                    <div className="small-bus-icon">
                      <BusIcon />
                    </div>
                    <div>
                      <h3>{bus.displayName}</h3>
                      {bus.operator && <div className="bus-operator">{bus.operator}</div>}
                    </div>
                  </div>
                  <div className="bus-price-tag">
                    {bus.fare == null ? "—" : `₹${bus.fare}`}
                  </div>
                </div>

                <div className="bus-route-inner-box">
                  <div className="route-endpoint">
                    <span className="endpoint-label">DEPARTURE</span>
                    <div className="endpoint-city">{bus.departStop || "Not set"}</div>
                    <div className="endpoint-time">{formatTime(bus.startTime)}</div>
                  </div>

                  <div className="route-arrow-icon"><span>➔</span></div>

                  <div className="route-endpoint right">
                    <span className="endpoint-label">ARRIVAL</span>
                    <div className="endpoint-city">{bus.arriveStop || "Not set"}</div>
                    <div className="endpoint-time">{formatTime(bus.arrivalTime)}</div>
                  </div>
                </div>

                <div className="bus-card-actions-row">
                  <button
                    onClick={() => openRoute(bus)}
                    className="btn-admin-action outline"
                    type="button"
                  >
                    <RouteIcon /> Edit Route
                  </button>
                  <button
                    onClick={() => setEditingBus({ ...bus })}
                    className="btn-admin-action primary"
                    type="button"
                  >
                    <EditIcon /> Edit Bus
                  </button>
                  <button
                    onClick={() => handleDelete(bus)}
                    className="btn-admin-action danger"
                    type="button"
                  >
                    <TrashIcon /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* EDIT BUS MODAL */}
        {editingBus && (
          <div className="admin-modal-overlay">
            <div className="admin-modal-card">
              <h3>Edit Bus Listing</h3>
              <form onSubmit={handleSaveBus} className="admin-form-grid">
                <div className="form-group">
                  <label>Bus name</label>
                  <input
                    type="text"
                    value={editingBus.displayName || ""}
                    onChange={(e) =>
                      setEditingBus({ ...editingBus, displayName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Operator</label>
                  <input
                    type="text"
                    value={editingBus.operator || ""}
                    onChange={(e) =>
                      setEditingBus({ ...editingBus, operator: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Fare (₹)</label>
                  <input
                    type="number"
                    value={editingBus.fare ?? ""}
                    onChange={(e) =>
                      setEditingBus({ ...editingBus, fare: e.target.value })
                    }
                  />
                </div>

                <p style={{ fontSize: 13, opacity: 0.7, gridColumn: "1 / -1" }}>
                  Cities and times come from the route. Use “Edit Route” to change them.
                </p>

                <div className="modal-buttons-row">
                  <button type="submit" className="btn-submit-modal" disabled={saving}>
                    {saving ? "Saving…" : "Update Bus Listing"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBus(null)}
                    className="btn-cancel-modal"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* EDIT ROUTE MODAL */}
        {routeBus && (
          <div className="admin-modal-overlay">
            <div
              className="admin-modal-card"
              style={{ maxHeight: "90vh", overflowY: "auto" }}
            >
              <h3>Edit Route · {routeBus.displayName}</h3>

              {routeError && (
                <div className="rt-msg" role="alert">
                  {routeError}
                </div>
              )}

              {routeStops.map((stop, index) => (
                <div className="rt-stop" key={stop.key}>
                  <div className="rt-stop-head">
                    <span className="rt-badge">
                      {index === 0
                        ? "Stop 1 · Boarding"
                        : index === routeStops.length - 1
                          ? `Stop ${index + 1} · Destination`
                          : `Stop ${index + 1}`}
                    </span>
                    <div className="rt-tools">
                      <button
                        type="button"
                        className="rt-btn"
                        onClick={() => moveStop(index, -1)}
                        disabled={index === 0}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="rt-btn"
                        onClick={() => moveStop(index, 1)}
                        disabled={index === routeStops.length - 1}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="rt-btn danger"
                        onClick={() => removeStop(stop)}
                        aria-label="Remove stop"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="rt-field">
                    <label>Stop name</label>
                    <input
                      type="text"
                      value={stop.station_name}
                      onChange={(e) => updateStop(stop.key, "station_name", e.target.value)}
                      placeholder="e.g. Kanpur Bus Stand"
                    />
                  </div>

                  <div className="rt-times">
                    <div className="rt-field">
                      <label>Arrival time</label>
                      <input
                        type="time"
                        value={stop.arrival_time}
                        onChange={(e) => updateStop(stop.key, "arrival_time", e.target.value)}
                      />
                    </div>
                    <div className="rt-field">
                      <label>Departure time</label>
                      <input
                        type="time"
                        value={stop.departure_time}
                        onChange={(e) => updateStop(stop.key, "departure_time", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button type="button" className="rt-add" onClick={addStop}>
                + Add stop
              </button>

              <div className="modal-buttons-row">
                <button
                  type="button"
                  className="btn-submit-modal"
                  onClick={handleSaveRoute}
                  disabled={routeSaving}
                >
                  {routeSaving ? "Saving…" : "Save Route"}
                </button>
                <button
                  type="button"
                  className="btn-cancel-modal"
                  onClick={closeRoute}
                  disabled={routeSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <AdminBottomNav />
      </div>
    </div>
  );
};

export default AdminOverview;