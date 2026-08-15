export const COMPLAINT_CATEGORIES = [
  "plumbing",
  "electrical",
  "lift",
  "security",
  "housekeeping",
  "water",
  "other",
] as const;

export const EXPENSE_CATEGORIES = [
  "maintenance",
  "housekeeping",
  "security",
  "utilities",
  "repairs",
  "amenities",
  "other",
] as const;

export function complaintCategoryLabel(id: string) {
  return id.replaceAll("_", " ");
}

export function membershipRoleForIntent(
  intent: string | null | undefined,
): "resident" | "apartment_admin" | "guard" {
  if (intent === "society") return "apartment_admin";
  if (intent === "guard") return "guard";
  return "resident";
}

export function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN");
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toIsoFromLocal(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function defaultVisitorWindow() {
  const from = new Date();
  const to = new Date(from.getTime() + 4 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { validFrom: fmt(from), validTo: fmt(to) };
}
