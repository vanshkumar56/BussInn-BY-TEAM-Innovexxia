import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import AdminBottomNav from "../../components/AdminBottomNav";
import { supabase } from "../../lib/supabase";
import "../../styles/AddBus.css";

const BUS_TYPES = [
  "NON AC ORDINARY",
  "AC JANRATH",
  "AC SLEEPER",
  "NON AC SLEEPER",
];

const createEmptyStop = () => ({
  station_name: "",
  arrival_time: "",
  departure_time: "",
});

const emptyForm = {
  name: "",
  operator: "UPSRTC",
  trip_label: "",
  bus_type: BUS_TYPES[0],
  depot: "",
  bus_number: "",
  service_date: "",
  fare: "",
};

const formatTime = (value) => {
  const m = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return "--:--";
  const hour = Number(m[1]);
  return `${hour % 12 || 12}:${m[2]} ${hour >= 12 ? "PM" : "AM"}`;
};

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

const BackIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const AddBus = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyForm);
  const [stops, setStops] = useState([createEmptyStop(), createEmptyStop()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const setField = (key) => (e) => {
    setForm((previous) => ({ ...previous, [key]: e.target.value }));
    setError("");
  };

  const updateStop = (index, key, value) => {
    setStops((previous) =>
      previous.map((stop, i) => (i === index ? { ...stop, [key]: value } : stop))
    );
    setError("");
  };

  const addStop = () => setStops((previous) => [...previous, createEmptyStop()]);

  const removeStop = (index) => {
    if (stops.length <= 2) return;
    setStops((previous) => previous.filter((_, i) => i !== index));
  };

  const moveStop = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;
    setStops((previous) => {
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Source and destination always come from the first and last stop
  const first = stops[0];
  const last = stops[stops.length - 1];
  const source = first?.station_name.trim() || "";
  const destination = last?.station_name.trim() || "";

  const preview = useMemo(
    () => ({
      boardingTime: first?.departure_time || first?.arrival_time,
      arrivalTime: last?.arrival_time || last?.departure_time,
    }),
    [first, last]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) return setError("Enter the bus name.");
    if (!form.trip_label.trim()) return setError("Enter the trip label.");
    if (!form.depot.trim()) return setError("Enter the depot.");
    if (!form.service_date) return setError("Select the service date.");
    if (form.fare === "" || Number(form.fare) < 0) return setError("Enter a valid fare.");
    if (stops.length < 2) return setError("A bus must have at least two stops.");

    const invalidStop = stops.find(
      (stop) => !stop.station_name.trim() || (!stop.arrival_time && !stop.departure_time)
    );
    if (invalidStop) {
      return setError(
        "Every stop needs a station name and at least an arrival or departure time."
      );
    }

    const formattedStops = stops.map((stop, index) => ({
      stop_order: index + 1,
      station_name: stop.station_name.trim(),
      arrival_time: stop.arrival_time || null,
      departure_time: stop.departure_time || null,
    }));

    try {
      setSaving(true);

      const { data, error: rpcError } = await supabase.rpc("admin_add_bus", {
        p_name: form.name.trim(),
        p_operator: form.operator.trim(),
        p_trip_label: form.trip_label.trim(),
        p_bus_type: form.bus_type.trim(),
        p_depot: form.depot.trim(),
        p_source: source,
        p_destination: destination,
        p_fare: Number(form.fare),
        p_service_date: form.service_date,
        p_bus_number: form.bus_number.trim() || null,
        p_stops: formattedStops,
      });

      if (rpcError) {
        console.error("Add bus error:", rpcError);
        setError(rpcError.message || "Failed to add bus.");
        return;
      }

      // Make sure passengers can see it (the passenger page lists active buses only)
      const newId = Array.isArray(data)
        ? data[0]?.id ?? data[0]
        : typeof data === "object" && data !== null
          ? data.id
          : data;

      if (newId != null) {
        const { error: activeError } = await supabase
          .from("buses")
          .update({ is_active: true })
          .eq("id", newId);
        if (activeError) {
          console.warn("Could not set is_active (the RPC may already do it):", activeError);
        }
      }

      window.dispatchEvent(new Event("bussinn:buses"));
      navigate({ to: "/admin/overview" });
    } catch (err) {
      console.error(err);
      setError("Something went wrong while adding the bus.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="addbus-page">
      <div className="addbus-content">
        <div className="addbus-topbar-card">
          <div className="addbus-brand-group">
            <BusIcon className="addbus-logo-icon" />
            <div className="addbus-title-group">
              <h2>BussInn</h2>
              <p>Your city, connected.</p>
            </div>
          </div>

          <button
            type="button"
            className="addbus-back-btn"
            onClick={() => navigate({ to: "/admin/overview" })}
          >
            <BackIcon />
            Back
          </button>
        </div>

        <h2 className="addbus-section-title">Add New Bus</h2>
        <p className="addbus-section-subtitle">
          Everything you enter here is saved to the database and shown to passengers.
        </p>

        <form onSubmit={handleSubmit} className="addbus-form-card">
          <h3>Bus Information</h3>

          <div className="addbus-form-grid">
            <div className="form-group">
              <label>Bus name</label>
              <input
                className="field"
                value={form.name}
                onChange={setField("name")}
                placeholder="e.g. Anand Vihar - Hamirpur"
              />
            </div>

            <div className="form-group">
              <label>Operator</label>
              <input
                className="field"
                value={form.operator}
                onChange={setField("operator")}
                placeholder="e.g. UPSRTC"
              />
            </div>

            <div className="form-group">
              <label>Trip Label</label>
              <input
                className="field"
                value={form.trip_label}
                onChange={setField("trip_label")}
                placeholder="e.g. HMR0310"
              />
            </div>

            <div className="form-group">
              <label>Bus Type</label>
              <select className="field" value={form.bus_type} onChange={setField("bus_type")}>
                {BUS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Depot</label>
              <input
                className="field"
                value={form.depot}
                onChange={setField("depot")}
                placeholder="e.g. HAMIRPUR"
              />
            </div>

            <div className="form-group">
              <label>Bus Number</label>
              <input
                className="field"
                value={form.bus_number}
                onChange={setField("bus_number")}
                placeholder="Optional"
              />
            </div>

            <div className="form-group">
              <label>Service Date</label>
              <input
                className="field"
                type="date"
                value={form.service_date}
                onChange={setField("service_date")}
              />
            </div>

            <div className="form-group">
              <label>Fare per seat (₹)</label>
              <input
                className="field"
                type="number"
                min="0"
                value={form.fare}
                onChange={setField("fare")}
                placeholder="724"
              />
            </div>
          </div>

          <div className="stops-editor">
            <div className="stops-editor-header">
              <div>
                <h3>Bus Schedule</h3>
                <p>
                  The first stop is the boarding point and the last stop is the
                  destination. Use the same spelling passengers will search.
                </p>
              </div>

              <button type="button" className="btn-add-stop" onClick={addStop}>
                <PlusIcon />
                Add Stop
              </button>
            </div>

            <div className="stop-table">
              <div className="stop-table-header">
                <span>#</span>
                <span>Station Name</span>
                <span>Arrival</span>
                <span>Departure</span>
                <span></span>
              </div>

              {stops.map((stop, index) => (
                <div className="stop-table-row" key={index}>
                  <span className="stop-number">{index + 1}</span>

                  <input
                    className="field"
                    value={stop.station_name}
                    onChange={(e) => updateStop(index, "station_name", e.target.value)}
                    placeholder="Station name"
                  />

                  <input
                    className="field"
                    type="time"
                    value={stop.arrival_time}
                    onChange={(e) => updateStop(index, "arrival_time", e.target.value)}
                  />

                  <input
                    className="field"
                    type="time"
                    value={stop.departure_time}
                    onChange={(e) => updateStop(index, "departure_time", e.target.value)}
                  />

                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      className="btn-remove-stop"
                      onClick={() => moveStop(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-remove-stop"
                      onClick={() => moveStop(index, 1)}
                      disabled={index === stops.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-remove-stop"
                      onClick={() => removeStop(index)}
                      disabled={stops.length <= 2}
                      aria-label="Remove stop"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live preview of what passengers will see */}
          <div
            style={{
              margin: "16px 0",
              padding: 14,
              borderRadius: 14,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
            }}
          >
            <small style={{ color: "#64748b", fontWeight: 700 }}>
              PREVIEW (WHAT PASSENGERS SEE)
            </small>
            <h3 style={{ margin: "6px 0 2px" }}>{form.name || "Bus name"}</h3>
            <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
              {form.operator || "Operator"} · {form.bus_type}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 10,
                gap: 8,
              }}
            >
              <div>
                <small style={{ color: "#64748b" }}>BOARDING</small>
                <div>
                  <strong>{source || "Not set"}</strong>
                </div>
                <div>{formatTime(preview.boardingTime)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <small style={{ color: "#64748b" }}>ARRIVAL</small>
                <div>
                  <strong>{destination || "Not set"}</strong>
                </div>
                <div>{formatTime(preview.arrivalTime)}</div>
              </div>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 13 }}>
              Fare: <strong>{form.fare === "" ? "—" : `₹${form.fare}`}</strong> · Stops:{" "}
              <strong>{stops.length}</strong>
            </p>
          </div>

          {error && <p className="field-error">{error}</p>}

          <div className="addbus-actions-row">
            <button type="submit" className="btn-submit-addbus" disabled={saving}>
              <PlusIcon />
              {saving ? "Adding Bus..." : "Add Bus to Listing"}
            </button>

            <button
              type="button"
              className="btn-cancel-addbus"
              disabled={saving}
              onClick={() => navigate({ to: "/admin/overview" })}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <AdminBottomNav />
    </div>
  );
};

export default AddBus;