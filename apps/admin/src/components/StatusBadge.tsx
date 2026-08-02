const map: Record<string, string> = {
  approved: "badge-success",
  active: "badge-success",
  confirmed: "badge-success",
  checked_in: "badge-success",
  completed: "badge-success",
  credit: "badge-success",
  debit: "badge-danger",
  assigned: "badge-info",
  pending_verification: "badge-warn",
  pending_approval: "badge-warn",
  field_in_progress: "badge-info",
  manager_review: "badge-warn",
  needs_info: "badge-warn",
  pending: "badge-warn",
  in_progress: "badge-info",
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
