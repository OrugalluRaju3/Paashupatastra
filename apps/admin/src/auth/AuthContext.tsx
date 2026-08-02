import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api";
import {
  type AuthUser,
  type PortalKind,
  type PublicIntent,
  type StaffIntent,
  isStaffUser,
} from "./types";

const TOKEN_KEY = "paash_token";
const USER_KEY = "paash_user";
const PORTAL_KEY = "paash_portal";
const INTENT_KEY = "paash_intent";

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  portal: PortalKind | null;
  intent: string | null;
  ready: boolean;
};

type AuthContextValue = AuthState & {
  requestOtp: (
    phone: string,
    opts?: { email?: string },
  ) => Promise<{ debugOtp?: string; deliveredVia?: string[]; message?: string }>;
  loginPublic: (phone: string, otp: string, intent: PublicIntent) => Promise<AuthUser>;
  signupPublic: (
    phone: string,
    otp: string,
    intent: PublicIntent,
    profile: {
      fullName: string;
      email: string;
      city: string;
      state: string;
      country?: string;
      pinCode: string;
      preferredLocation?: string | null;
    },
  ) => Promise<AuthUser>;
  loginStaff: (phone: string, otp: string, intent: StaffIntent) => Promise<AuthUser>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStored(): Omit<AuthState, "ready"> {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawUser = localStorage.getItem(USER_KEY);
    const portal = localStorage.getItem(PORTAL_KEY) as PortalKind | null;
    const intent = localStorage.getItem(INTENT_KEY);
    const user = rawUser ? (JSON.parse(rawUser) as AuthUser) : null;
    return { token, user, portal, intent };
  } catch {
    return { token: null, user: null, portal: null, intent: null };
  }
}

function persist(token: string, user: AuthUser, portal: PortalKind, intent: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(PORTAL_KEY, portal);
  localStorage.setItem(INTENT_KEY, intent);
}

function clearPersist() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PORTAL_KEY);
  localStorage.removeItem(INTENT_KEY);
  localStorage.removeItem("admin_token");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = readStored();
  const [token, setToken] = useState<string | null>(stored.token);
  const [user, setUser] = useState<AuthUser | null>(stored.user);
  const [portal, setPortal] = useState<PortalKind | null>(stored.portal);
  const [intent, setIntent] = useState<string | null>(stored.intent);
  const [ready] = useState(true);

  const requestOtp = useCallback(async (phone: string, opts?: { email?: string }) => {
    return api.post<{ ok: boolean; debugOtp?: string; deliveredVia?: string[]; message?: string }>(
      "/auth/otp/request",
      { phone, email: opts?.email },
    );
  }, []);

  const completeLogin = useCallback(
    async (phone: string, otp: string, portalKind: PortalKind, intentValue: string) => {
      const res = await api.post<{ accessToken: string; user: AuthUser }>("/auth/otp/verify", {
        phone,
        otp,
      });
      persist(res.accessToken, res.user, portalKind, intentValue);
      setToken(res.accessToken);
      setUser(res.user);
      setPortal(portalKind);
      setIntent(intentValue);
      return res.user;
    },
    [],
  );

  const loginPublic = useCallback(
    async (phone: string, otp: string, publicIntent: PublicIntent) => {
      return completeLogin(phone, otp, "public", publicIntent);
    },
    [completeLogin],
  );

  const signupPublic = useCallback(
    async (
      phone: string,
      otp: string,
      publicIntent: PublicIntent,
      profile: {
        fullName: string;
        email: string;
        city: string;
        state: string;
        country?: string;
        pinCode: string;
        preferredLocation?: string | null;
      },
    ) => {
      await completeLogin(phone, otp, "public", publicIntent);
      const me = await api.post<AuthUser>("/users/me/signup", {
        ...profile,
        intent: publicIntent,
      });
      setUser(me);
      localStorage.setItem(USER_KEY, JSON.stringify(me));
      return me;
    },
    [completeLogin],
  );

  const loginStaff = useCallback(
    async (phone: string, otp: string, staffIntent: StaffIntent) => {
      const loggedIn = await completeLogin(phone, otp, "staff", staffIntent);
      if (!isStaffUser(loggedIn)) {
        clearPersist();
        setToken(null);
        setUser(null);
        setPortal(null);
        setIntent(null);
        throw new Error(
          "This account is not staff. Use Customer/Owner login, or ask Super Admin to add staff role.",
        );
      }

      const isSuper = loggedIn.roles.includes("super_admin");
      const hasIntentRole = loggedIn.roles.includes(staffIntent);
      if (staffIntent === "super_admin" && !isSuper) {
        clearPersist();
        setToken(null);
        setUser(null);
        setPortal(null);
        setIntent(null);
        throw new Error("This account does not have Super Admin role.");
      }
      if (staffIntent !== "super_admin" && !hasIntentRole && !isSuper) {
        clearPersist();
        setToken(null);
        setUser(null);
        setPortal(null);
        setIntent(null);
        throw new Error(
          `This account does not have ${staffIntent.replaceAll("_", " ")} role.`,
        );
      }
      return loggedIn;
    },
    [completeLogin],
  );

  const logout = useCallback(() => {
    clearPersist();
    setToken(null);
    setUser(null);
    setPortal(null);
    setIntent(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    const me = await api.get<AuthUser>("/users/me");
    setUser(me);
    localStorage.setItem(USER_KEY, JSON.stringify(me));
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      portal,
      intent,
      ready,
      requestOtp,
      loginPublic,
      signupPublic,
      loginStaff,
      logout,
      refreshMe,
    }),
    [
      token,
      user,
      portal,
      intent,
      ready,
      requestOtp,
      loginPublic,
      signupPublic,
      loginStaff,
      logout,
      refreshMe,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}
