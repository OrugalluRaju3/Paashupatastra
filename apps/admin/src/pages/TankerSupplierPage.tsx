import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatInrFromPaise, qs } from "../api";
import { useAuth } from "../auth/AuthContext";
import { FileUploadField } from "../components/FileUploadField";
import { GeoCoordFields } from "../components/GeoCoordFields";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { createTankerSocket } from "../lib/tankerSocket";
import type { Paginated } from "../types";

type Supplier = {
  id: string;
  fullName: string;
  email: string | null;
  alternateMobile: string | null;
  address: string;
  landmark: string | null;
  city: string;
  state: string;
  country: string;
  pinCode: string;
  availabilityStartTime: string;
  availabilityEndTime: string;
  latitude: number | null;
  longitude: number | null;
  isOnline: boolean;
  isActive: boolean;
};

type Vehicle = {
  id: string;
  driverFullName: string;
  driverMobile: string;
  vehicleNumber: string;
  capacityLitres: number;
  amountInPaise: number;
  waterType: string;
  status: string;
  isActive: boolean;
};

type TankerRequest = {
  id: string;
  customerUserId: string;
  supplierId: string | null;
  waterType: string;
  quantityLitres: number;
  deliveryAddress: string;
  comments: string | null;
  status: string;
  createdAt: string;
};

type TankerOrder = {
  id: string;
  waterType: string;
  capacityLitres: number;
  vehicleNumber: string | null;
  amountInPaise: number;
  deliveryAddress: string;
  status: string;
  paymentStatus: string;
  deliveryOtp: string | null;
  createdAt: string;
};

type Invoice = {
  id: string;
  orderId: string;
  amountInPaise: number;
  status: string;
  createdAt: string;
};

type SupplierTab = "home" | "fleet" | "requests" | "orders" | "invoices" | "profile";

const ORDER_STATUSES = [
  "scheduled",
  "en_route",
  "water_filled",
  "on_the_way",
  "at_location",
  "delivering",
  "delivered",
  "cancelled",
] as const;

const VEHICLE_STATUSES = ["available", "on_delivery", "maintenance"] as const;

const emptyProfile = {
  fullName: "",
  email: "",
  alternateMobile: "",
  address: "",
  landmark: "",
  city: "",
  state: "",
  country: "IN",
  pinCode: "",
  availabilityStartTime: "06:00",
  availabilityEndTime: "22:00",
  latitude: "",
  longitude: "",
  proofUrl: "",
};

const emptyVehicle = {
  driverFullName: "",
  driverMobile: "",
  driverEmail: "",
  vehicleNumber: "",
  capacityLitres: "5000",
  amountInr: "",
  waterType: "drinking",
  licenceFrontUrl: "",
  licenceBackUrl: "",
  tankerImageUrl: "",
};

function isActiveOrder(status: string) {
  return !["delivered", "cancelled"].includes(status);
}

function tabFromPath(pathname: string, searchTab: string | null): SupplierTab {
  if (pathname.endsWith("/fleet") || searchTab === "fleet") return "fleet";
  if (pathname.endsWith("/requests") || searchTab === "requests") return "requests";
  if (pathname.endsWith("/orders") || searchTab === "orders") return "orders";
  if (pathname.endsWith("/invoices") || searchTab === "invoices") return "invoices";
  if (pathname.endsWith("/profile") || searchTab === "profile") return "profile";
  return "home";
}

function isNotFoundError(err: unknown) {
  return err instanceof Error && /not found/i.test(err.message);
}

function supplierToForm(s: Supplier) {
  return {
    fullName: s.fullName,
    email: s.email ?? "",
    alternateMobile: s.alternateMobile ?? "",
    address: s.address,
    landmark: s.landmark ?? "",
    city: s.city,
    state: s.state,
    country: s.country,
    pinCode: s.pinCode,
    availabilityStartTime: s.availabilityStartTime,
    availabilityEndTime: s.availabilityEndTime,
    latitude: s.latitude != null ? String(s.latitude) : "",
    longitude: s.longitude != null ? String(s.longitude) : "",
    proofUrl: "",
  };
}

function ProfileFormFields({
  profileForm,
  setProfileForm,
  idPrefix,
}: {
  profileForm: typeof emptyProfile;
  setProfileForm: Dispatch<SetStateAction<typeof emptyProfile>>;
  idPrefix: string;
}) {
  return (
    <>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${idPrefix}-name`}>Full name</label>
          <input
            id={`${idPrefix}-name`}
            required
            minLength={2}
            value={profileForm.fullName}
            onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-email`}>Email</label>
          <input
            id={`${idPrefix}-email`}
            type="email"
            value={profileForm.email}
            onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-addr`}>Address</label>
        <input
          id={`${idPrefix}-addr`}
          required
          minLength={3}
          value={profileForm.address}
          onChange={(e) => setProfileForm((f) => ({ ...f, address: e.target.value }))}
        />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${idPrefix}-landmark`}>Landmark</label>
          <input
            id={`${idPrefix}-landmark`}
            value={profileForm.landmark}
            onChange={(e) => setProfileForm((f) => ({ ...f, landmark: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-alt`}>Alternate mobile</label>
          <input
            id={`${idPrefix}-alt`}
            value={profileForm.alternateMobile}
            onChange={(e) => setProfileForm((f) => ({ ...f, alternateMobile: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${idPrefix}-city`}>City</label>
          <input
            id={`${idPrefix}-city`}
            required
            value={profileForm.city}
            onChange={(e) => setProfileForm((f) => ({ ...f, city: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-state`}>State</label>
          <input
            id={`${idPrefix}-state`}
            required
            value={profileForm.state}
            onChange={(e) => setProfileForm((f) => ({ ...f, state: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${idPrefix}-pin`}>PIN code</label>
          <input
            id={`${idPrefix}-pin`}
            required
            value={profileForm.pinCode}
            onChange={(e) => setProfileForm((f) => ({ ...f, pinCode: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-country`}>Country</label>
          <input
            id={`${idPrefix}-country`}
            required
            value={profileForm.country}
            onChange={(e) => setProfileForm((f) => ({ ...f, country: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${idPrefix}-start`}>Available from</label>
          <input
            id={`${idPrefix}-start`}
            type="time"
            value={profileForm.availabilityStartTime}
            onChange={(e) => setProfileForm((f) => ({ ...f, availabilityStartTime: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-end`}>Available until</label>
          <input
            id={`${idPrefix}-end`}
            type="time"
            value={profileForm.availabilityEndTime}
            onChange={(e) => setProfileForm((f) => ({ ...f, availabilityEndTime: e.target.value }))}
          />
        </div>
      </div>
      <GeoCoordFields
        idPrefix={idPrefix}
        active
        required={false}
        readOnlyWhenReady={false}
        latitude={profileForm.latitude}
        longitude={profileForm.longitude}
        onChange={({ latitude, longitude }) =>
          setProfileForm((f) => ({ ...f, latitude, longitude }))
        }
      />
      <FileUploadField
        label="Proof of identity / business"
        value={profileForm.proofUrl}
        onChange={(url) => setProfileForm((f) => ({ ...f, proofUrl: url }))}
      />
    </>
  );
}

export function TankerSupplierPage() {
  const toast = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = useMemo(
    () => tabFromPath(location.pathname, searchParams.get("tab")),
    [location.pathname, searchParams],
  );

  const [profileLoading, setProfileLoading] = useState(true);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(emptyProfile);
  const [savingProfile, setSavingProfile] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const [vehicles, setVehicles] = useState<Paginated<Vehicle> | null>(null);
  const [vehPage, setVehPage] = useState(1);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [updatingVehicleId, setUpdatingVehicleId] = useState<string | null>(null);

  const [requests, setRequests] = useState<Paginated<TankerRequest> | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Paginated<TankerRequest> | null>(null);
  const [reqPage, setReqPage] = useState(1);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [acceptVehicleId, setAcceptVehicleId] = useState<Record<string, string>>({});

  const [orders, setOrders] = useState<Paginated<TankerOrder> | null>(null);
  const [ordPage, setOrdPage] = useState(1);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [sharingOrderId, setSharingOrderId] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState("");

  const [invoices, setInvoices] = useState<Paginated<Invoice> | null>(null);
  const [invPage, setInvPage] = useState(1);

  const watchIdRef = useRef<number | null>(null);
  const shareSocketRef = useRef<ReturnType<typeof createTankerSocket> | null>(null);

  const stopSharingLocation = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    shareSocketRef.current?.disconnect();
    shareSocketRef.current = null;
    setSharingOrderId(null);
    setLocationStatus("");
  }, []);

  const switchTab = (next: SupplierTab) => {
    const paths: Record<SupplierTab, string> = {
      home: "/app/supplier",
      fleet: "/app/supplier/fleet",
      requests: "/app/supplier/requests",
      orders: "/app/supplier/orders",
      invoices: "/app/supplier/invoices",
      profile: "/app/supplier/profile",
    };
    navigate(paths[next]);
  };

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const me = await api.get<Supplier>("/tanker/suppliers/me");
      setSupplier(me);
      setNeedsProfile(false);
      setProfileForm(supplierToForm(me));
    } catch (err) {
      if (isNotFoundError(err)) {
        setSupplier(null);
        setNeedsProfile(true);
        setProfileForm((f) => ({
          ...f,
          fullName: f.fullName || user?.name || "",
          email: f.email || user?.email || "",
        }));
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to load supplier profile");
      }
    } finally {
      setProfileLoading(false);
    }
  }, [toast, user?.email, user?.name]);

  const loadFleet = useCallback(async () => {
    if (!supplier) return;
    const limit = tab === "home" ? 5 : 10;
    try {
      const list = await api.get<Paginated<Vehicle>>(
        `/tanker/vehicles${qs({ page: tab === "home" ? 1 : vehPage, limit, supplierId: supplier.id })}`,
      );
      setVehicles(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load fleet");
    }
  }, [supplier, tab, toast, vehPage]);

  const loadRequests = useCallback(async () => {
    if (!supplier) return;
    const limit = tab === "home" ? 5 : 10;
    try {
      const [list, pending] = await Promise.all([
        api.get<Paginated<TankerRequest>>(
          `/tanker/requests${qs({ page: tab === "home" ? 1 : reqPage, limit, supplierId: supplier.id })}`,
        ),
        api.get<Paginated<TankerRequest>>(
          `/tanker/requests${qs({ page: 1, limit: 5, supplierId: supplier.id, status: "pending" })}`,
        ),
      ]);
      setRequests(list);
      setPendingRequests(pending);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load requests");
    }
  }, [reqPage, supplier, tab, toast]);

  const loadOrders = useCallback(async () => {
    if (!supplier) return;
    const limit = tab === "home" ? 5 : 10;
    try {
      const list = await api.get<Paginated<TankerOrder>>(
        `/tanker/orders${qs({ page: tab === "home" ? 1 : ordPage, limit, supplierId: supplier.id })}`,
      );
      setOrders(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load orders");
    }
  }, [ordPage, supplier, tab, toast]);

  const loadInvoices = useCallback(async () => {
    if (!supplier) return;
    try {
      const list = await api.get<Paginated<Invoice>>(
        `/tanker/invoices${qs({ page: invPage, limit: 10, supplierId: supplier.id })}`,
      );
      setInvoices(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoices");
    }
  }, [invPage, supplier, toast]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!supplier) return;
    if (tab === "fleet" || tab === "home" || tab === "requests") void loadFleet();
    if (tab === "requests" || tab === "home") void loadRequests();
    if (tab === "orders" || tab === "home") void loadOrders();
    if (tab === "invoices") void loadInvoices();
  }, [loadFleet, loadInvoices, loadOrders, loadRequests, supplier, tab]);

  useEffect(() => {
    if (tab !== "orders") stopSharingLocation();
    return () => stopSharingLocation();
  }, [stopSharingLocation, tab]);

  function startSharingLocation(orderId: string) {
    stopSharingLocation();
    if (!navigator.geolocation) {
      toast.error("Geolocation not available");
      return;
    }
    setSharingOrderId(orderId);
    setLocationStatus("Starting location sharing…");

    const socket = createTankerSocket();
    socket.connect();
    shareSocketRef.current = socket;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocationStatus(`Sharing: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        void (async () => {
          try {
            await api.post(`/tanker/orders/${orderId}/location`, { latitude, longitude });
            socket.emit("driverLocationUpdate", { orderId, latitude, longitude });
          } catch (err) {
            setLocationStatus(err instanceof Error ? err.message : "Failed to update location");
          }
        })();
      },
      (err) => setLocationStatus(err.message || "Location error"),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }

  function buildProfilePayload() {
    const lat = profileForm.latitude.trim() ? Number(profileForm.latitude) : null;
    const lng = profileForm.longitude.trim() ? Number(profileForm.longitude) : null;
    if (profileForm.latitude && !Number.isFinite(lat)) {
      throw new Error("Enter a valid latitude");
    }
    if (profileForm.longitude && !Number.isFinite(lng)) {
      throw new Error("Enter a valid longitude");
    }
    return {
      fullName: profileForm.fullName.trim(),
      email: profileForm.email.trim() || null,
      alternateMobile: profileForm.alternateMobile.trim() || null,
      address: profileForm.address.trim(),
      landmark: profileForm.landmark.trim() || null,
      city: profileForm.city.trim(),
      state: profileForm.state.trim(),
      country: profileForm.country.trim() || "IN",
      pinCode: profileForm.pinCode.trim(),
      availabilityStartTime: profileForm.availabilityStartTime,
      availabilityEndTime: profileForm.availabilityEndTime,
      latitude: lat,
      longitude: lng,
      proofUrl: profileForm.proofUrl.trim() || null,
    };
  }

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const payload = buildProfilePayload();
      const isCreate = needsProfile;
      const saved = isCreate
        ? await api.post<Supplier>("/tanker/suppliers/me", payload)
        : await api.patch<Supplier>("/tanker/suppliers/me", payload);
      setSupplier(saved);
      setNeedsProfile(false);
      setProfileForm(supplierToForm(saved));
      toast.success(isCreate ? "Supplier profile created" : "Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function onToggleOnline() {
    if (!supplier) return;
    setTogglingOnline(true);
    try {
      const saved = await api.patch<Supplier>("/tanker/suppliers/me/online", {
        isOnline: !supplier.isOnline,
      });
      setSupplier(saved);
      toast.success(saved.isOnline ? "You are online" : "You are offline");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update online status");
    } finally {
      setTogglingOnline(false);
    }
  }

  async function onAddVehicle(e: FormEvent) {
    e.preventDefault();
    const capacity = Number(vehicleForm.capacityLitres);
    const amountInr = Number(vehicleForm.amountInr);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      toast.error("Enter a valid capacity");
      return;
    }
    if (!Number.isFinite(amountInr) || amountInr < 0) {
      toast.error("Enter a valid amount in INR");
      return;
    }
    setSavingVehicle(true);
    try {
      await api.post("/tanker/vehicles", {
        driverFullName: vehicleForm.driverFullName.trim(),
        driverMobile: vehicleForm.driverMobile.trim(),
        driverEmail: vehicleForm.driverEmail.trim() || null,
        vehicleNumber: vehicleForm.vehicleNumber.trim().toUpperCase(),
        capacityLitres: Math.round(capacity),
        amountInPaise: Math.round(amountInr * 100),
        waterType: vehicleForm.waterType.trim() || "drinking",
        licenceFrontUrl: vehicleForm.licenceFrontUrl.trim() || null,
        licenceBackUrl: vehicleForm.licenceBackUrl.trim() || null,
        tankerImageUrl: vehicleForm.tankerImageUrl.trim() || null,
      });
      toast.success("Vehicle added");
      setShowVehicleModal(false);
      setVehicleForm(emptyVehicle);
      await loadFleet();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add vehicle");
    } finally {
      setSavingVehicle(false);
    }
  }

  async function onUpdateVehicleStatus(vehicleId: string, status: string) {
    setUpdatingVehicleId(vehicleId);
    try {
      await api.patch(`/tanker/vehicles/${vehicleId}`, { status });
      toast.success("Vehicle status updated");
      await loadFleet();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update vehicle");
    } finally {
      setUpdatingVehicleId(null);
    }
  }

  async function onDecide(requestId: string, status: "accepted" | "rejected") {
    setDecidingId(requestId);
    try {
      await api.post(`/tanker/requests/${requestId}/decide`, {
        status,
        vehicleId: status === "accepted" ? acceptVehicleId[requestId] || undefined : undefined,
      });
      toast.success(status === "accepted" ? "Request accepted" : "Request rejected");
      await Promise.all([loadRequests(), loadOrders(), loadFleet()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update request");
    } finally {
      setDecidingId(null);
    }
  }

  async function onUpdateOrderStatus(orderId: string, status: string) {
    setUpdatingOrderId(orderId);
    try {
      await api.patch(`/tanker/orders/${orderId}/status`, { status });
      toast.success("Order status updated");
      await loadOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  const tabs: Array<{ id: SupplierTab; label: string }> = [
    { id: "home", label: "Home" },
    { id: "fleet", label: "Fleet" },
    { id: "requests", label: "Requests" },
    { id: "orders", label: "Orders" },
    { id: "invoices", label: "Invoices" },
    { id: "profile", label: "Profile" },
  ];

  const availableVehicles = (vehicles?.items ?? []).filter((v) => v.status === "available" && v.isActive);
  const activeOrderCount = (orders?.items ?? []).filter((o) => isActiveOrder(o.status)).length;
  const pendingCount = pendingRequests?.total ?? 0;

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Supplier console</h2>
          <p>
            {supplier
              ? `${supplier.fullName} · ${supplier.city}, ${supplier.pinCode}`
              : "Manage fleet, requests, orders, and deliveries."}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void loadProfile()}>
          Refresh
        </button>
      </div>

      {needsProfile ? (
        <div className="panel" style={{ marginBottom: "1rem", borderColor: "var(--accent)" }}>
          <div className="panel-body">
            <p style={{ margin: 0 }}>
              <strong>Complete your supplier profile</strong> to go online, add vehicles, and accept
              requests.{" "}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => switchTab("profile")}>
                Go to Profile
              </button>
            </p>
          </div>
        </div>
      ) : null}

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {profileLoading && tab !== "profile" ? (
        <p className="loading">Loading supplier data…</p>
      ) : null}

      {tab === "home" ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <h3>Overview</h3>
              {supplier ? (
                <button
                  type="button"
                  className={supplier.isOnline ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                  disabled={togglingOnline}
                  onClick={() => void onToggleOnline()}
                >
                  {togglingOnline
                    ? "Updating…"
                    : supplier.isOnline
                      ? "Online — go offline"
                      : "Offline — go online"}
                </button>
              ) : null}
            </div>
            <div className="panel-body">
              {needsProfile ? (
                <p className="withdraw-hint">
                  Set up your profile to start receiving water tanker requests.
                </p>
              ) : supplier ? (
                <>
                  <p>
                    Status: <StatusBadge status={supplier.isOnline ? "active" : "inactive"} /> · Hours{" "}
                    {supplier.availabilityStartTime}–{supplier.availabilityEndTime}
                  </p>
                  <p style={{ color: "var(--muted)" }}>{supplier.address}</p>
                </>
              ) : null}

              <div className="kpi-grid kpi-grid-compact" style={{ marginTop: "1rem" }}>
                <KpiCard label="Vehicles" value={vehicles?.total ?? 0} />
                <KpiCard label="Pending requests" value={pendingCount} />
                <KpiCard label="Active orders" value={activeOrderCount} hint={`${orders?.total ?? 0} total`} />
              </div>

              <div className="toolbar" style={{ marginTop: "1rem", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={needsProfile}
                  onClick={() => (needsProfile ? switchTab("profile") : setShowVehicleModal(true))}
                >
                  Add tanker
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchTab("requests")}>
                  View requests
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchTab("invoices")}>
                  Invoices
                </button>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Pending requests</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchTab("requests")}>
                View all
              </button>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Water</th>
                    <th>Address</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(pendingRequests?.items ?? []).slice(0, 5).map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                      <td>
                        {r.waterType} · {r.quantityLitres.toLocaleString("en-IN")} L
                      </td>
                      <td>{r.deliveryAddress}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                  {(pendingRequests?.items.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">
                        {needsProfile ? "Complete your profile to receive requests." : "No pending requests."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Fleet preview</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchTab("fleet")}>
                Manage fleet
              </button>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Capacity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(vehicles?.items ?? []).slice(0, 5).map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.vehicleNumber}</strong>
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{v.waterType}</div>
                      </td>
                      <td>
                        {v.driverFullName}
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{v.driverMobile}</div>
                      </td>
                      <td>{v.capacityLitres.toLocaleString("en-IN")} L</td>
                      <td>
                        <StatusBadge status={v.status} />
                      </td>
                    </tr>
                  ))}
                  {(vehicles?.items.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">
                        {needsProfile ? "Add vehicles after completing your profile." : "No vehicles yet."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {tab === "fleet" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Fleet</h3>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={needsProfile}
              onClick={() => (needsProfile ? switchTab("profile") : setShowVehicleModal(true))}
            >
              Add vehicle
            </button>
          </div>
          {needsProfile ? (
            <p className="withdraw-hint" style={{ padding: "0 1rem" }}>
              Complete your supplier profile before adding vehicles.
            </p>
          ) : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Capacity</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(vehicles?.items ?? []).map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.vehicleNumber}</strong>
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{v.waterType}</div>
                    </td>
                    <td>
                      {v.driverFullName}
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{v.driverMobile}</div>
                    </td>
                    <td>{v.capacityLitres.toLocaleString("en-IN")} L</td>
                    <td>{formatInrFromPaise(v.amountInPaise)}</td>
                    <td>
                      <select
                        value={v.status}
                        disabled={updatingVehicleId === v.id || needsProfile}
                        onChange={(e) => void onUpdateVehicleStatus(v.id, e.target.value)}
                        style={{ maxWidth: "9rem" }}
                      >
                        {VEHICLE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {(vehicles?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      {needsProfile ? "Complete profile first." : "No vehicles yet. Add your first tanker."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {(vehicles?.totalPages ?? 0) > 1 ? (
            <Pagination
              page={vehPage}
              totalPages={vehicles!.totalPages}
              total={vehicles!.total}
              onPageChange={setVehPage}
            />
          ) : null}
        </section>
      ) : null}

      {tab === "requests" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Requests</h3>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Water</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(requests?.items ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                    <td>
                      {r.waterType} · {r.quantityLitres.toLocaleString("en-IN")} L
                    </td>
                    <td>
                      {r.deliveryAddress}
                      {r.comments ? (
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{r.comments}</div>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>
                      {r.status === "pending" && !needsProfile ? (
                        <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.35rem" }}>
                          <select
                            value={acceptVehicleId[r.id] ?? ""}
                            onChange={(e) =>
                              setAcceptVehicleId((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            style={{ maxWidth: "10rem" }}
                          >
                            <option value="">Vehicle (optional)</option>
                            {availableVehicles.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.vehicleNumber}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={decidingId === r.id}
                            onClick={() => void onDecide(r.id, "accepted")}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={decidingId === r.id}
                            onClick={() => void onDecide(r.id, "rejected")}
                          >
                            Reject
                          </button>
                        </div>
                      ) : r.status === "pending" && needsProfile ? (
                        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Profile required</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {(requests?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      {needsProfile
                        ? "Complete your profile to receive requests."
                        : "No requests assigned to you yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {(requests?.totalPages ?? 0) > 1 ? (
            <Pagination
              page={reqPage}
              totalPages={requests!.totalPages}
              total={requests!.total}
              onPageChange={setReqPage}
            />
          ) : null}
        </section>
      ) : null}

      {tab === "orders" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Orders</h3>
          </div>
          {locationStatus ? <p className="withdraw-hint" style={{ padding: "0 1rem" }}>{locationStatus}</p> : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Delivery</th>
                  <th>Amount</th>
                  <th>OTP</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(orders?.items ?? []).map((o) => (
                  <tr key={o.id}>
                    <td>{new Date(o.createdAt).toLocaleString("en-IN")}</td>
                    <td>
                      {o.deliveryAddress}
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {o.waterType} · {o.capacityLitres.toLocaleString("en-IN")} L
                        {o.vehicleNumber ? ` · ${o.vehicleNumber}` : ""}
                      </div>
                    </td>
                    <td>
                      {formatInrFromPaise(o.amountInPaise)}
                      <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{o.paymentStatus}</div>
                    </td>
                    <td>{o.deliveryOtp ?? "—"}</td>
                    <td>
                      <div className="toolbar" style={{ gap: "0.35rem" }}>
                        <StatusBadge status={o.status} />
                        {isActiveOrder(o.status) && !needsProfile ? (
                          <select
                            value={o.status}
                            disabled={updatingOrderId === o.id}
                            onChange={(e) => void onUpdateOrderStatus(o.id, e.target.value)}
                          >
                            {ORDER_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {isActiveOrder(o.status) && !needsProfile ? (
                        sharingOrderId === o.id ? (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={stopSharingLocation}>
                            Stop sharing
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={sharingOrderId != null}
                            onClick={() => startSharingLocation(o.id)}
                          >
                            Share location
                          </button>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {(orders?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      {needsProfile ? "Orders appear after your profile is set up." : "No orders yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {(orders?.totalPages ?? 0) > 1 ? (
            <Pagination
              page={ordPage}
              totalPages={orders!.totalPages}
              total={orders!.total}
              onPageChange={setOrdPage}
            />
          ) : null}
        </section>
      ) : null}

      {tab === "invoices" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>Invoices</h3>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(invoices?.items ?? []).map((inv) => (
                  <tr key={inv.id}>
                    <td>{new Date(inv.createdAt).toLocaleString("en-IN")}</td>
                    <td>
                      <code>{inv.orderId.slice(0, 8)}…</code>
                    </td>
                    <td>{formatInrFromPaise(inv.amountInPaise)}</td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                  </tr>
                ))}
                {(invoices?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">
                      {needsProfile ? "Invoices appear after your first paid order." : "No invoices yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {(invoices?.totalPages ?? 0) > 1 ? (
            <Pagination
              page={invPage}
              totalPages={invoices!.totalPages}
              total={invoices!.total}
              onPageChange={setInvPage}
            />
          ) : null}
        </section>
      ) : null}

      {tab === "profile" ? (
        <section className="panel">
          <div className="panel-head">
            <h3>{needsProfile ? "Create supplier profile" : "Supplier profile"}</h3>
          </div>
          <div className="panel-body">
            {profileLoading ? (
              <p className="loading">Loading profile…</p>
            ) : (
              <form className="withdraw-form" onSubmit={(e) => void onSaveProfile(e)}>
                <ProfileFormFields
                  profileForm={profileForm}
                  setProfileForm={setProfileForm}
                  idPrefix="s"
                />
                <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                  {savingProfile
                    ? "Saving…"
                    : needsProfile
                      ? "Create supplier profile"
                      : "Save changes"}
                </button>
              </form>
            )}
          </div>
        </section>
      ) : null}

      {showVehicleModal ? (
        <Modal
          title="Add vehicle"
          onClose={() => setShowVehicleModal(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShowVehicleModal(false)}>
                Cancel
              </button>
              <button
                type="submit"
                form="add-vehicle-form"
                className="btn btn-primary"
                disabled={savingVehicle}
              >
                {savingVehicle ? "Saving…" : "Add vehicle"}
              </button>
            </>
          }
        >
          <form id="add-vehicle-form" onSubmit={(e) => void onAddVehicle(e)}>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="v-num">Vehicle number</label>
                <input
                  id="v-num"
                  required
                  minLength={4}
                  value={vehicleForm.vehicleNumber}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="v-water">Water type</label>
                <select
                  id="v-water"
                  value={vehicleForm.waterType}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, waterType: e.target.value }))}
                >
                  <option value="drinking">Drinking</option>
                  <option value="bore">Bore</option>
                  <option value="raw">Raw</option>
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="v-driver">Driver name</label>
                <input
                  id="v-driver"
                  required
                  minLength={2}
                  value={vehicleForm.driverFullName}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, driverFullName: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="v-mobile">Driver mobile</label>
                <input
                  id="v-mobile"
                  required
                  minLength={10}
                  value={vehicleForm.driverMobile}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, driverMobile: e.target.value }))}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="v-email">Driver email (optional)</label>
              <input
                id="v-email"
                type="email"
                value={vehicleForm.driverEmail}
                onChange={(e) => setVehicleForm((f) => ({ ...f, driverEmail: e.target.value }))}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="v-cap">Capacity (litres)</label>
                <input
                  id="v-cap"
                  type="number"
                  min={100}
                  required
                  value={vehicleForm.capacityLitres}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, capacityLitres: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="v-amt">Amount (INR)</label>
                <input
                  id="v-amt"
                  type="number"
                  min={0}
                  required
                  value={vehicleForm.amountInr}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, amountInr: e.target.value }))}
                />
              </div>
            </div>
            <FileUploadField
              label="Licence (front)"
              value={vehicleForm.licenceFrontUrl}
              onChange={(url) => setVehicleForm((f) => ({ ...f, licenceFrontUrl: url }))}
            />
            <FileUploadField
              label="Licence (back)"
              value={vehicleForm.licenceBackUrl}
              onChange={(url) => setVehicleForm((f) => ({ ...f, licenceBackUrl: url }))}
            />
            <FileUploadField
              label="Tanker photo"
              value={vehicleForm.tankerImageUrl}
              onChange={(url) => setVehicleForm((f) => ({ ...f, tankerImageUrl: url }))}
            />
          </form>
        </Modal>
      ) : null}
    </>
  );
}
