import { useEffect, useState } from "react";
import { api, qs } from "../api";

type TermsDoc = {
  id: number;
  version: string;
  title: string;
};

type Props = {
  module: "parking" | "tanker" | "seva" | "community";
  audience:
    | "customer"
    | "parking_owner"
    | "tanker_supplier"
    | "tanker_driver"
    | "seva_provider"
    | "seva_worker"
    | "resident"
    | "apartment_admin"
    | "community_guard";
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  onTermsLoaded?: (terms: TermsDoc | null) => void;
};

export function TermsAcceptCheckbox({
  module,
  audience,
  checked,
  onCheckedChange,
  onTermsLoaded,
}: Props) {
  const [terms, setTerms] = useState<TermsDoc | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<{ item: TermsDoc | null }>(
          `/content/terms${qs({ module, audience })}`,
        );
        if (cancelled) return;
        setTerms(res.item);
        onTermsLoaded?.(res.item);
      } catch {
        if (!cancelled) {
          setTerms(null);
          onTermsLoaded?.(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audience, module, onTermsLoaded]);

  if (!terms) {
    return (
      <p className="auth-hint">
        Terms for this role are not published yet. Contact support if registration requires acceptance.
      </p>
    );
  }

  return (
    <label className="check-row terms-accept">
      <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} required />
      <span>
        I accept the {terms.title} (v{terms.version}). Applicable terms apply to my role.
      </span>
    </label>
  );
}

export async function recordTermsAcceptance(
  termsId: number,
  context: "registration" | "booking" | "manual",
  referenceId?: number,
) {
  return api.post("/content/terms/accept", {
    termsId,
    context,
    referenceId: referenceId ?? null,
  });
}
