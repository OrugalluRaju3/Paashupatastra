/** Vehicle types owners can allow on a parking slot / customers can book. */
export const PARKING_VEHICLE_TYPE_OPTIONS = [
  { value: "car", label: "Car" },
  { value: "bike", label: "Bike" },
  { value: "auto", label: "Auto" },
  { value: "ev", label: "EV" },
] as const;

export type ParkingVehicleType = (typeof PARKING_VEHICLE_TYPE_OPTIONS)[number]["value"];

export const DEFAULT_PARKING_VEHICLE_TYPES: ParkingVehicleType[] = ["car", "bike", "auto"];

export function labelParkingVehicleType(value?: string | null) {
  if (!value) return "—";
  const hit = PARKING_VEHICLE_TYPE_OPTIONS.find((o) => o.value === value);
  return hit?.label ?? value.replaceAll("_", " ");
}

export function toggleParkingVehicleType(
  current: string[],
  value: string,
  checked: boolean,
): string[] {
  if (checked) {
    return current.includes(value) ? current : [...current, value];
  }
  return current.filter((v) => v !== value);
}
