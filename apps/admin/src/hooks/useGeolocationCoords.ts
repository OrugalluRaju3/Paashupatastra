import { useCallback, useState } from "react";

export type GeoStatus = "idle" | "locating" | "ready" | "error";

export function formatCoord(n: number) {
  return n.toFixed(6);
}

export function useGeolocationCoords() {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [error, setError] = useState("");

  const capture = useCallback((opts?: { force?: boolean }) => {
    return new Promise<{ latitude: string; longitude: string } | null>((resolve) => {
      if (!navigator.geolocation) {
        setStatus("error");
        setError("Location is not supported in this browser. Enter coordinates manually.");
        resolve(null);
        return;
      }

      setStatus("locating");
      setError("");

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const latitude = formatCoord(pos.coords.latitude);
          const longitude = formatCoord(pos.coords.longitude);
          setStatus("ready");
          resolve({ latitude, longitude });
        },
        (err) => {
          setStatus("error");
          setError(
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied. Allow location access or enter coordinates manually."
              : "Could not detect location. Try again or enter coordinates manually.",
          );
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: opts?.force ? 0 : 10_000,
        },
      );
    });
  }, []);

  return { status, error, capture, setStatus, setError };
}
