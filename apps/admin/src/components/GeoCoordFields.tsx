import { useEffect, useRef } from "react";
import { useGeolocationCoords, type GeoStatus } from "../hooks/useGeolocationCoords";

type Props = {
  latitude: string;
  longitude: string;
  onChange: (next: { latitude: string; longitude: string }) => void;
  /** Capture GPS when this becomes true (e.g. modal open / signup step). */
  active?: boolean;
  required?: boolean;
  idPrefix?: string;
  readOnlyWhenReady?: boolean;
};

export function GeoCoordFields({
  latitude,
  longitude,
  onChange,
  active = true,
  required = true,
  idPrefix = "geo",
  readOnlyWhenReady = true,
}: Props) {
  const { status, error, capture } = useGeolocationCoords();
  const capturedOnce = useRef(false);
  const onChangeRef = useRef(onChange);
  const latitudeRef = useRef(latitude);
  const longitudeRef = useRef(longitude);
  onChangeRef.current = onChange;
  latitudeRef.current = latitude;
  longitudeRef.current = longitude;

  useEffect(() => {
    if (!active) {
      capturedOnce.current = false;
      return;
    }
    if (capturedOnce.current) return;
    capturedOnce.current = true;
    void (async () => {
      const coords = await capture();
      if (!coords) return;
      const lat = latitudeRef.current.trim();
      const lng = longitudeRef.current.trim();
      onChangeRef.current({
        latitude: lat ? latitudeRef.current : coords.latitude,
        longitude: lng ? longitudeRef.current : coords.longitude,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture once when activated
  }, [active]);

  async function refresh() {
    const coords = await capture({ force: true });
    if (!coords) return;
    onChange(coords);
  }

  const locating = status === "locating";
  const ready = status === "ready" && Boolean(latitude && longitude);
  const readOnly = readOnlyWhenReady && (status === "ready" || status === "locating") && !error;

  return (
    <>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${idPrefix}-lat`}>Current latitude</label>
          <input
            id={`${idPrefix}-lat`}
            required={required}
            readOnly={readOnly}
            inputMode="decimal"
            placeholder={locating ? "Detecting your location…" : "Auto-filled from GPS"}
            value={latitude}
            onChange={(e) => onChange({ latitude: e.target.value, longitude })}
            aria-busy={locating}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-lng`}>Current longitude</label>
          <input
            id={`${idPrefix}-lng`}
            required={required}
            readOnly={readOnly}
            inputMode="decimal"
            placeholder={locating ? "Detecting your location…" : "Auto-filled from GPS"}
            value={longitude}
            onChange={(e) => onChange({ latitude, longitude: e.target.value })}
            aria-busy={locating}
          />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          marginTop: "0.35rem",
        }}
      >
        <button type="button" className="btn btn-ghost btn-sm" disabled={locating} onClick={() => void refresh()}>
          {locating ? "Detecting location…" : "Refresh current location"}
        </button>
        {ready ? (
          <span className="auth-hint" style={{ margin: 0 }}>
            Live GPS captured
          </span>
        ) : null}
        {status === "error" && error ? (
          <span className="error" style={{ margin: 0, fontSize: "0.85rem" }}>
            {error}
          </span>
        ) : null}
      </div>
      {statusToHint(status, latitude, longitude)}
    </>
  );
}

function statusToHint(status: GeoStatus, latitude: string, longitude: string) {
  if (status === "idle" && !latitude && !longitude) {
    return (
      <p className="auth-hint" style={{ marginTop: "0.35rem" }}>
        Allow location access so latitude and longitude fill automatically.
      </p>
    );
  }
  return null;
}
