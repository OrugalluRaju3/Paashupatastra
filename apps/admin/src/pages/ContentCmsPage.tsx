import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, qs } from "../api";
import { useAuth } from "../auth/AuthContext";
import { isParkingSuperAdmin, isTankerSuperAdmin } from "../auth/types";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";

type Module = "parking" | "tanker";
type Tab = "privacy" | "terms" | "faqs" | "support" | "announcements";
type CreateKind = "privacy" | "terms" | "faq" | "announcement";

type Policy = {
  id: number;
  module: string;
  version: string;
  title: string;
  body: string;
  isPublished: boolean;
  publishedAt?: string | null;
  createdAt: string;
};

type TermsDoc = Policy & { audience: string };

type Faq = {
  id: number;
  module: string;
  category: string;
  question: string;
  answer: string;
  displayOrder: number;
  isActive: boolean;
};

type Support = {
  module: string;
  supportEmail: string | null;
  supportPhone: string | null;
  whatsappNumber: string | null;
  workingHours: string | null;
  emergencyContact: string | null;
  officeAddress: string | null;
  socialLinks: Record<string, string>;
};

type Announcement = {
  id: number;
  module: string;
  title: string;
  body: string;
  audiences: string[];
  startAt: string;
  endAt: string;
  isActive: boolean;
};

const TERMS_AUDIENCES = [
  { id: "customer", label: "Customer" },
  { id: "parking_owner", label: "Parking owner" },
  { id: "tanker_supplier", label: "Water tanker supplier" },
  { id: "tanker_driver", label: "Driver" },
] as const;

const ANN_AUDIENCES = [
  { id: "customers", label: "Customers" },
  { id: "parking_owners", label: "Parking owners" },
  { id: "tanker_suppliers", label: "Water suppliers" },
  { id: "tanker_drivers", label: "Drivers" },
  { id: "tanker_admins", label: "Tanker admins" },
] as const;

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyPolicyForm = {
  version: "1.0",
  title: "Privacy Policy",
  body: "",
  isPublished: true,
};

const emptyFaqForm = {
  category: "general",
  question: "",
  answer: "",
  displayOrder: 0,
  isActive: true,
};

function emptyAnnForm(defaultAudience: string) {
  return {
    title: "",
    body: "",
    audiences: [defaultAudience] as string[],
    startAt: toLocalInput(new Date().toISOString()),
    endAt: toLocalInput(new Date(Date.now() + 7 * 864e5).toISOString()),
    isActive: true,
  };
}

export function ContentCmsPage() {
  const toast = useToast();
  const { user, module: authModule } = useAuth();
  const canParking = isParkingSuperAdmin(user);
  const canTanker = isTankerSuperAdmin(user);
  const defaultModule: Module =
    authModule === "tanker" && canTanker ? "tanker" : canParking ? "parking" : "tanker";

  const [module, setModule] = useState<Module>(defaultModule);
  const [tab, setTab] = useState<Tab>("privacy");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [terms, setTerms] = useState<TermsDoc[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [support, setSupport] = useState<Support | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [createModal, setCreateModal] = useState<CreateKind | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authModule === "tanker" && canTanker) setModule("tanker");
    else if (authModule === "parking" && canParking) setModule("parking");
  }, [authModule, canParking, canTanker]);

  const [policyForm, setPolicyForm] = useState(emptyPolicyForm);
  const [termsForm, setTermsForm] = useState({
    audience: "customer",
    version: "1.0",
    title: "Terms & Conditions",
    body: "",
    isPublished: true,
  });
  const [faqForm, setFaqForm] = useState(emptyFaqForm);
  const [faqEdit, setFaqEdit] = useState<Faq | null>(null);
  const [annForm, setAnnForm] = useState(emptyAnnForm("customers"));
  const [supportForm, setSupportForm] = useState({
    supportEmail: "",
    supportPhone: "",
    whatsappNumber: "",
    workingHours: "",
    emergencyContact: "",
    officeAddress: "",
    facebook: "",
    instagram: "",
    twitter: "",
  });

  const audienceOptions = useMemo(() => {
    if (module === "parking") {
      return TERMS_AUDIENCES.filter((a) => a.id === "customer" || a.id === "parking_owner");
    }
    return TERMS_AUDIENCES.filter(
      (a) => a.id === "customer" || a.id === "tanker_supplier" || a.id === "tanker_driver",
    );
  }, [module]);

  const annAudienceOptions = useMemo(() => {
    if (module === "parking") {
      return ANN_AUDIENCES.filter((a) => a.id === "customers" || a.id === "parking_owners");
    }
    return ANN_AUDIENCES.filter(
      (a) =>
        a.id === "customers" ||
        a.id === "tanker_suppliers" ||
        a.id === "tanker_drivers" ||
        a.id === "tanker_admins",
    );
  }, [module]);

  const load = useCallback(async () => {
    try {
      if (tab === "privacy") {
        const res = await api.get<{ items: Policy[] }>(
          `/content/privacy${qs({ module, all: true })}`,
        );
        setPolicies(res.items ?? []);
      } else if (tab === "terms") {
        const res = await api.get<{ items: TermsDoc[] }>(
          `/content/terms${qs({ module, all: true })}`,
        );
        setTerms(res.items ?? []);
      } else if (tab === "faqs") {
        const res = await api.get<{ items: Faq[] }>(`/content/faqs${qs({ module, all: true })}`);
        setFaqs(res.items ?? []);
      } else if (tab === "support") {
        const res = await api.get<Support>(`/content/support${qs({ module })}`);
        setSupport(res);
        setSupportForm({
          supportEmail: res.supportEmail ?? "",
          supportPhone: res.supportPhone ?? "",
          whatsappNumber: res.whatsappNumber ?? "",
          workingHours: res.workingHours ?? "",
          emergencyContact: res.emergencyContact ?? "",
          officeAddress: res.officeAddress ?? "",
          facebook: res.socialLinks?.facebook ?? "",
          instagram: res.socialLinks?.instagram ?? "",
          twitter: res.socialLinks?.twitter ?? "",
        });
      } else {
        const res = await api.get<{ items: Announcement[] }>(
          `/content/announcements${qs({ module, all: true })}`,
        );
        setAnnouncements(res.items ?? []);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load content");
    }
  }, [module, tab, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate(kind: CreateKind) {
    if (kind === "privacy") {
      setPolicyForm(emptyPolicyForm);
    } else if (kind === "terms") {
      setTermsForm({
        audience: audienceOptions[0]?.id ?? "customer",
        version: "1.0",
        title: "Terms & Conditions",
        body: "",
        isPublished: true,
      });
    } else if (kind === "faq") {
      setFaqForm({
        ...emptyFaqForm,
        displayOrder: faqs.length,
      });
    } else {
      setAnnForm(emptyAnnForm(annAudienceOptions[0]?.id ?? "customers"));
    }
    setCreateModal(kind);
  }

  async function createPrivacy(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/content/privacy", { module, ...policyForm });
      toast.success("Privacy policy saved");
      setCreateModal(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function createTerms(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/content/terms", { module, ...termsForm });
      toast.success("Terms saved");
      setCreateModal(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function createFaq(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/content/faqs", { module, ...faqForm });
      toast.success("FAQ added");
      setCreateModal(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveFaqEdit() {
    if (!faqEdit) return;
    setSaving(true);
    try {
      await api.patch(`/content/faqs/${faqEdit.id}`, {
        category: faqEdit.category,
        question: faqEdit.question,
        answer: faqEdit.answer,
        displayOrder: faqEdit.displayOrder,
        isActive: faqEdit.isActive,
      });
      toast.success("FAQ updated");
      setFaqEdit(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFaq(id: number) {
    if (!window.confirm("Delete this FAQ?")) return;
    try {
      await api.delete(`/content/faqs/${id}`);
      toast.success("FAQ deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function saveSupport(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/content/support", {
        module,
        supportEmail: supportForm.supportEmail || null,
        supportPhone: supportForm.supportPhone || null,
        whatsappNumber: supportForm.whatsappNumber || null,
        workingHours: supportForm.workingHours || null,
        emergencyContact: supportForm.emergencyContact || null,
        officeAddress: supportForm.officeAddress || null,
        socialLinks: {
          ...(supportForm.facebook ? { facebook: supportForm.facebook } : {}),
          ...(supportForm.instagram ? { instagram: supportForm.instagram } : {}),
          ...(supportForm.twitter ? { twitter: supportForm.twitter } : {}),
        },
      });
      toast.success("Support & contact details saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function createAnnouncement(e: FormEvent) {
    e.preventDefault();
    if (annForm.audiences.length === 0) {
      toast.error("Select at least one audience");
      return;
    }
    setSaving(true);
    try {
      await api.post("/content/announcements", {
        module,
        title: annForm.title,
        body: annForm.body,
        audiences: annForm.audiences,
        startAt: new Date(annForm.startAt).toISOString(),
        endAt: new Date(annForm.endAt).toISOString(),
        isActive: annForm.isActive,
      });
      toast.success("Announcement published");
      setCreateModal(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAnnouncement(a: Announcement) {
    try {
      await api.patch(`/content/announcements/${a.id}`, { isActive: !a.isActive });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function deleteAnnouncement(id: number) {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await api.delete(`/content/announcements/${id}`);
      toast.success("Announcement deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!canParking && !canTanker) {
    return <p className="error">Only Parking or Tanker Super Admin can manage content.</p>;
  }

  const createTitle =
    createModal === "privacy"
      ? "Create privacy version"
      : createModal === "terms"
        ? "Create terms version"
        : createModal === "faq"
          ? "Add FAQ"
          : createModal === "announcement"
            ? "Create announcement"
            : "";

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Content & compliance</h2>
          <p>Privacy, terms, FAQs, support/contact, and announcements.</p>
        </div>
        <div className="tabs">
          {(canParking ? (["parking"] as Module[]) : [])
            .concat(canTanker ? (["tanker"] as Module[]) : [])
            .map((m) => (
              <button
                key={m}
                type="button"
                className={`intent${module === m ? " active" : ""}`}
                onClick={() => setModule(m)}
              >
                {m === "parking" ? "Parking" : "Water tanker"}
              </button>
            ))}
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: "1rem" }}>
        {(
          [
            ["privacy", "Privacy"],
            ["terms", "Terms"],
            ["faqs", "FAQs"],
            ["support", "Support / Contact"],
            ["announcements", "Announcements"],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`intent${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "privacy" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Privacy policy · {module}</h3>
            <button type="button" className="btn btn-primary" onClick={() => openCreate("privacy")}>
              + Create version
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.version}</td>
                    <td>{p.title}</td>
                    <td>
                      <StatusBadge status={p.isPublished ? "active" : "inactive"} />
                    </td>
                    <td>{new Date(p.createdAt).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
                {policies.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">
                      No privacy versions yet. Click Create version to add one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "terms" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Terms & conditions · {module}</h3>
            <button type="button" className="btn btn-primary" onClick={() => openCreate("terms")}>
              + Create version
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Audience</th>
                  <th>Version</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t.id}>
                    <td>{t.audience.replaceAll("_", " ")}</td>
                    <td className="mono">{t.version}</td>
                    <td>{t.title}</td>
                    <td>
                      <StatusBadge status={t.isPublished ? "active" : "inactive"} />
                    </td>
                    <td>{new Date(t.createdAt).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
                {terms.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No terms versions yet. Click Create version to add one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "faqs" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>FAQs · {module}</h3>
            <button type="button" className="btn btn-primary" onClick={() => openCreate("faq")}>
              + Add FAQ
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Category</th>
                  <th>Question</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {faqs.map((f) => (
                  <tr key={f.id}>
                    <td>{f.displayOrder}</td>
                    <td>{f.category}</td>
                    <td>{f.question}</td>
                    <td>
                      <StatusBadge status={f.isActive ? "active" : "inactive"} />
                    </td>
                    <td>
                      <div className="action-stack">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setFaqEdit(f)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            void api
                              .patch(`/content/faqs/${f.id}`, { isActive: !f.isActive })
                              .then(load)
                              .catch((err) =>
                                toast.error(err instanceof Error ? err.message : "Failed"),
                              )
                          }
                        >
                          {f.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void deleteFaq(f.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {faqs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No FAQs yet. Click Add FAQ to create one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "support" ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Support & contact · {module}</h3>
              {support ? (
                <p className="auth-hint" style={{ margin: "0.25rem 0 0" }}>
                  Module settings for {support.module}
                </p>
              ) : null}
            </div>
          </div>
          <form
            id="support-form"
            className="panel-body form-grid"
            onSubmit={(e) => void saveSupport(e)}
          >
            <div className="field">
              <label htmlFor="support-email">Support email</label>
              <input
                id="support-email"
                type="email"
                value={supportForm.supportEmail}
                onChange={(e) => setSupportForm({ ...supportForm, supportEmail: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="support-phone">Support phone</label>
              <input
                id="support-phone"
                value={supportForm.supportPhone}
                onChange={(e) => setSupportForm({ ...supportForm, supportPhone: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="support-whatsapp">WhatsApp</label>
              <input
                id="support-whatsapp"
                value={supportForm.whatsappNumber}
                onChange={(e) => setSupportForm({ ...supportForm, whatsappNumber: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="support-hours">Working hours</label>
              <input
                id="support-hours"
                value={supportForm.workingHours}
                onChange={(e) => setSupportForm({ ...supportForm, workingHours: e.target.value })}
                placeholder="Mon–Sat 9:00–18:00 IST"
              />
            </div>
            <div className="field">
              <label htmlFor="support-emergency">Emergency contact</label>
              <input
                id="support-emergency"
                value={supportForm.emergencyContact}
                onChange={(e) =>
                  setSupportForm({ ...supportForm, emergencyContact: e.target.value })
                }
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="support-address">Office address</label>
              <textarea
                id="support-address"
                rows={3}
                value={supportForm.officeAddress}
                onChange={(e) => setSupportForm({ ...supportForm, officeAddress: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="support-facebook">Facebook URL</label>
              <input
                id="support-facebook"
                value={supportForm.facebook}
                onChange={(e) => setSupportForm({ ...supportForm, facebook: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="support-instagram">Instagram URL</label>
              <input
                id="support-instagram"
                value={supportForm.instagram}
                onChange={(e) => setSupportForm({ ...supportForm, instagram: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="support-twitter">X / Twitter URL</label>
              <input
                id="support-twitter"
                value={supportForm.twitter}
                onChange={(e) => setSupportForm({ ...supportForm, twitter: e.target.value })}
              />
            </div>
            <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {tab === "announcements" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Announcements · {module}</h3>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openCreate("announcement")}
            >
              + Create announcement
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Audience</th>
                  <th>Window</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {announcements.map((a) => (
                  <tr key={a.id}>
                    <td>{a.title}</td>
                    <td>{a.audiences.join(", ")}</td>
                    <td>
                      {new Date(a.startAt).toLocaleString("en-IN")}
                      <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                        → {new Date(a.endAt).toLocaleString("en-IN")}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={a.isActive ? "active" : "inactive"} />
                    </td>
                    <td>
                      <div className="action-stack">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void toggleAnnouncement(a)}
                        >
                          {a.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void deleteAnnouncement(a.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {announcements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      No announcements yet. Click Create announcement to add one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {createModal ? (
        <Modal
          title={createTitle}
          wide={createModal === "privacy" || createModal === "terms" || createModal === "announcement"}
          onClose={() => {
            if (!saving) setCreateModal(null);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => setCreateModal(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="content-create-form"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving
                  ? "Saving…"
                  : createModal === "privacy"
                    ? "Save privacy version"
                    : createModal === "terms"
                      ? "Save terms version"
                      : createModal === "faq"
                        ? "Add FAQ"
                        : "Publish announcement"}
              </button>
            </>
          }
        >
          {createModal === "privacy" ? (
            <form
              id="content-create-form"
              className="form-grid"
              onSubmit={(e) => void createPrivacy(e)}
            >
              <div className="field">
                <label htmlFor="privacy-version">Version</label>
                <input
                  id="privacy-version"
                  required
                  value={policyForm.version}
                  onChange={(e) => setPolicyForm({ ...policyForm, version: e.target.value })}
                  placeholder="1.0"
                />
              </div>
              <div className="field">
                <label htmlFor="privacy-title">Title</label>
                <input
                  id="privacy-title"
                  required
                  value={policyForm.title}
                  onChange={(e) => setPolicyForm({ ...policyForm, title: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="privacy-body">Body</label>
                <textarea
                  id="privacy-body"
                  required
                  rows={10}
                  value={policyForm.body}
                  onChange={(e) => setPolicyForm({ ...policyForm, body: e.target.value })}
                  placeholder="Write the privacy policy content…"
                />
              </div>
              <label className="check-row" style={{ gridColumn: "1 / -1" }}>
                <input
                  type="checkbox"
                  checked={policyForm.isPublished}
                  onChange={(e) => setPolicyForm({ ...policyForm, isPublished: e.target.checked })}
                />
                Publish as current version
              </label>
            </form>
          ) : null}

          {createModal === "terms" ? (
            <form
              id="content-create-form"
              className="form-grid"
              onSubmit={(e) => void createTerms(e)}
            >
              <div className="field">
                <label htmlFor="terms-audience">Audience</label>
                <select
                  id="terms-audience"
                  value={termsForm.audience}
                  onChange={(e) => setTermsForm({ ...termsForm, audience: e.target.value })}
                >
                  {audienceOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="terms-version">Version</label>
                <input
                  id="terms-version"
                  required
                  value={termsForm.version}
                  onChange={(e) => setTermsForm({ ...termsForm, version: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="terms-title">Title</label>
                <input
                  id="terms-title"
                  required
                  value={termsForm.title}
                  onChange={(e) => setTermsForm({ ...termsForm, title: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="terms-body">Body</label>
                <textarea
                  id="terms-body"
                  required
                  rows={10}
                  value={termsForm.body}
                  onChange={(e) => setTermsForm({ ...termsForm, body: e.target.value })}
                  placeholder="Write the terms & conditions…"
                />
              </div>
              <label className="check-row" style={{ gridColumn: "1 / -1" }}>
                <input
                  type="checkbox"
                  checked={termsForm.isPublished}
                  onChange={(e) => setTermsForm({ ...termsForm, isPublished: e.target.checked })}
                />
                Publish as current version
              </label>
            </form>
          ) : null}

          {createModal === "faq" ? (
            <form id="content-create-form" className="form-grid" onSubmit={(e) => void createFaq(e)}>
              <div className="field">
                <label htmlFor="faq-category">Category</label>
                <input
                  id="faq-category"
                  required
                  value={faqForm.category}
                  onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="faq-order">Display order</label>
                <input
                  id="faq-order"
                  type="number"
                  min={0}
                  value={faqForm.displayOrder}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, displayOrder: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="faq-question">Question</label>
                <input
                  id="faq-question"
                  required
                  value={faqForm.question}
                  onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="faq-answer">Answer</label>
                <textarea
                  id="faq-answer"
                  required
                  rows={5}
                  value={faqForm.answer}
                  onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                />
              </div>
              <label className="check-row" style={{ gridColumn: "1 / -1" }}>
                <input
                  type="checkbox"
                  checked={faqForm.isActive}
                  onChange={(e) => setFaqForm({ ...faqForm, isActive: e.target.checked })}
                />
                Active
              </label>
            </form>
          ) : null}

          {createModal === "announcement" ? (
            <form
              id="content-create-form"
              className="form-grid"
              onSubmit={(e) => void createAnnouncement(e)}
            >
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="ann-title">Title</label>
                <input
                  id="ann-title"
                  required
                  value={annForm.title}
                  onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="ann-body">Body</label>
                <textarea
                  id="ann-body"
                  required
                  rows={5}
                  value={annForm.body}
                  onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Target audience</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                  {annAudienceOptions.map((a) => (
                    <label key={a.id} className="check-row">
                      <input
                        type="checkbox"
                        checked={annForm.audiences.includes(a.id)}
                        onChange={(e) => {
                          setAnnForm({
                            ...annForm,
                            audiences: e.target.checked
                              ? [...annForm.audiences, a.id]
                              : annForm.audiences.filter((x) => x !== a.id),
                          });
                        }}
                      />
                      {a.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="ann-start">Start</label>
                <input
                  id="ann-start"
                  type="datetime-local"
                  required
                  value={annForm.startAt}
                  onChange={(e) => setAnnForm({ ...annForm, startAt: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="ann-end">End</label>
                <input
                  id="ann-end"
                  type="datetime-local"
                  required
                  value={annForm.endAt}
                  onChange={(e) => setAnnForm({ ...annForm, endAt: e.target.value })}
                />
              </div>
              <label className="check-row" style={{ gridColumn: "1 / -1" }}>
                <input
                  type="checkbox"
                  checked={annForm.isActive}
                  onChange={(e) => setAnnForm({ ...annForm, isActive: e.target.checked })}
                />
                Active immediately
              </label>
            </form>
          ) : null}
        </Modal>
      ) : null}

      {faqEdit ? (
        <Modal
          title="Edit FAQ"
          onClose={() => {
            if (!saving) setFaqEdit(null);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => setFaqEdit(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void saveFaqEdit()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="edit-faq-category">Category</label>
            <input
              id="edit-faq-category"
              value={faqEdit.category}
              onChange={(e) => setFaqEdit({ ...faqEdit, category: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-faq-order">Order</label>
            <input
              id="edit-faq-order"
              type="number"
              value={faqEdit.displayOrder}
              onChange={(e) =>
                setFaqEdit({ ...faqEdit, displayOrder: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="edit-faq-question">Question</label>
            <input
              id="edit-faq-question"
              value={faqEdit.question}
              onChange={(e) => setFaqEdit({ ...faqEdit, question: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-faq-answer">Answer</label>
            <textarea
              id="edit-faq-answer"
              rows={5}
              value={faqEdit.answer}
              onChange={(e) => setFaqEdit({ ...faqEdit, answer: e.target.value })}
            />
          </div>
        </Modal>
      ) : null}
    </>
  );
}
