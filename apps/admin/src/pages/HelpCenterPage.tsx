import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../api";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";

type Section = "faq" | "privacy" | "terms" | "support";

type Faq = {
  id: number;
  category: string;
  question: string;
  answer: string;
};

type Doc = {
  id: number;
  version: string;
  title: string;
  body: string;
  audience?: string;
};

type Support = {
  supportEmail: string | null;
  supportPhone: string | null;
  whatsappNumber: string | null;
  workingHours: string | null;
  emergencyContact: string | null;
  officeAddress: string | null;
  socialLinks: Record<string, string>;
};

function audienceForIntent(intent: string | null | undefined) {
  if (intent === "owner") return "parking_owner";
  if (intent === "supplier") return "tanker_supplier";
  if (intent === "driver") return "tanker_driver";
  return "customer";
}

export function HelpCenterPage({ section = "faq" }: { section?: Section }) {
  const toast = useToast();
  const { module, intent } = useAuth();
  const contentModule = module === "tanker" ? "tanker" : "parking";
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [privacy, setPrivacy] = useState<Doc | null>(null);
  const [terms, setTerms] = useState<Doc | null>(null);
  const [support, setSupport] = useState<Support | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      if (section === "faq") {
        const res = await api.get<{ items: Faq[] }>(`/content/faqs${qs({ module: contentModule })}`);
        setFaqs(res.items ?? []);
      } else if (section === "privacy") {
        const res = await api.get<{ item: Doc | null }>(
          `/content/privacy${qs({ module: contentModule })}`,
        );
        setPrivacy(res.item);
      } else if (section === "terms") {
        const audience = audienceForIntent(intent);
        const res = await api.get<{ item: Doc | null }>(
          `/content/terms${qs({ module: contentModule, audience })}`,
        );
        setTerms(res.item);
      } else {
        const res = await api.get<Support>(`/content/support${qs({ module: contentModule })}`);
        setSupport(res);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    }
  }, [contentModule, intent, section, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedFaqs = useMemo(() => {
    const map = new Map<string, Faq[]>();
    for (const f of faqs) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return [...map.entries()];
  }, [faqs]);

  const title =
    section === "faq"
      ? "FAQs"
      : section === "privacy"
        ? "Privacy policy"
        : section === "terms"
          ? "Terms & conditions"
          : "Support & contact";

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{title}</h2>
          <p>
            {contentModule === "tanker" ? "Water tanker" : "Parking"} help and compliance information.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <Link className={`btn btn-sm${section === "faq" ? " btn-primary" : " btn-ghost"}`} to="/app/help/faq">
            FAQs
          </Link>
          <Link
            className={`btn btn-sm${section === "privacy" ? " btn-primary" : " btn-ghost"}`}
            to="/app/help/privacy"
          >
            Privacy
          </Link>
          <Link
            className={`btn btn-sm${section === "terms" ? " btn-primary" : " btn-ghost"}`}
            to="/app/help/terms"
          >
            Terms
          </Link>
          <Link
            className={`btn btn-sm${section === "support" ? " btn-primary" : " btn-ghost"}`}
            to="/app/help/support"
          >
            Contact
          </Link>
        </div>
      </div>

      <section className="panel">
        <div style={{ padding: "1rem" }}>
          {section === "faq" ? (
            groupedFaqs.length ? (
              groupedFaqs.map(([category, items]) => (
                <div key={category} style={{ marginBottom: "1.25rem" }}>
                  <h3 style={{ marginTop: 0, textTransform: "capitalize" }}>{category}</h3>
                  <div style={{ display: "grid", gap: "0.45rem" }}>
                    {items.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className="intent-row"
                        onClick={() => setOpenFaq(openFaq === f.id ? null : f.id)}
                      >
                        {f.question}
                        {openFaq === f.id ? <span style={{ whiteSpace: "pre-wrap" }}>{f.answer}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="empty">No FAQs published yet.</p>
            )
          ) : null}

          {section === "privacy" ? (
            privacy ? (
              <article className="legal-doc">
                <h3 style={{ marginTop: 0 }}>
                  {privacy.title} <span className="mono">v{privacy.version}</span>
                </h3>
                <pre className="legal-body">{privacy.body}</pre>
              </article>
            ) : (
              <p className="empty">Privacy policy is not published yet.</p>
            )
          ) : null}

          {section === "terms" ? (
            terms ? (
              <article className="legal-doc">
                <h3 style={{ marginTop: 0 }}>
                  {terms.title} <span className="mono">v{terms.version}</span>
                </h3>
                <pre className="legal-body">{terms.body}</pre>
              </article>
            ) : (
              <p className="empty">Terms for your role are not published yet.</p>
            )
          ) : null}

          {section === "support" && support ? (
            <dl className="detail-list">
              <div>
                <dt>Support email</dt>
                <dd>
                  {support.supportEmail ? (
                    <a href={`mailto:${support.supportEmail}`}>{support.supportEmail}</a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>
                  {support.supportPhone ? (
                    <a href={`tel:${support.supportPhone}`}>{support.supportPhone}</a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>WhatsApp</dt>
                <dd>
                  {support.whatsappNumber ? (
                    <a
                      href={`https://wa.me/${support.whatsappNumber.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {support.whatsappNumber}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Working hours</dt>
                <dd>{support.workingHours || "—"}</dd>
              </div>
              <div>
                <dt>Emergency</dt>
                <dd>{support.emergencyContact || "—"}</dd>
              </div>
              <div>
                <dt>Office address</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{support.officeAddress || "—"}</dd>
              </div>
              {Object.keys(support.socialLinks ?? {}).length ? (
                <div>
                  <dt>Social</dt>
                  <dd>
                    {Object.entries(support.socialLinks).map(([k, v]) => (
                      <div key={k}>
                        <a href={v} target="_blank" rel="noreferrer">
                          {k}
                        </a>
                      </div>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {section === "support" && !support ? <p className="empty">Support details not configured.</p> : null}
        </div>
      </section>
    </>
  );
}
