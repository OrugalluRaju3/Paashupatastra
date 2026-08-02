import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { StaffIntent } from "../auth/types";
import { useToast } from "../components/Toast";

const staffOptions: Array<{ id: StaffIntent; label: string; hint: string }> = [
  { id: "super_admin", label: "Super Admin", hint: "Full platform control" },
  { id: "verification_manager", label: "Verification Manager", hint: "Final listing approval" },
  { id: "field_executive", label: "Field Executive", hint: "On-site verification" },
];

export function StaffLoginPage() {
  const toast = useToast();
  const { token, portal, requestOtp, loginStaff } = useAuth();
  const navigate = useNavigate();
  const [intent, setIntent] = useState<StaffIntent>("super_admin");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpHint, setOtpHint] = useState("");
  const [debugOtp, setDebugOtp] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  if (token && portal === "staff") {
    return <Navigate to="/staff" replace />;
  }

  async function onSendOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await requestOtp(phone);
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
      await loginStaff(phone, otp, intent);
      toast.success("Logged in successfully");
      navigate("/staff");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page staff-auth">
      <div className="auth-card">
        <p className="brand-kicker">Staff portal</p>
        <h1>Admin / Executive / Manager</h1>
        <p className="auth-sub">Separate secure login for operations staff.</p>

        <div className="intent-stack">
          {staffOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={intent === opt.id ? "intent-row active" : "intent-row"}
              onClick={() => setIntent(opt.id)}
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
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || phone.length !== 10}>
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
            <button className="btn btn-primary" type="submit" disabled={loading || otp.length < 4}>
              {loading ? "Verifying…" : "Login to staff console"}
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
          Customer or owner? <Link to="/login">Go to public login</Link>
        </p>
      </div>
    </div>
  );
}
