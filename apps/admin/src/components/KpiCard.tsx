type Props = {
  label: string;
  value: string | number;
  hint?: string;
};

export function KpiCard({ label, value, hint }: Props) {
  return (
    <article className="kpi">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {hint ? <p className="kpi-hint">{hint}</p> : null}
    </article>
  );
}
