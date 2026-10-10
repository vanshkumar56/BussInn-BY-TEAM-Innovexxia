import { useEffect, useRef, useState } from "react";
import { getStopCoords, haversineMeters } from "../utils/geo";

const MAX_FIX_AGE_MS = 15_000;
const MAX_PLAUSIBLE_SPEED_MS = 55; // ~200 km/h
const REQUIRED_STABLE_MS = 20_000;
const MIN_INSIDE_FIXES = 3;

export function useShiftGate(startStop, radiusM = 1000, maxAccuracyM = 50) {
  const [gate, setGate] = useState({
    status: "locating",
    distance: null,
    accuracy: null,
    position: null,
  });

  const startRef = useRef(null);
  startRef.current = getStopCoords(startStop);

  const anchorRef = useRef(null);
  const insideSinceRef = useRef(null);
  const insideFixesRef = useRef(0);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGate((g) => ({ ...g, status: "unsupported" }));
      return;
    }

    const update = (patch) => setGate((g) => ({ ...g, ...patch }));
    const resetPresence = () => {
      insideSinceRef.current = null;
      insideFixesRef.current = 0;
    };

    const id = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        const now = Date.now();
        const { latitude: lat, longitude: lng, accuracy } = coords;
        const start = startRef.current;

        if (!start) return update({ status: "no_stop" });
        if (now - timestamp > MAX_FIX_AGE_MS) return update({ status: "stale" });
        if (accuracy > maxAccuracyM) {
          return update({ status: "low_accuracy", accuracy: Math.round(accuracy) });
        }

        const prev = anchorRef.current;
        if (prev) {
          const dt = (timestamp - prev.ts) / 1000;
          const jump = haversineMeters(prev.lat, prev.lng, lat, lng);
          if (dt > 0 && jump / dt > MAX_PLAUSIBLE_SPEED_MS) {
            resetPresence();
            return update({ status: "suspicious", accuracy: Math.round(accuracy) });
          }
        }
        anchorRef.current = { lat, lng, ts: timestamp };

        const distance = haversineMeters(lat, lng, start.lat, start.lng);
        const base = {
          distance: Math.round(distance),
          accuracy: Math.round(accuracy),
          position: { latitude: lat, longitude: lng },
        };

        if (distance > radiusM) {
          resetPresence();
          return update({ ...base, status: "too_far" });
        }

        if (insideSinceRef.current === null) insideSinceRef.current = now;
        insideFixesRef.current += 1;

        const stableFor = now - insideSinceRef.current;
        const ready =
          stableFor >= REQUIRED_STABLE_MS &&
          insideFixesRef.current >= MIN_INSIDE_FIXES;

        update({ ...base, status: ready ? "ready" : "verifying" });
      },
      () => update({ status: "error" }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [radiusM, maxAccuracyM]);

  return gate;
}