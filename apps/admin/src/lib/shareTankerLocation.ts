import { api } from "../api";
import { createTankerSocket } from "./tankerSocket";
import type { Socket } from "socket.io-client";

export type ShareLocationHandle = {
  stop: () => void;
};

type Options = {
  orderId: string | number;
  onStatus: (message: string) => void;
  onError?: (message: string) => void;
  onFirstFix?: (latitude: number, longitude: number) => void;
};

function geoErrorMessage(err: GeolocationPositionError) {
  if (err.code === err.PERMISSION_DENIED) {
    return "Location permission denied. Allow location access in the browser and try again.";
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return "GPS unavailable. Check device location services and try again.";
  }
  if (err.code === err.TIMEOUT) {
    return "Location timed out. Move near a window or retry.";
  }
  return err.message || "Unable to read GPS";
}

/**
 * Share live driver location for a tanker order (REST + optional socket).
 * Uses a fast first fix, then continuous watch — works without high-accuracy GPS.
 */
export function startTankerLocationShare(options: Options): ShareLocationHandle {
  const orderId = String(options.orderId);
  let stopped = false;
  let watchId: number | null = null;
  let socket: Socket | null = null;
  let lastPostedAt = 0;
  let firstSent = false;

  options.onStatus("Requesting location permission…");

  try {
    socket = createTankerSocket();
    socket.connect();
  } catch {
    socket = null;
  }

  async function publish(latitude: number, longitude: number) {
    if (stopped) return;
    // Avoid flooding the API while watchPosition fires rapidly.
    const now = Date.now();
    if (firstSent && now - lastPostedAt < 2500) {
      options.onStatus(`Sharing · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      return;
    }
    lastPostedAt = now;

    await api.post(`/tanker/orders/${orderId}/location`, { latitude, longitude });
    try {
      socket?.emit("driverLocationUpdate", { orderId, latitude, longitude });
    } catch {
      /* REST is enough for customer poll / track */
    }

    if (!firstSent) {
      firstSent = true;
      options.onStatus(`Live · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      options.onFirstFix?.(latitude, longitude);
    } else {
      options.onStatus(`Sharing · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    }
  }

  function onGeoSuccess(pos: GeolocationPosition) {
    void publish(pos.coords.latitude, pos.coords.longitude).catch((err) => {
      const message = err instanceof Error ? err.message : "Failed to update location";
      options.onStatus(message);
      options.onError?.(message);
    });
  }

  function onGeoError(err: GeolocationPositionError) {
    const message = geoErrorMessage(err);
    options.onStatus(message);
    options.onError?.(message);
  }

  if (!navigator.geolocation) {
    const message = "Geolocation is not available on this device";
    options.onStatus(message);
    options.onError?.(message);
    return {
      stop: () => {
        stopped = true;
      },
    };
  }

  // Fast first fix (network / cached) — high accuracy often hangs on desktops.
  navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError, {
    enableHighAccuracy: false,
    maximumAge: 30_000,
    timeout: 12_000,
  });

  watchId = navigator.geolocation.watchPosition(onGeoSuccess, onGeoError, {
    enableHighAccuracy: false,
    maximumAge: 5_000,
    timeout: 20_000,
  });

  return {
    stop: () => {
      stopped = true;
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    },
  };
}
