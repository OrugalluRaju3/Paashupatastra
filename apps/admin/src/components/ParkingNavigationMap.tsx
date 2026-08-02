import { useEffect, useMemo, useState } from "react";

type Props = {
  latitude?: number | null;
  longitude?: number | null;
  label?: string;
  address?: string;
  mapsUrl?: string | null;
  navigationUrl?: string | null;
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ParkingNavigationMap({
  latitude,
  longitude,
  label,
  address,
  mapsUrl,
  navigationUrl,
}: Props) {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const hasCoords = latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude);

  const dirUrl = useMemo(() => {
    if (navigationUrl) return navigationUrl;
    if (mapsUrl) return mapsUrl;
    if (hasCoords) {
      return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
    }
    if (address) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
    }
    return null;
  }, [navigationUrl, mapsUrl, hasCoords, latitude, longitude, address]);

  const embedUrl = useMemo(() => {
    if (hasCoords) {
      return `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`;
    }
    if (address) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`;
    }
    return null;
  }, [hasCoords, latitude, longitude, address]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Location not available on this device");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoError(null);
      },
      (err) => setGeoError(err.message || "Unable to read live location"),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const distanceKm =
    userPos && hasCoords ? haversineKm(userPos.lat, userPos.lng, latitude!, longitude!) : null;

  return (
    <div className="nav-map">
      <div className="nav-map-meta">
        <div>
          <strong>{label ?? "Parking slot"}</strong>
          {address ? <p>{address}</p> : null}
        </div>
        <div className="nav-map-live">
          {distanceKm != null ? (
            <span>
              Live: <strong>{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}</strong> away
            </span>
          ) : geoError ? (
            <span className="nav-map-muted">{geoError}</span>
          ) : (
            <span className="nav-map-muted">Getting your live location…</span>
          )}
        </div>
      </div>

      {embedUrl ? (
        <iframe
          title="Parking location map"
          className="nav-map-frame"
          src={embedUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <p className="nav-map-muted">Map coordinates are not available for this listing.</p>
      )}

      <div className="nav-map-actions">
        {dirUrl ? (
          <a className="btn btn-primary" href={dirUrl} target="_blank" rel="noreferrer">
            Start live navigation
          </a>
        ) : null}
        {hasCoords ? (
          <a
            className="btn btn-ghost"
            href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Maps
          </a>
        ) : null}
      </div>
    </div>
  );
}
