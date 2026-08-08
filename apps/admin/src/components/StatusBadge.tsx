const map: Record<string, string> = {
  approved: "badge-success",
  active: "badge-success",
  confirmed: "badge-success",
  checked_in: "badge-success",
  completed: "badge-success",
  delivered: "badge-success",
  accepted: "badge-success",
  available: "badge-success",
  credit: "badge-success",
  debit: "badge-danger",
  assigned: "badge-info",
  scheduled: "badge-info",
  en_route: "badge-info",
  water_filled: "badge-info",
  on_the_way: "badge-info",
  at_location: "badge-info",
  delivering: "badge-info",
  on_delivery: "badge-info",
  pending_verification: "badge-warn",
  pending_approval: "badge-warn",
  field_in_progress: "badge-info",
  manager_review: "badge-warn",
  needs_info: "badge-warn",
  pending: "badge-warn",
  in_progress: "badge-info",
  maintenance: "badge-warn",
  rejected: "badge-danger",
  cancelled: "badge-danger",
  inactive: "badge-muted",
  expired: "badge-muted",
  draft: "badge-info",
};

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const cls = map[key] ?? "badge-muted";
  return <span className={`badge ${cls}`}>{status.replaceAll("_", " ")}</span>;
}
