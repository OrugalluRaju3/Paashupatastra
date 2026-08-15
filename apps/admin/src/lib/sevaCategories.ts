export const SEVA_CATEGORIES = [
  { id: "housekeeping_regular", label: "Regular housekeeping" },
  { id: "housekeeping_deep", label: "Deep cleaning" },
  { id: "kitchen_bathroom", label: "Kitchen & bathroom" },
  { id: "electrical_minor", label: "Minor electrical" },
  { id: "plumbing_minor", label: "Minor plumbing" },
  { id: "ac_service", label: "AC basic service" },
] as const;

export type SevaCategoryId = (typeof SEVA_CATEGORIES)[number]["id"];

export function sevaCategoryLabel(id: string) {
  return SEVA_CATEGORIES.find((c) => c.id === id)?.label ?? id.replaceAll("_", " ");
}
