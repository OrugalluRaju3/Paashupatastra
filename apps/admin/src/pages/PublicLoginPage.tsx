import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth, getStoredModule } from "../auth/AuthContext";
import { publicHomePath, type AuthModule, type PublicIntent } from "../auth/types";
import { FileUploadField } from "../components/FileUploadField";
import { GeoCoordFields } from "../components/GeoCoordFields";
import {
  TermsAcceptCheckbox,
  recordTermsAcceptance,
} from "../components/TermsAcceptCheckbox";
import { useToast } from "../components/Toast";
import {
  DEFAULT_PARKING_VEHICLE_TYPES,
  PARKING_VEHICLE_TYPE_OPTIONS,
  toggleParkingVehicleType,
} from "../lib/parkingVehicleTypes";
import { digitsPhone, isValidPhone } from "../lib/phone";

type Mode = "login" | "signup";

const emptyCustomer = {
  fullName: "",
  email: "",
  city: "",
  state: "",
  pinCode: "",
  country: "IN",
};

const emptyOwner = {
  fullName: "",
  email: "",
  buildingName: "",
  flatNumber: "",
  blockTower: "",
  city: "",
  state: "",
  country: "IN",
  pinCode: "",
  addressLine: "",
  latitude: "",
  longitude: "",
  parkingSlotNumber: "",
  parkingType: "covered",
  vehicleTypesAllowed: ["car", "bike", "auto"] as string[],
  availabilityStartTime: "06:00",
  availabilityEndTime: "22:00",
  availableDays: "all_days",
  rentType: "monthly",
  priceInr: "",
  isActive: true,
  governmentIdUrl: "",
  apartmentProofUrl: "",
  parkingSlotProofUrl: "",
  parkingPhotoUrl: "",
  entrancePhotoUrl: "",
  accountHolderName: "",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  upiId: "",
};

type VehicleEntry = {
  driverFirstName: string;
  driverLastName: string;
  driverEmail: string;
  driverMobile: string;
  waterType: string;
  vehicleNumber: string;
  capacityLitres: string;
  amountInr: string;
  licenceFrontUrl: string;
  licenceBackUrl: string;
  tankerImageUrl: string;
  latitude: string;
  longitude: string;
};

import { DEFAULT_TANKER_WATER_TYPE, TANKER_WATER_TYPE_OPTIONS } from "../lib/tankerWaterTypes";

const emptyVehicleEntry = (): VehicleEntry => ({
  driverFirstName: "",
  driverLastName: "",
  driverEmail: "",
  driverMobile: "",
  waterType: DEFAULT_TANKER_WATER_TYPE,
  vehicleNumber: "",
  capacityLitres: "",
  amountInr: "",
  licenceFrontUrl: "",
  licenceBackUrl: "",
  tankerImageUrl: "",
  latitude: "",
  longitude: "",
});

const emptySupplier = {
  firstName: "",
  lastName: "",
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

const emptyProvider = {
  fullName: "",
  email: "",
  alternateMobile: "",
  address: "",
  city: "",
  state: "",
  country: "IN",
  pinCode: "",
  latitude: "",
  longitude: "",
  serviceRadiusKm: "10",
  proofUrl: "",
};

export function PublicLoginPage({ module }: { module: AuthModule }) {
  const toast = useToast();
  const { token, portal, requestOtp, loginPublic, signupPublic } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [intent, setIntent] = useState<PublicIntent>("customer");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpHint, setOtpHint] = useState("");
  const [debugOtp, setDebugOtp] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [owner, setOwner] = useState(emptyOwner);
  const [supplier, setSupplier] = useState(emptySupplier);
  const [provider, setProvider] = useState(emptyProvider);
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([emptyVehicleEntry()]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsId, setTermsId] = useState<number | null>(null);

  useEffect(() => {
    if (module === "parking" && (intent === "supplier" || intent === "driver" || intent === "provider" || intent === "worker")) {
      setIntent("customer");
    }
    if (module === "tanker" && (intent === "owner" || intent === "provider" || intent === "worker")) {
      setIntent("customer");
    }
    if (module === "seva" && (intent === "owner" || intent === "supplier" || intent === "driver")) {
      setIntent("customer");
    }
    setTermsAccepted(false);
    setTermsId(null);
  }, [module, intent]);

  function signupAudience():
    | "customer"
    | "parking_owner"
    | "tanker_supplier"
    | "tanker_driver"
    | "seva_provider"
    | "seva_worker" {
    if (intent === "owner") return "parking_owner";
    if (intent === "supplier") return "tanker_supplier";
    if (intent === "driver") return "tanker_driver";
    if (intent === "provider") return "seva_provider";
    if (intent === "worker") return "seva_worker";
    return "customer";
  }

  async function acceptTermsIfNeeded() {
    if (termsId) {
      await recordTermsAcceptance(termsId, "registration").catch(() => undefined);
    }
  }

  if (token && portal === "public") {
    const storedModule = getStoredModule() ?? module;
    return (
      <Navigate
        to={publicHomePath(localStorage.getItem("paash_intent"), storedModule)}
        replace
      />
    );
  }

  function switchMode(next: Mode) {
    setMode(next);
    if (next === "signup" && intent === "driver") {
      setIntent("supplier");
    }
    if (next === "signup" && intent === "worker") {
      setIntent("provider");
    }
    setOtpSent(false);
    setOtp("");
    setOtpHint("");
    setDebugOtp(undefined);
  }

  function signupEmail() {
    if (intent === "owner") return owner.email.trim();
    if (intent === "supplier") return supplier.email.trim();
    if (intent === "provider") return provider.email.trim();
    return customer.email.trim();
  }

  function updateVehicle(index: number, patch: Partial<VehicleEntry>) {
    setVehicles((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function addVehicle() {
    setVehicles((prev) => [...prev, emptyVehicleEntry()]);
  }

  function removeVehicle(index: number) {
    setVehicles((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function copySupplierLocationToVehicle(index: number) {
    updateVehicle(index, {
      latitude: supplier.latitude,
      longitude: supplier.longitude,
    });
  }

  function intentLabel(value: PublicIntent) {
    if (value === "owner") return "Owner";
    if (value === "supplier") return "Water supplier";
    if (value === "driver") return "Tanker driver";
    if (value === "provider") return "Seva provider";
    if (value === "worker") return "Seva worker";
    return "Customer";
  }

  async function onSendOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await requestOtp(phone, {
        email: mode === "signup" ? signupEmail() : undefined,
        module,
        purpose: mode === "signup" ? "signup" : "login",
        portal: "public",
        intent,
      });
      setDebugOtp(res.debugOtp);
      setOtp("");
      setOtpHint(res.message ?? "OTP sent");
      setOtpSent(true);
      toast.success(res.message ?? "OTP sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !termsAccepted && termsId) {
      toast.error("Please accept the Terms & Conditions to continue");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup" && intent === "customer") {
        await signupPublic(phone, otp, intent, module, {
          fullName: customer.fullName.trim(),
          email: customer.email.trim(),
          city: customer.city.trim(),
          state: customer.state.trim(),
          country: customer.country.trim() || "IN",
          pinCode: customer.pinCode.trim(),
        });
        await acceptTermsIfNeeded();
        toast.success(
          module === "tanker"
            ? "Tanker customer account created"
            : module === "seva"
              ? "Seva customer account created"
              : "Customer account created successfully",
        );
        navigate(publicHomePath(intent, module));
        return;
      }

      if (mode === "signup" && intent === "provider") {
        const lat = provider.latitude.trim() ? Number(provider.latitude) : null;
        const lng = provider.longitude.trim() ? Number(provider.longitude) : null;
        if (provider.latitude.trim() && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
          throw new Error("Enter valid latitude and longitude");
        }
        if (provider.alternateMobile.trim() && !isValidPhone(provider.alternateMobile.trim())) {
          throw new Error("Enter a valid 10-digit alternate mobile number");
        }
        const radius = Number(provider.serviceRadiusKm || 10);
        if (!Number.isFinite(radius) || radius <= 0) {
          throw new Error("Enter a valid service radius in km");
        }

        await signupPublic(phone, otp, "provider", module, {
          fullName: provider.fullName.trim(),
          email: provider.email.trim(),
          city: provider.city.trim(),
          state: provider.state.trim(),
          country: provider.country.trim() || "IN",
          pinCode: provider.pinCode.trim(),
        });

        await api.post("/seva/providers/register", {
          fullName: provider.fullName.trim(),
          email: provider.email.trim() || null,
          alternateMobile: provider.alternateMobile.trim() || null,
          address: provider.address.trim(),
          city: provider.city.trim(),
          state: provider.state.trim(),
          country: provider.country.trim() || "IN",
          pinCode: provider.pinCode.trim(),
          latitude: lat,
          longitude: lng,
          serviceRadiusKm: Math.round(radius),
          proofUrl: provider.proofUrl.trim() || null,
        });

        await acceptTermsIfNeeded();
        toast.success("Seva provider account created");
        navigate(publicHomePath("provider", module));
        return;
      }

      if (mode === "signup" && intent === "supplier") {
        const lat = Number(supplier.latitude);
        const lng = Number(supplier.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error("Enter valid latitude and longitude");
        }
        if (!supplier.proofUrl.trim()) {
          throw new Error("Upload suppliership proof");
        }
        if (!supplier.firstName.trim()) {
          throw new Error("Enter first name");
        }
        if (!supplier.address.trim() || !supplier.landmark.trim()) {
          throw new Error("Enter address and landmark");
        }

        const fullName = `${supplier.firstName} ${supplier.lastName}`.trim().replace(/\s+/g, " ");
        const vehiclePayloads = vehicles.map((v, index) => {
          const driverFullName = `${v.driverFirstName} ${v.driverLastName}`.trim().replace(/\s+/g, " ");
          if (!v.driverFirstName.trim()) {
            throw new Error(`Vehicle ${index + 1}: enter driver first name`);
          }
          if (!v.driverEmail.trim()) {
            throw new Error(`Vehicle ${index + 1}: enter driver email`);
          }
          if (v.driverMobile.replace(/\D/g, "").length !== 10) {
            throw new Error(`Vehicle ${index + 1}: enter valid 10-digit driver mobile`);
          }
          if (!v.vehicleNumber.trim()) {
            throw new Error(`Vehicle ${index + 1}: enter vehicle number`);
          }
          const capacityLitres = Number(v.capacityLitres);
          if (!Number.isFinite(capacityLitres) || capacityLitres <= 0) {
            throw new Error(`Vehicle ${index + 1}: enter valid tanker capacity in litres`);
          }
          const amountInPaise = Math.round(Number(v.amountInr) * 100);
          if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
            throw new Error(`Vehicle ${index + 1}: enter valid tanker amount in INR`);
          }
          if (!v.licenceFrontUrl.trim() || !v.licenceBackUrl.trim()) {
            throw new Error(`Vehicle ${index + 1}: upload licence front and back`);
          }
          return {
            driverFullName,
            driverMobile: v.driverMobile.replace(/\D/g, "").slice(0, 10),
            driverEmail: v.driverEmail.trim(),
            vehicleNumber: v.vehicleNumber.trim(),
            capacityLitres,
            amountInPaise,
            waterType: v.waterType,
            licenceFrontUrl: v.licenceFrontUrl.trim(),
            licenceBackUrl: v.licenceBackUrl.trim(),
            tankerImageUrl: v.tankerImageUrl.trim() || null,
          };
        });

        await signupPublic(phone, otp, "supplier", module, {
          fullName,
          email: supplier.email.trim(),
          city: supplier.city.trim(),
          state: supplier.state.trim(),
          country: "IN",
          pinCode: supplier.pinCode.trim(),
        });

        await api.post("/tanker/suppliers/register", {
          fullName,
          email: supplier.email.trim(),
          alternateMobile: supplier.alternateMobile.replace(/\D/g, "").slice(0, 10) || null,
          address: supplier.address.trim(),
          landmark: supplier.landmark.trim(),
          city: supplier.city.trim(),
          state: supplier.state.trim(),
          country: "IN",
          pinCode: supplier.pinCode.trim(),
          availabilityStartTime: supplier.availabilityStartTime,
          availabilityEndTime: supplier.availabilityEndTime,
          latitude: lat,
          longitude: lng,
          proofUrl: supplier.proofUrl.trim(),
          vehicles: vehiclePayloads,
        });

        toast.success("Supplier registered successfully");
        await acceptTermsIfNeeded();
        navigate(publicHomePath("supplier", module));
        return;
      }

      if (mode === "signup" && intent === "owner") {
        const priceInPaise = Math.round(Number(owner.priceInr) * 100);
        if (!Number.isFinite(priceInPaise) || priceInPaise <= 0) {
          throw new Error("Enter a valid rent price in INR");
        }
        const lat = Number(owner.latitude);
        const lng = Number(owner.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error("Enter valid latitude and longitude");
        }
        if (owner.vehicleTypesAllowed.length === 0) {
          throw new Error("Select at least one vehicle type (car, bike, auto, or EV)");
        }
        if (!owner.governmentIdUrl.trim() || !owner.apartmentProofUrl.trim() || !owner.parkingSlotProofUrl.trim()) {
          throw new Error("Upload government ID, apartment proof, and parking slot proof");
        }
        const fullName = owner.fullName.trim().replace(/\s+/g, " ");
        const accountHolderName = owner.accountHolderName.trim().replace(/\s+/g, " ");
        if (!accountHolderName) {
          throw new Error("Enter bank account holder name");
        }
        if (fullName.toLowerCase() !== accountHolderName.toLowerCase()) {
          throw new Error("Full name and bank account holder name must match");
        }

        await signupPublic(phone, otp, "owner", module, {
          fullName,
          email: owner.email.trim(),
          city: owner.city.trim(),
          state: owner.state.trim(),
          country: owner.country.trim() || "IN",
          pinCode: owner.pinCode.trim(),
        });

        const slotProof = owner.parkingSlotProofUrl.trim();
        const parkingPhoto = owner.parkingPhotoUrl.trim() || slotProof;
        const entrance = owner.entrancePhotoUrl.trim() || slotProof;

        await api.post("/parking/owner-applications", {
          fullName,
          email: owner.email.trim(),
          apartmentName: owner.buildingName.trim(),
          flatNumber: owner.flatNumber.trim(),
          blockTower: owner.blockTower.trim() || "A",
          city: owner.city.trim(),
          state: owner.state.trim(),
          country: owner.country.trim() || "IN",
          pinCode: owner.pinCode.trim(),
          addressLine: owner.addressLine.trim(),
          latitude: lat,
          longitude: lng,
          parkingSlotNumber: owner.parkingSlotNumber.trim(),
          parkingType: owner.parkingType,
          vehicleTypesAllowed:
            owner.vehicleTypesAllowed.length > 0
              ? owner.vehicleTypesAllowed
              : [...DEFAULT_PARKING_VEHICLE_TYPES],
          numberOfSlots: 1,
          availabilityStartTime: owner.availabilityStartTime,
          availabilityEndTime: owner.availabilityEndTime,
          availableDays: owner.availableDays,
          rentType: owner.rentType,
          priceInPaise,
          isActive: owner.isActive,
          accountHolderName,
          bankName: owner.bankName.trim(),
          accountNumber: owner.accountNumber.trim(),
          ifscCode: owner.ifscCode.trim(),
          upiId: owner.upiId.trim() || null,
          governmentIdUrl: owner.governmentIdUrl.trim(),
          ownershipProofUrl: owner.apartmentProofUrl.trim(),
          parkingAllocationProofUrl: slotProof,
          parkingPhotoUrls: [parkingPhoto, parkingPhoto, parkingPhoto],
          entrancePhotoUrl: entrance,
        });

        toast.success("Owner registered. Application submitted for verification.");
        await acceptTermsIfNeeded();
        navigate("/app/owner/listings");
        return;
      }

      await loginPublic(phone, otp, intent, module);
      toast.success("Logged in successfully");
      navigate(publicHomePath(intent, module));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : mode === "signup" ? "Signup failed" : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const wide = mode === "signup" && (intent === "owner" || intent === "supplier" || intent === "provider");

  const productLabel =
    module === "tanker"
      ? "Water tanker"
      : module === "seva"
        ? "Seva — housekeeping & maintenance"
        : "Parking";

  return (
    <div className="auth-page">
      <div className={wide ? "auth-card auth-card-wide" : "auth-card"}>
        <p className="brand-kicker">Paashupatastra · {productLabel}</p>
        <h1>
          {mode === "signup"
            ? module === "seva"
              ? "Create Seva account"
              : `Create ${productLabel.toLowerCase()} account`
            : module === "seva"
              ? "Seva login"
              : `${productLabel} login`}
        </h1>
        <p className="auth-sub">
          {mode === "signup"
            ? intent === "owner"
              ? "Register as an apartment parking owner with full listing details."
              : intent === "supplier"
                ? "Register as a water tanker supplier with fleet and drivers."
                : intent === "provider"
                  ? "Register as a housekeeping & maintenance provider."
                  : module === "tanker"
                    ? "Sign up as a water tanker customer."
                    : module === "seva"
                      ? "Sign up to book housekeeping and maintenance services."
                      : "Sign up as a parking customer."
            : module === "seva"
              ? "Login for housekeeping & maintenance — customer, provider, or worker."
              : "Login with your registered mobile number."}
        </p>

        <div className="intent-tabs">
          <button
            type="button"
            className={mode === "login" ? "intent active" : "intent"}
            onClick={() => switchMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "signup" ? "intent active" : "intent"}
            onClick={() => switchMode("signup")}
          >
            Sign up
          </button>
        </div>

        <div className="intent-tabs">
          <button
            type="button"
            className={intent === "customer" ? "intent active" : "intent"}
            onClick={() => setIntent("customer")}
          >
            Customer
          </button>
          {module === "parking" ? (
            <button
              type="button"
              className={intent === "owner" ? "intent active" : "intent"}
              onClick={() => setIntent("owner")}
            >
              Parking owner
            </button>
          ) : null}
          {module === "tanker" ? (
            <button
              type="button"
              className={intent === "supplier" ? "intent active" : "intent"}
              onClick={() => setIntent("supplier")}
            >
              Water supplier
            </button>
          ) : null}
          {module === "tanker" && mode === "login" ? (
            <button
              type="button"
              className={intent === "driver" ? "intent active" : "intent"}
              onClick={() => setIntent("driver")}
            >
              Tanker driver
            </button>
          ) : null}
          {module === "seva" ? (
            <button
              type="button"
              className={intent === "provider" ? "intent active" : "intent"}
              onClick={() => setIntent("provider")}
            >
              Provider
            </button>
          ) : null}
          {module === "seva" && mode === "login" ? (
            <button
              type="button"
              className={intent === "worker" ? "intent active" : "intent"}
              onClick={() => setIntent("worker")}
            >
              Worker
            </button>
          ) : null}
        </div>

        {!otpSent ? (
          <form onSubmit={onSendOtp} className="auth-form">
            {mode === "signup" && intent === "customer" ? (
              <>
                <div className="field">
                  <label htmlFor="c-name">Full name</label>
                  <input
                    id="c-name"
                    required
                    minLength={2}
                    value={customer.fullName}
                    onChange={(e) => setCustomer({ ...customer, fullName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="c-email">Email</label>
                  <input
                    id="c-email"
                    type="email"
                    required
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                  />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="c-city">City</label>
                    <input
                      id="c-city"
                      required
                      value={customer.city}
                      onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="c-state">State</label>
                    <input
                      id="c-state"
                      required
                      value={customer.state}
                      onChange={(e) => setCustomer({ ...customer, state: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="c-pin">PIN code</label>
                    <input
                      id="c-pin"
                      required
                      maxLength={6}
                      pattern="[0-9]{6}"
                      value={customer.pinCode}
                      onChange={(e) =>
                        setCustomer({ ...customer, pinCode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="c-country">Country</label>
                    <input
                      id="c-country"
                      required
                      value={customer.country}
                      onChange={(e) => setCustomer({ ...customer, country: e.target.value })}
                    />
                  </div>
                </div>
              </>
            ) : null}

            {mode === "signup" && intent === "provider" ? (
              <>
                <div className="field">
                  <label htmlFor="p-name">Full name</label>
                  <input
                    id="p-name"
                    required
                    minLength={2}
                    value={provider.fullName}
                    onChange={(e) => setProvider({ ...provider, fullName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="p-email">Email</label>
                  <input
                    id="p-email"
                    type="email"
                    required
                    value={provider.email}
                    onChange={(e) => setProvider({ ...provider, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="p-alt">Alternate mobile (optional)</label>
                  <input
                    id="p-alt"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit mobile"
                    value={provider.alternateMobile}
                    onChange={(e) =>
                      setProvider({
                        ...provider,
                        alternateMobile: digitsPhone(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="p-address">Service address</label>
                  <input
                    id="p-address"
                    required
                    minLength={3}
                    value={provider.address}
                    onChange={(e) => setProvider({ ...provider, address: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="p-city">City</label>
                    <input
                      id="p-city"
                      required
                      value={provider.city}
                      onChange={(e) => setProvider({ ...provider, city: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="p-state">State</label>
                    <input
                      id="p-state"
                      required
                      value={provider.state}
                      onChange={(e) => setProvider({ ...provider, state: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="p-pin">PIN code</label>
                    <input
                      id="p-pin"
                      required
                      value={provider.pinCode}
                      onChange={(e) => setProvider({ ...provider, pinCode: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="p-radius">Service radius (km)</label>
                    <input
                      id="p-radius"
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={provider.serviceRadiusKm}
                      onChange={(e) => setProvider({ ...provider, serviceRadiusKm: e.target.value })}
                    />
                  </div>
                </div>
                <GeoCoordFields
                  idPrefix="sp"
                  active={mode === "signup" && intent === "provider"}
                  required={false}
                  latitude={provider.latitude}
                  longitude={provider.longitude}
                  onChange={({ latitude, longitude }) =>
                    setProvider((p) => ({ ...p, latitude, longitude }))
                  }
                />
                <FileUploadField
                  label="Proof document (optional)"
                  value={provider.proofUrl}
                  onChange={(url) => setProvider({ ...provider, proofUrl: url })}
                />
              </>
            ) : null}

            {mode === "signup" && intent === "supplier" ? (
              <>
                <div className="form-section">
                  <h4>1. Personal details</h4>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="s-first">First name</label>
                      <input
                        id="s-first"
                        required
                        minLength={2}
                        value={supplier.firstName}
                        onChange={(e) => setSupplier({ ...supplier, firstName: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="s-last">Last name</label>
                      <input
                        id="s-last"
                        value={supplier.lastName}
                        onChange={(e) => setSupplier({ ...supplier, lastName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="s-email">Email</label>
                      <input
                        id="s-email"
                        type="email"
                        required
                        value={supplier.email}
                        onChange={(e) => setSupplier({ ...supplier, email: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="s-alt-mobile">Alternate mobile (optional)</label>
                      <input
                        id="s-alt-mobile"
                        inputMode="numeric"
                        pattern="[0-9]{10}"
                        maxLength={10}
                        placeholder="10-digit mobile"
                        value={supplier.alternateMobile}
                        onChange={(e) =>
                          setSupplier({
                            ...supplier,
                            alternateMobile: e.target.value.replace(/\D/g, "").slice(0, 10),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4>2. Address</h4>
                  <div className="field">
                    <label htmlFor="s-address">Address</label>
                    <input
                      id="s-address"
                      required
                      minLength={3}
                      value={supplier.address}
                      onChange={(e) => setSupplier({ ...supplier, address: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="s-landmark">Landmark</label>
                    <input
                      id="s-landmark"
                      required
                      value={supplier.landmark}
                      onChange={(e) => setSupplier({ ...supplier, landmark: e.target.value })}
                    />
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="s-city">City</label>
                      <input
                        id="s-city"
                        required
                        value={supplier.city}
                        onChange={(e) => setSupplier({ ...supplier, city: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="s-state">State</label>
                      <input
                        id="s-state"
                        required
                        value={supplier.state}
                        onChange={(e) => setSupplier({ ...supplier, state: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="s-pin">PIN code</label>
                      <input
                        id="s-pin"
                        required
                        maxLength={6}
                        pattern="[0-9]{6}"
                        value={supplier.pinCode}
                        onChange={(e) =>
                          setSupplier({ ...supplier, pinCode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="s-country">Country</label>
                      <input id="s-country" required readOnly value="India" />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4>3. Availability & location</h4>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="s-start">Availability start time</label>
                      <input
                        id="s-start"
                        type="time"
                        required
                        value={supplier.availabilityStartTime}
                        onChange={(e) => setSupplier({ ...supplier, availabilityStartTime: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="s-end">Availability end time</label>
                      <input
                        id="s-end"
                        type="time"
                        required
                        value={supplier.availabilityEndTime}
                        onChange={(e) => setSupplier({ ...supplier, availabilityEndTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <GeoCoordFields
                    idPrefix="s"
                    active={mode === "signup" && intent === "supplier"}
                    required
                    latitude={supplier.latitude}
                    longitude={supplier.longitude}
                    onChange={({ latitude, longitude }) =>
                      setSupplier((s) => ({ ...s, latitude, longitude }))
                    }
                  />
                </div>

                <div className="form-section">
                  <h4>4. Suppliership proof</h4>
                  <p>Upload images or PDF (max 8 MB).</p>
                  <FileUploadField
                    label="Suppliership proof"
                    required
                    value={supplier.proofUrl}
                    onChange={(url) => setSupplier({ ...supplier, proofUrl: url })}
                  />
                </div>

                <div className="form-section">
                  <h4>5. Tanker / driver fleet</h4>
                  {vehicles.map((vehicle, index) => (
                    <div key={index} className="form-section" style={{ marginTop: index > 0 ? "1rem" : 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h4 style={{ margin: 0 }}>Tanker {index + 1}</h4>
                        {vehicles.length > 1 ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => removeVehicle(index)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="grid-2">
                        <div className="field">
                          <label htmlFor={`v-first-${index}`}>Driver first name</label>
                          <input
                            id={`v-first-${index}`}
                            required
                            minLength={2}
                            value={vehicle.driverFirstName}
                            onChange={(e) => updateVehicle(index, { driverFirstName: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`v-last-${index}`}>Driver last name</label>
                          <input
                            id={`v-last-${index}`}
                            value={vehicle.driverLastName}
                            onChange={(e) => updateVehicle(index, { driverLastName: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid-2">
                        <div className="field">
                          <label htmlFor={`v-email-${index}`}>Driver email</label>
                          <input
                            id={`v-email-${index}`}
                            type="email"
                            required
                            value={vehicle.driverEmail}
                            onChange={(e) => updateVehicle(index, { driverEmail: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`v-mobile-${index}`}>Driver mobile</label>
                          <input
                            id={`v-mobile-${index}`}
                            inputMode="numeric"
                            pattern="[0-9]{10}"
                            maxLength={10}
                            required
                            placeholder="10-digit mobile"
                            value={vehicle.driverMobile}
                            onChange={(e) =>
                              updateVehicle(index, {
                                driverMobile: e.target.value.replace(/\D/g, "").slice(0, 10),
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid-2">
                        <div className="field">
                          <label htmlFor={`v-water-${index}`}>Water type</label>
                          <select
                            id={`v-water-${index}`}
                            required
                            value={vehicle.waterType}
                            onChange={(e) => updateVehicle(index, { waterType: e.target.value })}
                          >
                            {TANKER_WATER_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor={`v-number-${index}`}>Vehicle number</label>
                          <input
                            id={`v-number-${index}`}
                            required
                            value={vehicle.vehicleNumber}
                            onChange={(e) => updateVehicle(index, { vehicleNumber: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid-2">
                        <div className="field">
                          <label htmlFor={`v-capacity-${index}`}>Tanker capacity (litres)</label>
                          <input
                            id={`v-capacity-${index}`}
                            required
                            inputMode="numeric"
                            value={vehicle.capacityLitres}
                            onChange={(e) => updateVehicle(index, { capacityLitres: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`v-amount-${index}`}>Tanker amount (INR)</label>
                          <input
                            id={`v-amount-${index}`}
                            required
                            inputMode="decimal"
                            value={vehicle.amountInr}
                            onChange={(e) => updateVehicle(index, { amountInr: e.target.value })}
                          />
                        </div>
                      </div>
                      <FileUploadField
                        label="Licence front"
                        required
                        value={vehicle.licenceFrontUrl}
                        onChange={(url) => updateVehicle(index, { licenceFrontUrl: url })}
                      />
                      <FileUploadField
                        label="Licence back"
                        required
                        value={vehicle.licenceBackUrl}
                        onChange={(url) => updateVehicle(index, { licenceBackUrl: url })}
                      />
                      <FileUploadField
                        label="Tanker image (optional)"
                        value={vehicle.tankerImageUrl}
                        onChange={(url) => updateVehicle(index, { tankerImageUrl: url })}
                      />
                      <div className="grid-2">
                        <div className="field">
                          <label htmlFor={`v-lat-${index}`}>Driver latitude (optional)</label>
                          <input
                            id={`v-lat-${index}`}
                            inputMode="decimal"
                            placeholder={supplier.latitude || "Same as supplier"}
                            value={vehicle.latitude}
                            onChange={(e) => updateVehicle(index, { latitude: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`v-lng-${index}`}>Driver longitude (optional)</label>
                          <input
                            id={`v-lng-${index}`}
                            inputMode="decimal"
                            placeholder={supplier.longitude || "Same as supplier"}
                            value={vehicle.longitude}
                            onChange={(e) => updateVehicle(index, { longitude: e.target.value })}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => copySupplierLocationToVehicle(index)}
                      >
                        Use supplier location
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost" onClick={addVehicle}>
                    Add another tanker
                  </button>
                </div>
              </>
            ) : null}

            {mode === "signup" && intent === "owner" ? (
              <>
                <div className="form-section">
                  <h4>1. Personal details</h4>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-name">Full name</label>
                      <input
                        id="o-name"
                        required
                        minLength={2}
                        value={owner.fullName}
                        onChange={(e) => setOwner({ ...owner, fullName: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="o-email">Email</label>
                      <input
                        id="o-email"
                        type="email"
                        required
                        value={owner.email}
                        onChange={(e) => setOwner({ ...owner, email: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4>2. Apartment / building</h4>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-building">Building name</label>
                      <input
                        id="o-building"
                        required
                        value={owner.buildingName}
                        onChange={(e) => setOwner({ ...owner, buildingName: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="o-flat">Flat / plot no</label>
                      <input
                        id="o-flat"
                        required
                        value={owner.flatNumber}
                        onChange={(e) => setOwner({ ...owner, flatNumber: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-block">Block / tower</label>
                      <input
                        id="o-block"
                        required
                        value={owner.blockTower}
                        onChange={(e) => setOwner({ ...owner, blockTower: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="o-address">Address line</label>
                      <input
                        id="o-address"
                        required
                        minLength={5}
                        value={owner.addressLine}
                        onChange={(e) => setOwner({ ...owner, addressLine: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-city">City</label>
                      <input
                        id="o-city"
                        required
                        value={owner.city}
                        onChange={(e) => setOwner({ ...owner, city: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="o-state">State</label>
                      <input
                        id="o-state"
                        required
                        value={owner.state}
                        onChange={(e) => setOwner({ ...owner, state: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-pin">PIN code</label>
                      <input
                        id="o-pin"
                        required
                        maxLength={6}
                        pattern="[0-9]{6}"
                        value={owner.pinCode}
                        onChange={(e) =>
                          setOwner({ ...owner, pinCode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="o-country">Country</label>
                      <input
                        id="o-country"
                        required
                        value={owner.country}
                        onChange={(e) => setOwner({ ...owner, country: e.target.value })}
                      />
                    </div>
                  </div>
                  <GeoCoordFields
                    idPrefix="o"
                    active={mode === "signup" && intent === "owner"}
                    required
                    latitude={owner.latitude}
                    longitude={owner.longitude}
                    onChange={({ latitude, longitude }) =>
                      setOwner((o) => ({ ...o, latitude, longitude }))
                    }
                  />
                </div>

                <div className="form-section">
                  <h4>3. Parking slot</h4>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-slot">Parking slot number</label>
                      <input
                        id="o-slot"
                        required
                        value={owner.parkingSlotNumber}
                        onChange={(e) => setOwner({ ...owner, parkingSlotNumber: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="o-ptype">Parking type</label>
                      <select
                        id="o-ptype"
                        value={owner.parkingType}
                        onChange={(e) => setOwner({ ...owner, parkingType: e.target.value })}
                      >
                        <option value="covered">Covered</option>
                        <option value="open">Open</option>
                        <option value="basement">Basement</option>
                      </select>
                    </div>
                  </div>
                  <fieldset className="field" style={{ border: 0, padding: 0, margin: "0.75rem 0 0" }}>
                    <legend style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
                      Vehicles allowed
                    </legend>
                    <p style={{ margin: "0 0 0.5rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                      Select all vehicle types this slot can accept (car, bike, auto, EV).
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1.25rem" }}>
                      {PARKING_VEHICLE_TYPE_OPTIONS.map((opt) => {
                        const checked = owner.vehicleTypesAllowed.includes(opt.value);
                        return (
                          <label
                            key={opt.value}
                            htmlFor={`o-vtype-${opt.value}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                          >
                            <input
                              id={`o-vtype-${opt.value}`}
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setOwner({
                                  ...owner,
                                  vehicleTypesAllowed: toggleParkingVehicleType(
                                    owner.vehicleTypesAllowed,
                                    opt.value,
                                    e.target.checked,
                                  ),
                                })
                              }
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-start">Availability start time</label>
                      <input
                        id="o-start"
                        type="time"
                        required
                        value={owner.availabilityStartTime}
                        onChange={(e) => setOwner({ ...owner, availabilityStartTime: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="o-end">Availability end time</label>
                      <input
                        id="o-end"
                        type="time"
                        required
                        value={owner.availabilityEndTime}
                        onChange={(e) => setOwner({ ...owner, availabilityEndTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-days">Available days</label>
                      <select
                        id="o-days"
                        value={owner.availableDays}
                        onChange={(e) => setOwner({ ...owner, availableDays: e.target.value })}
                      >
                        <option value="all_days">All days</option>
                        <option value="weekdays">Weekdays</option>
                        <option value="weekends">Weekends</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="o-rent">Rent type</label>
                      <select
                        id="o-rent"
                        value={owner.rentType}
                        onChange={(e) => setOwner({ ...owner, rentType: e.target.value })}
                      >
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-price">Price (INR)</label>
                      <input
                        id="o-price"
                        required
                        inputMode="decimal"
                        placeholder="2500"
                        value={owner.priceInr}
                        onChange={(e) => setOwner({ ...owner, priceInr: e.target.value })}
                      />
                    </div>
                    <label className="checkbox-row" style={{ alignSelf: "end", paddingBottom: "0.55rem" }}>
                      <input
                        type="checkbox"
                        checked={owner.isActive}
                        onChange={(e) => setOwner({ ...owner, isActive: e.target.checked })}
                      />
                      Active / available after verification
                    </label>
                  </div>
                </div>

                <div className="form-section">
                  <h4>4. Documents</h4>
                  <p>Upload images or PDF (max 8 MB each).</p>
                  <FileUploadField
                    label="Any government ID proof"
                    required
                    value={owner.governmentIdUrl}
                    onChange={(url) => setOwner({ ...owner, governmentIdUrl: url })}
                  />
                  <FileUploadField
                    label="Apartment proof"
                    required
                    value={owner.apartmentProofUrl}
                    onChange={(url) => setOwner({ ...owner, apartmentProofUrl: url })}
                  />
                  <FileUploadField
                    label="Parking slot proof"
                    required
                    value={owner.parkingSlotProofUrl}
                    onChange={(url) => setOwner({ ...owner, parkingSlotProofUrl: url })}
                  />
                  <div className="grid-2">
                    <FileUploadField
                      label="Parking photo (optional)"
                      hint="Defaults to slot proof if skipped"
                      value={owner.parkingPhotoUrl}
                      onChange={(url) => setOwner({ ...owner, parkingPhotoUrl: url })}
                    />
                    <FileUploadField
                      label="Entrance photo (optional)"
                      hint="Defaults to slot proof if skipped"
                      value={owner.entrancePhotoUrl}
                      onChange={(url) => setOwner({ ...owner, entrancePhotoUrl: url })}
                    />
                  </div>
                </div>

                <div className="form-section">
                  <h4>5. Bank details (for settlement)</h4>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-bank-holder">Account holder name</label>
                      <input
                        id="o-bank-holder"
                        required
                        value={owner.accountHolderName}
                        placeholder="Must match full name"
                        onChange={(e) => setOwner({ ...owner, accountHolderName: e.target.value })}
                      />
                      <p className="file-upload-hint">Must exactly match your full name above.</p>
                    </div>
                    <div className="field">
                      <label htmlFor="o-bank">Bank name</label>
                      <input
                        id="o-bank"
                        required
                        value={owner.bankName}
                        onChange={(e) => setOwner({ ...owner, bankName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-acc">Account number</label>
                      <input
                        id="o-acc"
                        required
                        minLength={8}
                        value={owner.accountNumber}
                        onChange={(e) => setOwner({ ...owner, accountNumber: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="o-ifsc">IFSC code</label>
                      <input
                        id="o-ifsc"
                        required
                        minLength={5}
                        value={owner.ifscCode}
                        onChange={(e) => setOwner({ ...owner, ifscCode: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="o-upi">UPI ID (optional)</label>
                    <input
                      id="o-upi"
                      value={owner.upiId}
                      onChange={(e) => setOwner({ ...owner, upiId: e.target.value })}
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                required
                placeholder="10-digit mobile"
                value={phone}
                onChange={(e) => setPhone(digitsPhone(e.target.value))}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || phone.length !== 10}>
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={onVerify} className="auth-form">
            <div className="field">
              <label htmlFor="otp">Enter OTP</label>
              <input
                id="otp"
                inputMode="numeric"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              {otpHint ? <p className="auth-hint">{otpHint}</p> : null}
              {debugOtp ? <p className="auth-hint">Debug OTP: {debugOtp}</p> : null}
            </div>
            {mode === "signup" ? (
              <TermsAcceptCheckbox
                module={module}
                audience={signupAudience()}
                checked={termsAccepted}
                onCheckedChange={setTermsAccepted}
                onTermsLoaded={(t) => setTermsId(t?.id ?? null)}
              />
            ) : null}
            <button className="btn btn-primary" type="submit" disabled={loading || otp.length < 4}>
              {loading
                ? "Please wait..."
                : mode === "signup"
                  ? intent === "owner"
                    ? "Verify & submit owner registration"
                    : intent === "supplier"
                      ? "Verify & complete supplier registration"
                      : intent === "provider"
                        ? "Verify & complete provider registration"
                        : "Create customer account"
                  : `Continue as ${intentLabel(intent)}`}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setOtpSent(false);
                setOtp("");
              }}
            >
              Back
            </button>
          </form>
        )}

        <p className="auth-switch">
          <Link to="/">← Back to product choice</Link>
          {" · "}
          Staff? Use Parking, Tanker, or Seva staff on the home page.
        </p>
      </div>
    </div>
  );
}
