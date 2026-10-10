import { useEffect, useState, useCallback, useMemo } from "react";
import { BusFront, X, Route as RouteIcon } from "lucide-react";
import AdminBottomNav from "../../components/AdminBottomNav";
import { supabase } from "../../lib/supabase";
import "../../styles/AdminOverview.css";

let keyCounter = 0;
const newKey = () => `stop-${++keyCounter}`;

const norm = (v) => String(v || "").trim().toLowerCase();

const toHHMM = (value) => {
  const m = String(value || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

const sortedStops = (bus) =>
  [...(bus?.bus_schedule || [])].sort(
    (a, b) => Number(a.stop_order || 0) - Number(b.stop_order || 0)
  );

const normalizeBus = (bus) => {
  const stops = sortedStops(bus);
  return {
    ...bus,
    stops,
    displayName: bus.name || bus.bus_name || `Bus #${bus.id}`,
    departStop: stops[0]?.station_name || bus.source || "",
    arriveStop: stops[stops.length - 1]?.station_name || bus.destination || "",
  };
};

const css = `
.rt-stop { background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:12px; margin-bottom:10px; }
.rt-stop-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.rt-badge { font-size:12px; font-weight:700; color:#1d4ed8; background:#e0ecff; border-radius:999px; padding:3px 10px; }
.rt-tools { display:flex; gap:6px; }
.rt-btn { border:1px solid #cbd5e1; background:#fff; border-radius:8px; width:32px; height:32px; cursor:pointer; font-size:14px; }
.rt-btn:disabled { opacity:.35; cursor:default; }
.rt-btn.danger { color:#dc2626; border-color:#fecaca; background:#fef2f2; }
.rt-field label { display:block; font-size:12px; font-weight:600; color:#64748b; margin-bottom:4px; }
.rt-field input, .rt-field textarea { width:100%; box-sizing:border-box; padding:9px; border:1px solid #cbd5e1; border-radius:10px; font-size:15px; font-family:inherit; }
.rt-times { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px; }
.rt-add { width:100%; padding:11px; border:2px dashed #94a3b8; background:transparent; border-radius:12px; font-weight:700; color:#334155; cursor:pointer; margin-bottom:12px; }
.rt-msg { padding:10px 12px; border-radius:10px; margin-bottom:10px; font-size:14px; background:#fef2f2; color:#b91c1c; }
.rt-cancelled { font-size:11px; background:#fee2e2; color:#b91c1c; padding:4px 8px; border-radius:99px; font-weight:700; }
.rt-actions { display:flex; gap:8px; margin-top:12px; }
.rt-action { flex:1; padding:10px; border-radius:12px; font-weight:700; font-size:14px; cursor:pointer; border:1px solid #cbd5e1; background:#fff; color:#0f172a; }
.rt-action.cancel { background:#fef2f2; color:#b91c1c; border-color:#fecaca; }
.rt-action.restore { background:#ecfdf5; color:#047857; border-color:#a7f3d0; }
`;

const AddRoute = () => {
  const [buses, setBuses] = useState([]);
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  // route editor
  const [routeBus, setRouteBus] = useState(null);
  const [routeStops, setRouteStops] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeError, setRouteError] = useState("");

  // cancel dialog
  const [cancelBus, setCancelBus] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  const loadBuses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("buses")
        .select("*, bus_schedule(*)")
        .order("id", { ascending: true });
      if (error) throw error;
      setBuses((data || []).map(normalizeBus));
      setPageError("");
    } catch (e) {
      console.error("Error loading buses:", e);
      setPageError("Could not load buses from the database.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBuses();
    window.addEventListener("bussinn:buses", loadBuses);
    return () => window.removeEventListener("bussinn:buses", loadBuses);
  }, [loadBuses]);

  // Matches if the boarding stop appears before the drop stop on the route
  const filteredBuses = useMemo(() => {
    const from = norm(searchFrom);
    const to = norm(searchTo);
    if (!from && !to) return buses;

    return buses.filter((bus) => {
      const names = bus.stops.length
        ? bus.stops.map((s) => norm(s.station_name))
        : [norm(bus.departStop), norm(bus.arriveStop)];

      const fromIdx = from ? names.findIndex((n) => n.includes(from)) : 0;
      if (fromIdx < 0) return false;
      if (!to) return true;

      const toIdx = names.findIndex((n, i) => i > fromIdx && n.includes(to));
      return toIdx > fromIdx;
    });
  }, [buses, searchFrom, searchTo]);

  /* ---------- edit route ---------- */
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
    setRouteStops((cur) => cur.map((s) => (s.key === key ? { ...s, [field]: value } : s)));
    setRouteError("");
  };

  const addStop = () => {
    setRouteStops((cur) => [
      ...cur,
      { key: newKey(), id: null, station_name: "", arrival_time: "", departure_time: "" },
    ]);
    setRouteError("");
  };

  const removeStop = (stop) => {
    if (routeStops.length <= 2) {
      setRouteError("A route needs at least 2 stops.");
      return;
    }
    if (stop.id) setRemovedIds((cur) => [...cur, stop.id]);
    setRouteStops((cur) => cur.filter((s) => s.key !== stop.key));
    setRouteError("");
  };

  const moveStop = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= routeStops.length) return;
    setRouteStops((cur) => {
      const next = [...cur];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSaveRoute = async () => {
    if (routeSaving || !routeBus) return;

    if (routeStops.length < 2) return setRouteError("A route needs at least 2 stops.");
    if (routeStops.some((s) => !s.station_name.trim()))
      return setRouteError("Every stop needs a name.");

    setRouteSaving(true);
    setRouteError("");

    try {
      if (removedIds.length > 0) {
        const { data, error } = await supabase
          .from("bus_schedule")
          .delete()
          .in("id", removedIds)
          .select();
        if (error) throw error;
        if (!data || data.length === 0)
          throw new Error("No stop deleted. Check Supabase row-level security.");
      }

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
          if (!data || data.length === 0)
            throw new Error("No stop updated. Check Supabase row-level security.");
        } else {
          const { error } = await supabase
            .from("bus_schedule")
            .insert({ ...payload, bus_id: routeBus.id })
            .select();
          if (error) throw error;
        }
      }

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
      window.dispatchEvent(new Event("bussinn:buses"));
      closeRouteForce();
    } catch (error) {
      console.error("Route save error:", error);
      setRouteError(`Could not save route: ${error.message}`);
    } finally {
      setRouteSaving(false);
    }
  };

  const closeRouteForce = () => {
    setRouteBus(null);
    setRouteStops([]);
    setRemovedIds([]);
    setRouteError("");
  };

  /* ---------- cancel / restore ---------- */
  const openCancel = (bus) => {
    setCancelBus(bus);
    setCancelReason("");
  };

  const setCancelled = async (bus, cancelled, reason) => {
    setCancelSaving(true);
    try {
      const { data, error } = await supabase
        .from("buses")
        .update({
          is_cancelled: cancelled,
          cancel_reason: cancelled ? reason.trim() || null : null,
        })
        .eq("id", bus.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error("No row updated. Check Supabase row-level security.");

      await loadBuses();
      window.dispatchEvent(new Event("bussinn:buses"));
      setCancelBus(null);
    } catch (error) {
      console.error("Cancel error:", error);
      setPageError(`Could not update the bus status: ${error.message}`);
      setCancelBus(null);
    } finally {
      setCancelSaving(false);
    }
  };

  return (
    <div className="admin-choice-page">
      <style>{css}</style>
      <div className="app-content admin-overview-layout">
       
<div className="admin-topbar-card">
  <div className="admin-brand-group">
    <div className="admin-logo-box" aria-label="BussInn logo">
      <BusFront
        size={22}
        color="#0052cc"
        strokeWidth={2.2}
        aria-hidden="true"
      />
    </div>

    <div className="admin-title-group">
      <h2 className="brand-title-text">BussInn</h2>
      <p className="brand-subtitle-text">
        Your city, connected.
      </p>
    </div>
  </div>

  <button
    type="button"
    className="admin-close-btn"
    onClick={() => window.history.back()}
    aria-label="Close"
  >
    <X size={18} color="#333333" />
  </button>
</div>


        <h1 className="section-header-title" style={{ fontSize: "18px", marginBottom: "4px" }}>
          Route Management
        </h1>
        <p className="modal-subtitle" style={{ marginBottom: "16px" }}>
          Edit stops and times, or cancel a bus. Changes are saved to the database and shown
          to passengers.
        </p>

        <div className="admin-bus-card" style={{ padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div className="form-group" style={{ width: "100%" }}>
              <label>Boarding Point</label>
              <input
                type="text"
                placeholder="e.g. Anand Vihar"
                value={searchFrom}
                onChange={(e) => setSearchFrom(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ width: "100%" }}>
              <label>Drop Point</label>
              <input
                type="text"
                placeholder="e.g. Hamirpur"
                value={searchTo}
                onChange={(e) => setSearchTo(e.target.value)}
              />
            </div>
            {(searchFrom || searchTo) && (
              <button
                type="button"
                onClick={() => {
                  setSearchFrom("");
                  setSearchTo("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#0052cc",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  textAlign: "left",
                  padding: "0",
                }}
              >
                Clear Filters ✕
              </button>
            )}
          </div>
        </div>

        {pageError && (
          <p className="empty-state-box" role="alert" style={{ color: "#dc2626" }}>
            {pageError}
          </p>
        )}

        {loading ? (
          <p className="empty-state-box">Loading routes…</p>
        ) : filteredBuses.length === 0 ? (
          <p className="empty-state-box">No routes match your search criteria.</p>
        ) : (
          <div className="admin-buses-stack">
            {filteredBuses.map((bus) => (
              <div
                key={bus.id}
                className="admin-bus-card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  opacity: bus.is_cancelled ? 0.85 : 1,
                }}
              >
                <div className="bus-card-header-row">
                  <div className="bus-identity">
                    <div className="small-bus-icon">
                      <RouteIcon size={16} color="#0052cc" />
                    </div>
                    <h3 style={{ color: "#1a1c1f" }}>{bus.displayName}</h3>
                  </div>
                  {bus.is_cancelled ? (
                    <span className="rt-cancelled">CANCELLED</span>
                  ) : (
                    <span
                      style={{
                        fontSize: "11px",
                        backgroundColor: "#e6f0ff",
                        color: "#0052cc",
                        padding: "4px 8px",
                        borderRadius: "99px",
                        fontWeight: "700",
                      }}
                    >
                      {bus.stops.length} Stops
                    </span>
                  )}
                </div>

                <div className="bus-route-inner-box" style={{ margin: 0 }}>
                  <div className="route-endpoint">
                    <span className="endpoint-label">Boarding</span>
                    <div className="endpoint-city">{bus.departStop || "Not set"}</div>
                  </div>
                  <div className="route-arrow-icon">➔</div>
                  <div className="route-endpoint right">
                    <span className="endpoint-label">Drop</span>
                    <div className="endpoint-city">{bus.arriveStop || "Not set"}</div>
                  </div>
                </div>

                {bus.is_cancelled && bus.cancel_reason && (
                  <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>
                    Reason: {bus.cancel_reason}
                  </p>
                )}

                <div className="rt-actions">
                  <button type="button" className="rt-action" onClick={() => openRoute(bus)}>
                    Edit Route
                  </button>
                  {bus.is_cancelled ? (
                    <button
                      type="button"
                      className="rt-action restore"
                      onClick={() => setCancelled(bus, false)}
                      disabled={cancelSaving}
                    >
                      Restore Bus
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rt-action cancel"
                      onClick={() => openCancel(bus)}
                    >
                      Cancel Bus
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* EDIT ROUTE MODAL */}
        {routeBus && (
          <div className="admin-modal-overlay">
            <div className="admin-modal-card" style={{ maxHeight: "90vh", overflowY: "auto" }}>
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

        {/* CANCEL BUS MODAL */}
        {cancelBus && (
          <div className="admin-modal-overlay">
            <div className="admin-modal-card">
              <h3>Cancel {cancelBus.displayName}?</h3>
              <p style={{ fontSize: 14, color: "#64748b" }}>
                Passengers will see this bus as cancelled and won't be able to track it.
              </p>
              <div className="rt-field">
                <label>Reason (optional)</label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Bus breakdown"
                />
              </div>
              <div className="modal-buttons-row" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn-submit-modal"
                  style={{ background: "#dc2626" }}
                  onClick={() => setCancelled(cancelBus, true, cancelReason)}
                  disabled={cancelSaving}
                >
                  {cancelSaving ? "Saving…" : "Cancel This Bus"}
                </button>
                <button
                  type="button"
                  className="btn-cancel-modal"
                  onClick={() => setCancelBus(null)}
                  disabled={cancelSaving}
                >
                  Keep Bus
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

export default AddRoute;