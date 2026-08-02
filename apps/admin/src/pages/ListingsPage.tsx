import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, formatInrFromPaise, qs } from "../api";
import { FileUploadField } from "../components/FileUploadField";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

type Listing = {
  id: string;
  apartmentName: string;
  flatNumber?: string | null;
  blockTower?: string | null;
  city: string;
  state?: string;
  pinCode: string;
  addressLine?: string | null;
  parkingSlotNumber: string;
  parkingType: string;
  status: string;
  priceInPaise: number;
  rentType?: string;
  ownerUserId: string;
  ownerName?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  createdAt?: string;
};

type ListingDetail = {
  listing: Listing;
  documents: Array<{ id: string; type: string; fileUrl: string; status: string }>;
  assignments: Array<{ id: string; status: string; executiveUserId: string }>;
  reports: Array<{ id: string; decision: string; comments: string }>;
};

type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type Stats = {
  listingsTotal: number;
  pendingVerification: number;
  fieldInProgress: number;
  managerReview: number;
  approved: number;
};

const emptyDocs = {
  governmentIdUrl: "",
  ownershipProofUrl: "",
  parkingAllocationProofUrl: "",
  parkingPhotoUrl: "",
  entrancePhotoUrl: "",
};

const emptyParkingForm = {
  apartmentName: "",
  flatNumber: "",
  blockTower: "",
  city: "",
  state: "",
  pinCode: "",
  addressLine: "",
  latitude: "",
  longitude: "",
  parkingSlotNumber: "",
  parkingType: "covered",
  availabilityStartTime: "06:00",
  availabilityEndTime: "22:00",
  availableDays: "all_days",
  rentType: "monthly",
  priceInr: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  upiId: "",
};

export function ListingsPage() {
  const toast = useToast();
  const { token, user, portal, intent, refreshMe } = useAuth();
  const isOwnerPortal = portal === "public" && intent === "owner";

  const [stats, setStats] = useState<Stats | null>(null);
  const [data, setData] = useState<Paginated<Listing> | null>(null);
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 350);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState(emptyDocs);
  const [parkingForm, setParkingForm] = useState(emptyParkingForm);
  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        api.get<Paginated<Listing>>(
          `/parking/listings${qs({
            page,
            limit: 8,
            q: search,
            status: status || undefined,
            ownerUserId: isOwnerPortal ? user?.id : undefined,
          })}`,
        ),
        api.get<Stats>("/parking/stats"),
      ]);
      setData(list);
      setStats(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load listings");
    }
  }, [page, search, status, isOwnerPortal, user?.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await api.get<ListingDetail>(`/parking/listings/${id}`);
      setDetail(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load details");
    } finally {
      setDetailLoading(false);
    }
  }

  function openSubmitModal() {
    setDocs(emptyDocs);
    setParkingForm(emptyParkingForm);
    setModalOpen(true);
  }

  async function submitNewParkingApplication() {
    if (!token) {
      toast.error("Please login again");
      return;
    }
    const fullName = (user?.name ?? "").trim().replace(/\s+/g, " ");
    const email = (user?.email ?? "").trim();
    if (!fullName || !email) {
      toast.error("Update your profile name and email before registering parking");
      return;
    }
    if (!docs.governmentIdUrl || !docs.ownershipProofUrl || !docs.parkingAllocationProofUrl) {
      toast.error("Upload government ID, apartment proof, and parking slot proof");
      return;
    }
    const priceInPaise = Math.round(Number(parkingForm.priceInr) * 100);
    if (!Number.isFinite(priceInPaise) || priceInPaise <= 0) {
      toast.error("Enter a valid rent price in INR");
      return;
    }
    const lat = Number(parkingForm.latitude);
    const lng = Number(parkingForm.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Enter valid latitude and longitude");
      return;
    }

    const slotProof = docs.parkingAllocationProofUrl;
    const parkingPhoto = docs.parkingPhotoUrl || slotProof;
    const entrance = docs.entrancePhotoUrl || slotProof;

    setSaving(true);
    try {
      await api.post("/parking/owner-applications", {
        fullName,
        email,
        apartmentName: parkingForm.apartmentName.trim(),
        flatNumber: parkingForm.flatNumber.trim(),
        blockTower: parkingForm.blockTower.trim() || "A",
        city: parkingForm.city.trim(),
        state: parkingForm.state.trim(),
        country: "IN",
        pinCode: parkingForm.pinCode.trim(),
        addressLine: parkingForm.addressLine.trim(),
        latitude: lat,
        longitude: lng,
        parkingSlotNumber: parkingForm.parkingSlotNumber.trim(),
        parkingType: parkingForm.parkingType,
        vehicleTypesAllowed: ["car"],
        numberOfSlots: 1,
        availabilityStartTime: parkingForm.availabilityStartTime,
        availabilityEndTime: parkingForm.availabilityEndTime,
        availableDays: parkingForm.availableDays,
        rentType: parkingForm.rentType,
        priceInPaise,
        accountHolderName: fullName,
        bankName: parkingForm.bankName.trim(),
        accountNumber: parkingForm.accountNumber.trim(),
        ifscCode: parkingForm.ifscCode.trim(),
        upiId: parkingForm.upiId.trim() || null,
        governmentIdUrl: docs.governmentIdUrl,
        ownershipProofUrl: docs.ownershipProofUrl,
        parkingAllocationProofUrl: slotProof,
        parkingPhotoUrls: [parkingPhoto, parkingPhoto, parkingPhoto],
        entrancePhotoUrl: entrance,
      });
      await refreshMe();
      setModalOpen(false);
      setDocs(emptyDocs);
      setParkingForm(emptyParkingForm);
      toast.success("New parking submitted for verification");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSaving(false);
    }
  }

  const listing = detail?.listing;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{isOwnerPortal ? "My applications" : "Owners"}</h2>
          <p>
            {isOwnerPortal
              ? "Register a new parking slot and track verification. Duplicate slots are not allowed."
              : "All owner applications across the platform."}
          </p>
        </div>
        {isOwnerPortal ? (
          <button type="button" className="btn btn-primary" onClick={openSubmitModal}>
            + Register new parking
          </button>
        ) : null}
      </div>

      {!isOwnerPortal ? (
        <div className="kpi-grid">
          <KpiCard label="Total" value={stats?.listingsTotal ?? "-"} />
          <KpiCard label="Pending" value={stats?.pendingVerification ?? "-"} />
          <KpiCard label="Field" value={stats?.fieldInProgress ?? "-"} />
          <KpiCard label="Approved" value={stats?.approved ?? "-"} />
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h3>Listings</h3>
          <div className="toolbar">
            <input
              className="search"
              value={q}
              placeholder="Search apartment, city, pin..."
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="search"
              style={{ minWidth: 180, flex: "0 0 auto" }}
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="pending_verification">Pending verification</option>
              <option value="field_in_progress">Field in progress</option>
              <option value="manager_review">Manager review</option>
              <option value="needs_info">Needs info</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Apartment</th>
                {!isOwnerPortal ? <th>Owner</th> : null}
                <th>Slot</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.apartmentName}</strong>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      {[item.blockTower ? `Block ${item.blockTower}` : null, item.flatNumber ? `Flat ${item.flatNumber}` : null]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                      {item.city}
                      {item.state ? `, ${item.state}` : ""} · {item.pinCode}
                    </div>
                  </td>
                  {!isOwnerPortal ? (
                    <td>
                      <strong>{item.ownerName ?? "-"}</strong>
                      <div className="mono" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {item.ownerPhone ?? "-"}
                      </div>
                      {item.ownerEmail ? (
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{item.ownerEmail}</div>
                      ) : null}
                    </td>
                  ) : null}
                  <td>
                    {item.parkingSlotNumber} · {item.parkingType}
                  </td>
                  <td>
                    {formatInrFromPaise(item.priceInPaise)}
                    {item.rentType ? (
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{item.rentType}</div>
                    ) : null}
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={detailLoading}
                        onClick={() => void openDetail(item.id)}
                      >
                        View
                      </button>
                      {!isOwnerPortal &&
                      (item.status === "pending_verification" ||
                        item.status === "field_in_progress" ||
                        item.status === "manager_review") ? (
                        <Link className="btn btn-primary btn-sm" to="/staff/verification">
                          Verify
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={isOwnerPortal ? 5 : 6} className="empty">
                    {isOwnerPortal
                      ? "No applications yet. Submit your first parking registration."
                      : "No listings found."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {data ? (
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onPageChange={setPage}
          />
        ) : null}
      </section>

      {modalOpen ? (
        <Modal
          title="Register new parking"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void submitNewParkingApplication()}
              >
                {saving ? "Submitting..." : "Submit for verification"}
              </button>
            </>
          }
        >
          <p>
            Register a <strong>new</strong> parking slot only. The same apartment + flat + slot cannot be
            submitted twice. Account holder name is set to your profile name ({user?.name ?? "—"}).
          </p>

          <div className="form-section" style={{ borderTop: 0, paddingTop: "0.5rem" }}>
            <h4>Apartment & parking</h4>
            <div className="grid-2">
              <div className="field">
                <label>Building / apartment</label>
                <input
                  required
                  value={parkingForm.apartmentName}
                  onChange={(e) => setParkingForm({ ...parkingForm, apartmentName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Parking slot number</label>
                <input
                  required
                  value={parkingForm.parkingSlotNumber}
                  onChange={(e) => setParkingForm({ ...parkingForm, parkingSlotNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Flat number</label>
                <input
                  required
                  value={parkingForm.flatNumber}
                  onChange={(e) => setParkingForm({ ...parkingForm, flatNumber: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Block / tower</label>
                <input
                  value={parkingForm.blockTower}
                  placeholder="A"
                  onChange={(e) => setParkingForm({ ...parkingForm, blockTower: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>City</label>
                <input
                  required
                  value={parkingForm.city}
                  onChange={(e) => setParkingForm({ ...parkingForm, city: e.target.value })}
                />
              </div>
              <div className="field">
                <label>State</label>
                <input
                  required
                  value={parkingForm.state}
                  onChange={(e) => setParkingForm({ ...parkingForm, state: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>PIN code</label>
                <input
                  required
                  pattern="\d{6}"
                  value={parkingForm.pinCode}
                  onChange={(e) => setParkingForm({ ...parkingForm, pinCode: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Parking type</label>
                <select
                  value={parkingForm.parkingType}
                  onChange={(e) => setParkingForm({ ...parkingForm, parkingType: e.target.value })}
                >
                  <option value="covered">Covered</option>
                  <option value="open">Open</option>
                  <option value="basement">Basement</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Address</label>
              <input
                required
                value={parkingForm.addressLine}
                onChange={(e) => setParkingForm({ ...parkingForm, addressLine: e.target.value })}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Latitude</label>
                <input
                  required
                  value={parkingForm.latitude}
                  onChange={(e) => setParkingForm({ ...parkingForm, latitude: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Longitude</label>
                <input
                  required
                  value={parkingForm.longitude}
                  onChange={(e) => setParkingForm({ ...parkingForm, longitude: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Rent (INR)</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={parkingForm.priceInr}
                  onChange={(e) => setParkingForm({ ...parkingForm, priceInr: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Rent type</label>
                <select
                  value={parkingForm.rentType}
                  onChange={(e) => setParkingForm({ ...parkingForm, rentType: e.target.value })}
                >
                  <option value="monthly">Monthly</option>
                  <option value="daily">Daily</option>
                  <option value="hourly">Hourly</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Bank details</h4>
            <div className="field">
              <label>Account holder name</label>
              <input value={user?.name ?? ""} disabled />
              <p className="file-upload-hint">Locked to your full name (must match bank account).</p>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Bank name</label>
                <input
                  required
                  value={parkingForm.bankName}
                  onChange={(e) => setParkingForm({ ...parkingForm, bankName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>IFSC</label>
                <input
                  required
                  value={parkingForm.ifscCode}
                  onChange={(e) =>
                    setParkingForm({ ...parkingForm, ifscCode: e.target.value.toUpperCase() })
                  }
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Account number</label>
                <input
                  required
                  minLength={8}
                  value={parkingForm.accountNumber}
                  onChange={(e) => setParkingForm({ ...parkingForm, accountNumber: e.target.value })}
                />
              </div>
              <div className="field">
                <label>UPI ID (optional)</label>
                <input
                  value={parkingForm.upiId}
                  onChange={(e) => setParkingForm({ ...parkingForm, upiId: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Documents</h4>
            <p>Upload images or PDF (max 8 MB each).</p>
            <FileUploadField
              label="Government ID proof"
              required
              value={docs.governmentIdUrl}
              onChange={(url) => setDocs({ ...docs, governmentIdUrl: url })}
            />
            <FileUploadField
              label="Apartment proof"
              required
              value={docs.ownershipProofUrl}
              onChange={(url) => setDocs({ ...docs, ownershipProofUrl: url })}
            />
            <FileUploadField
              label="Parking slot proof"
              required
              value={docs.parkingAllocationProofUrl}
              onChange={(url) => setDocs({ ...docs, parkingAllocationProofUrl: url })}
            />
            <div className="grid-2">
              <FileUploadField
                label="Parking photo (optional)"
                hint="Defaults to slot proof if skipped"
                value={docs.parkingPhotoUrl}
                onChange={(url) => setDocs({ ...docs, parkingPhotoUrl: url })}
              />
              <FileUploadField
                label="Entrance photo (optional)"
                hint="Defaults to slot proof if skipped"
                value={docs.entrancePhotoUrl}
                onChange={(url) => setDocs({ ...docs, entrancePhotoUrl: url })}
              />
            </div>
          </div>
        </Modal>
      ) : null}

      {listing ? (
        <Modal
          title="Listing details"
          onClose={() => setDetail(null)}
          footer={
            <button type="button" className="btn btn-ghost" onClick={() => setDetail(null)}>
              Close
            </button>
          }
        >
          <div className="detail-grid">
            <div>
              <strong>Apartment</strong>
              <p>
                {listing.apartmentName}
                <br />
                {[listing.blockTower ? `Block ${listing.blockTower}` : null, listing.flatNumber ? `Flat ${listing.flatNumber}` : null]
                  .filter(Boolean)
                  .join(" · ")}
                <br />
                {listing.addressLine}
                <br />
                {listing.city}
                {listing.state ? `, ${listing.state}` : ""} · {listing.pinCode}
              </p>
            </div>
            <div>
              <strong>Owner</strong>
              <p>
                {listing.ownerName ?? "-"}
                <br />
                {listing.ownerPhone ?? "-"}
                <br />
                {listing.ownerEmail ?? "-"}
              </p>
            </div>
            <div>
              <strong>Parking</strong>
              <p>
                Slot {listing.parkingSlotNumber} · {listing.parkingType}
                <br />
                {formatInrFromPaise(listing.priceInPaise)} ({listing.rentType ?? "-"})
                <br />
                Status: {listing.status}
              </p>
            </div>
            <div>
              <strong>Documents</strong>
              <p>{detail?.documents?.length ?? 0} uploaded</p>
              {detail?.documents?.length ? (
                <ul className="doc-list">
                  {detail.documents.map((doc) => (
                    <li key={doc.id}>
                      <span>{doc.type}</span>
                      <a href={doc.fileUrl} target="_blank" rel="noreferrer">
                        View
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div>
              <strong>Assignments / reports</strong>
              <p>
                {detail?.assignments?.length ?? 0} assignments · {detail?.reports?.length ?? 0} reports
              </p>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
