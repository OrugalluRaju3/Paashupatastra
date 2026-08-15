import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { AuthModule, StaffIntent } from "../auth/types";
import { staffHomePath } from "../auth/types";
import { useToast } from "../components/Toast";
import { digitsPhone } from "../lib/phone";

const parkingOptions: Array<{ id: StaffIntent; label: string; hint: string }> = [
  { id: "parking_super_admin", label: "Parking Super Admin", hint: "Full parking staff console" },
  { id: "verification_manager", label: "Verification Manager", hint: "Final listing approval" },
  { id: "field_executive", label: "Field Executive", hint: "On-site verification" },
];

const tankerOptions: Array<{ id: StaffIntent; label: string; hint: string }> = [
  { id: "tanker_super_admin", label: "Tanker Super Admin", hint: "Full tanker staff console" },
];

const sevaOptions: Array<{ id: StaffIntent; label: string; hint: string }> = [
  {
    id: "seva_super_admin",
    label: "Seva Super Admin",
    hint: "Housekeeping & maintenance console",
  },
];

const communityOptions: Array<{ id: StaffIntent; label: string; hint: string }> = [
  {
    id: "community_super_admin",
    label: "Community Super Admin",
    hint: "Apartments, memberships, and society operations",
  },
];

export function StaffLoginPage({ module }: { module: AuthModule }) {
  const toast = useToast();
  const { token, portal, module: activeModule, requestOtp, loginStaff } = useAuth();
  const navigate = useNavigate();
  const staffOptions =
    module === "tanker"
      ? tankerOptions
      : module === "seva"
        ? sevaOptions
        : module === "community"
          ? communityOptions
          : parkingOptions;
  const defaultIntent: StaffIntent =
    module === "tanker"
      ? "tanker_super_admin"
      : module === "seva"
        ? "seva_super_admin"
        : module === "community"
          ? "community_super_admin"
        : "parking_super_admin";
  const [intent, setIntent] = useState<StaffIntent>(defaultIntent);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpHint, setOtpHint] = useState("");
  const [debugOtp, setDebugOtp] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => {
    if (module === "tanker") return "Tanker staff";
    if (module === "seva") return "Seva staff";
    if (module === "community") return "Community staff";
    return "Parking staff";
  }, [module]);

  const subtitle = useMemo(() => {
    if (module === "seva") {
      return "Secure login for housekeeping & maintenance operations.";
    }
    if (module === "community") {
      return "Secure login for apartment community operations.";
    }
    return `Secure login for ${title.toLowerCase()} operations.`;
  }, [module, title]);

  if (token && portal === "staff" && activeModule === module) {
    return <Navigate to={staffHomePath(module)} replace />;
  }

  async function onSendOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await requestOtp(phone, {
        module,
        purpose: "login",
        portal: "staff",
        intent,
      });
      setDebugOtp(res.debugOtp);
      setOtp("");
      setOtpHint(res.message ?? "OTP sent to your registered email");
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
      await loginStaff(phone, otp, intent, module);
      toast.success("Logged in successfully");
      navigate(staffHomePath(module));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page staff-auth">
      <div className="auth-card">
        <p className="brand-kicker">{title}</p>
        <h1>{title} login</h1>
        <p className="auth-sub">{subtitle}</p>

        <div className="intent-stack">
          {staffOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={intent === opt.id ? "intent-row active" : "intent-row"}
              onClick={() => {
                setIntent(opt.id);
                setOtpSent(false);
                setOtp("");
              }}
            >
              <strong>{opt.label}</strong>
              <span>{opt.hint}</span>
            </button>
          ))}
        </div>

        {!otpSent ? (
          <form onSubmit={onSendOtp} className="auth-form">
            <div className="field">
              <label htmlFor="staff-phone">Staff mobile number</label>
              <input
                id="staff-phone"
                inputMode="numeric"
                maxLength={10}
                required
                placeholder="Registered staff mobile"
                value={phone}
                onChange={(e) => setPhone(digitsPhone(e.target.value))}
              />
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || phone.length !== 10}
            >
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={onVerify} className="auth-form">
            <div className="field">
              <label htmlFor="staff-otp">Enter OTP</label>
              <input
                id="staff-otp"
                inputMode="numeric"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              {otpHint ? <p className="auth-hint">{otpHint}</p> : null}
              {debugOtp ? <p className="auth-hint">Debug OTP: {debugOtp}</p> : null}
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || otp.length < 4}
            >
              {loading ? "Verifying…" : `Login to ${title.toLowerCase()} console`}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setOtpSent(false);
                setOtp("");
              }}
            >
              Change number
            </button>
          </form>
        )}

        <p className="auth-switch">
          <Link to="/">← Back to product choice</Link>
        </p>
      </div>
    </div>
  );
}
