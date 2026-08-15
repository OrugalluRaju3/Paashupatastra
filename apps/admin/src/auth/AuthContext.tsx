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

  type AuthModule,

  type AuthUser,

  moduleForIntent,

  type PortalKind,

  type PublicIntent,

  type StaffIntent,

  isParkingStaff,

  isParkingSuperAdmin,

  isTankerStaff,

  isTankerSuperAdmin,

  isSevaStaff,

  isSevaSuperAdmin,

} from "./types";



const TOKEN_KEY = "paash_token";

const USER_KEY = "paash_user";

const PORTAL_KEY = "paash_portal";

const INTENT_KEY = "paash_intent";

const MODULE_KEY = "paash_module";



type AuthState = {

  token: string | null;

  user: AuthUser | null;

  portal: PortalKind | null;

  intent: string | null;

  module: AuthModule | null;

  ready: boolean;

};



type AuthContextValue = AuthState & {

  requestOtp: (
    phone: string,
    opts?: {
      email?: string;
      module?: AuthModule;
      purpose?: "login" | "signup";
      portal?: PortalKind;
      intent?: string;
    },
  ) => Promise<{ debugOtp?: string; deliveredVia?: string[]; message?: string }>;

  loginPublic: (phone: string, otp: string, intent: PublicIntent, module: AuthModule) => Promise<AuthUser>;

  signupPublic: (

    phone: string,

    otp: string,

    intent: PublicIntent,

    module: AuthModule,

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

  loginStaff: (phone: string, otp: string, intent: StaffIntent, module: AuthModule) => Promise<AuthUser>;

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

    const storedModule = localStorage.getItem(MODULE_KEY) as AuthModule | null;

    const user = rawUser ? (JSON.parse(rawUser) as AuthUser) : null;

    const module =

      storedModule ?? (intent ? moduleForIntent(intent) : portal === "staff" ? "parking" : null);

    return { token, user, portal, intent, module };

  } catch {

    return { token: null, user: null, portal: null, intent: null, module: null };

  }

}



function persist(

  token: string,

  user: AuthUser,

  portal: PortalKind,

  intent: string,

  module: AuthModule,

) {

  localStorage.setItem(TOKEN_KEY, token);

  localStorage.setItem(USER_KEY, JSON.stringify(user));

  localStorage.setItem(PORTAL_KEY, portal);

  localStorage.setItem(INTENT_KEY, intent);

  localStorage.setItem(MODULE_KEY, module);

}



function clearPersist() {

  localStorage.removeItem(TOKEN_KEY);

  localStorage.removeItem(USER_KEY);

  localStorage.removeItem(PORTAL_KEY);

  localStorage.removeItem(INTENT_KEY);

  localStorage.removeItem(MODULE_KEY);

  localStorage.removeItem("admin_token");

}



export function AuthProvider({ children }: { children: ReactNode }) {

  const stored = readStored();

  const [token, setToken] = useState<string | null>(stored.token);

  const [user, setUser] = useState<AuthUser | null>(stored.user);

  const [portal, setPortal] = useState<PortalKind | null>(stored.portal);

  const [intent, setIntent] = useState<string | null>(stored.intent);

  const [module, setModule] = useState<AuthModule | null>(stored.module);

  const [ready] = useState(true);



  const requestOtp = useCallback(
    async (
      phone: string,
      opts?: {
        email?: string;
        module?: AuthModule;
        purpose?: "login" | "signup";
        portal?: PortalKind;
        intent?: string;
      },
    ) => {
      const purpose = opts?.purpose ?? "login";
      const portal = opts?.portal;
      const intent = opts?.intent?.trim();
      if (purpose === "login" && (!portal || !intent)) {
        throw new Error("Select a role to continue login");
      }
      if (!/^\d{10}$/.test(phone)) {
        throw new Error("Enter a valid 10-digit mobile number");
      }

      const payload: Record<string, string> = {
        phone,
        module: opts?.module ?? "parking",
        purpose,
      };
      if (opts?.email) payload.email = opts.email;
      if (portal) payload.portal = portal;
      if (intent) payload.intent = intent;

      return api.post<{ ok: boolean; debugOtp?: string; deliveredVia?: string[]; message?: string }>(
        "/auth/otp/request",
        payload,
      );
    },
    [],
  );

  const completeLogin = useCallback(
    async (
      phone: string,
      otp: string,
      portalKind: PortalKind,
      intentValue: string,
      authModule: AuthModule,
      purpose: "login" | "signup" = "login",
    ) => {
      const res = await api.post<{ accessToken: string; user: AuthUser }>("/auth/otp/verify", {
        phone,
        otp,
        module: authModule,
        purpose,
        portal: portalKind,
        intent: intentValue,
      });

      persist(res.accessToken, res.user, portalKind, intentValue, authModule);
      setToken(res.accessToken);
      setUser(res.user);
      setPortal(portalKind);
      setIntent(intentValue);
      setModule(authModule);
      return res.user;
    },
    [],
  );



  const loginPublic = useCallback(

    async (phone: string, otp: string, publicIntent: PublicIntent, forcedModule: AuthModule) => {

      const authModule = moduleForIntent(publicIntent, forcedModule);

      const loggedIn = await completeLogin(phone, otp, "public", publicIntent, authModule, "login");

      if (publicIntent === "driver") {

        if (!loggedIn.roles.includes("tanker_driver")) {

          try {

            await api.post("/tanker/driver/claim", {});

            const me = await api.get<AuthUser>("/tanker/users/me");

            setUser(me);

            localStorage.setItem(USER_KEY, JSON.stringify(me));

            return me;

          } catch (err) {

            clearPersist();

            setToken(null);

            setUser(null);

            setPortal(null);

            setIntent(null);

            setModule(null);

            throw new Error(

              err instanceof Error

                ? err.message

                : "No driver account for this mobile. Sign up as Driver, or ask your supplier to add this number on a vehicle.",

            );

          }

        }

      }

      return loggedIn;

    },

    [completeLogin],

  );



  const signupPublic = useCallback(

    async (

      phone: string,

      otp: string,

      publicIntent: PublicIntent,

      forcedModule: AuthModule,

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

      const authModule = moduleForIntent(publicIntent, forcedModule);

      await completeLogin(phone, otp, "public", publicIntent, authModule, "signup");



      const signupPath =

        authModule === "tanker" ? "/tanker/users/me/signup" : "/users/me/signup";

      const signupIntent =
        authModule === "tanker"
          ? publicIntent === "supplier"
            ? "supplier"
            : "customer"
          : authModule === "seva"
            ? publicIntent === "provider"
              ? "provider"
              : "customer"
            : publicIntent;

      const me = await api.post<AuthUser>(signupPath, {

        ...profile,

        intent: signupIntent,

      });

      if (authModule === "tanker") {

        const refreshed = await api.post<{ accessToken: string; user: AuthUser }>(

          "/auth/token/refresh",

          {},

        );

        persist(refreshed.accessToken, refreshed.user, "public", publicIntent, authModule);

        setToken(refreshed.accessToken);

        setUser(refreshed.user);

        return refreshed.user;

      }

      setUser(me);

      localStorage.setItem(USER_KEY, JSON.stringify(me));

      return me;

    },

    [completeLogin],

  );



  const loginStaff = useCallback(

    async (phone: string, otp: string, staffIntent: StaffIntent, authModule: AuthModule) => {

      const loggedIn = await completeLogin(phone, otp, "staff", staffIntent, authModule, "login");



      const clearSession = () => {

        clearPersist();

        setToken(null);

        setUser(null);

        setPortal(null);

        setIntent(null);

        setModule(null);

      };



      if (authModule === "parking") {

        if (!isParkingStaff(loggedIn)) {

          clearSession();

          throw new Error(

            "This account is not parking staff. Use Customer/Owner login, or ask Parking Super Admin to add staff role.",

          );

        }



        if (
          (staffIntent === "parking_super_admin" || staffIntent === "super_admin") &&
          !isParkingSuperAdmin(loggedIn)
        ) {

          clearSession();

          throw new Error("This account does not have Parking Super Admin role.");

        }



        if (

          (staffIntent === "verification_manager" || staffIntent === "field_executive") &&

          !loggedIn.roles.includes(staffIntent) &&

          !isParkingSuperAdmin(loggedIn)

        ) {

          clearSession();

          throw new Error(

            `This account does not have ${staffIntent.replaceAll("_", " ")} role.`,

          );

        }

      } else if (authModule === "seva") {

        if (!isSevaStaff(loggedIn)) {

          clearSession();

          throw new Error(

            "This account is not Seva staff. Ask Seva Super Admin to add staff role.",

          );

        }



        if (staffIntent === "seva_super_admin" && !isSevaSuperAdmin(loggedIn)) {

          clearSession();

          throw new Error("This account does not have Seva Super Admin role.");

        }

      } else {

        if (!isTankerStaff(loggedIn)) {

          clearSession();

          throw new Error(

            "This account is not tanker staff. Ask Tanker Super Admin to add staff role.",

          );

        }



        if (staffIntent === "tanker_super_admin" && !isTankerSuperAdmin(loggedIn)) {

          clearSession();

          throw new Error("This account does not have Tanker Super Admin role.");

        }

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

    setModule(null);

  }, []);



  const refreshMe = useCallback(async () => {

    if (!token) return;

    const mePath = module === "tanker" ? "/tanker/users/me" : "/users/me";

    const me = await api.get<AuthUser>(mePath);

    setUser(me);

    localStorage.setItem(USER_KEY, JSON.stringify(me));

  }, [token, module]);



  const value = useMemo(

    () => ({

      token,

      user,

      portal,

      intent,

      module,

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

      module,

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



export function getStoredModule(): AuthModule | null {

  return localStorage.getItem(MODULE_KEY) as AuthModule | null;

}


