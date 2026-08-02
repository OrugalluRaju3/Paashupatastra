import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { PublicIntent } from "../auth/types";
import { FileUploadField } from "../components/FileUploadField";
import { useToast } from "../components/Toast";

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

export function PublicLoginPage() {
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

  if (token && portal === "public") {
    const dest = localStorage.getItem("paash_intent") === "owner" ? "/app/owner" : "/app/customer";
    return <Navigate to={dest} replace />;
  }

  function switchMode(next: Mode) {
    setMode(next);
    setOtpSent(false);
    setOtp("");
    setOtpHint("");
    setDebugOtp(undefined);
  }

  function signupEmail() {
    return intent === "owner" ? owner.email.trim() : customer.email.trim();
  }

  async function onSendOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await requestOtp(phone, mode === "signup" ? { email: signupEmail() } : undefined);
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
    setLoading(true);
    try {
      if (mode === "signup" && intent === "customer") {
        await signupPublic(phone, otp, "customer", {
          fullName: customer.fullName.trim(),
          email: customer.email.trim(),
          city: customer.city.trim(),
          state: customer.state.trim(),
          country: customer.country.trim() || "IN",
          pinCode: customer.pinCode.trim(),
        });
        toast.success("Customer account created successfully");
        navigate("/app/customer");
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

        await signupPublic(phone, otp, "owner", {
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
          vehicleTypesAllowed: ["car"],
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
        navigate("/app/owner/listings");
        return;
      }

      await loginPublic(phone, otp, intent);
      toast.success("Logged in successfully");
      navigate(intent === "owner" ? "/app/owner" : "/app/customer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : mode === "signup" ? "Signup failed" : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const wide = mode === "signup" && intent === "owner";

  return (
    <div className="auth-page">
      <div className={wide ? "auth-card auth-card-wide" : "auth-card"}>
        <p className="brand-kicker">Paashupatastra</p>
        <h1>{mode === "signup" ? "Create account" : "Customer / Owner login"}</h1>
        <p className="auth-sub">
          {mode === "signup"
            ? intent === "owner"
              ? "Register as an apartment parking owner with full listing details."
              : "Sign up as a parking customer."
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
          <button
            type="button"
            className={intent === "owner" ? "intent active" : "intent"}
            onClick={() => setIntent("owner")}
          >
            Parking owner
          </button>
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
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="o-lat">Latitude</label>
                      <input
                        id="o-lat"
                        required
                        inputMode="decimal"
                        placeholder="17.4485"
                        value={owner.latitude}
                        onChange={(e) => setOwner({ ...owner, latitude: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="o-lng">Longitude</label>
                      <input
                        id="o-lng"
                        required
                        inputMode="decimal"
                        placeholder="78.3908"
                        value={owner.longitude}
                        onChange={(e) => setOwner({ ...owner, longitude: e.target.value })}
                      />
                    </div>
                  </div>
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
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                required
                placeholder="10-digit mobile"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
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
            <button className="btn btn-primary" type="submit" disabled={loading || otp.length < 4}>
              {loading
                ? "Please wait..."
                : mode === "signup"
                  ? intent === "owner"
                    ? "Verify & submit owner registration"
                    : "Create customer account"
                  : `Continue as ${intent === "owner" ? "Owner" : "Customer"}`}
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
          Staff member? <Link to="/staff/login">Admin / Executive / Manager login</Link>
        </p>
      </div>
    </div>
  );
}
