export type AuthModule = "parking" | "tanker";

export type AuthUser = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  roles: string[];
  isActive: boolean;
};

export type PortalKind = "public" | "staff";

export type PublicIntent = "customer" | "owner" | "supplier" | "driver";

export type StaffIntent =
  | "parking_super_admin"
  | "tanker_super_admin"
  | "verification_manager"
  | "field_executive";

export const PARKING_STAFF_ROLES = [
  "parking_super_admin",
  "super_admin",
  "verification_manager",
  "field_executive",
] as const;

export const TANKER_STAFF_ROLES = ["tanker_super_admin"] as const;

export const STAFF_ROLES = [...PARKING_STAFF_ROLES, ...TANKER_STAFF_ROLES] as const;

export const PUBLIC_ROLES = [
  "customer",
  "parking_owner",
  "resident",
  "visitor",
  "tanker_supplier",
  "tanker_driver",
] as const;

type RoleHolder = { roles: string[] } | null | undefined;

export function isStaffUser(user: RoleHolder): boolean {
  if (!user) return false;
  return user.roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
}

export function isParkingSuperAdmin(user: RoleHolder): boolean {
  return hasAnyRole(user, ["parking_super_admin", "super_admin"]);
}

export function isTankerSuperAdmin(user: RoleHolder): boolean {
  return hasAnyRole(user, ["tanker_super_admin"]);
}

export function isParkingStaff(user: RoleHolder): boolean {
  return user?.roles.some((r) => PARKING_STAFF_ROLES.includes(r as (typeof PARKING_STAFF_ROLES)[number])) ?? false;
}

export function isTankerStaff(user: RoleHolder): boolean {
  return user?.roles.some((r) => TANKER_STAFF_ROLES.includes(r as (typeof TANKER_STAFF_ROLES)[number])) ?? false;
}

export function isOwnerUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.roles.includes("parking_owner");
}

export function isSupplierUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.roles.includes("tanker_supplier");
}

export function isDriverUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.roles.includes("tanker_driver");
}

export function hasAnyRole(user: RoleHolder, roles: string[]): boolean {
  if (!user) return false;
  return user.roles.some((r) => roles.includes(r));
}

export function moduleForIntent(intent: string, forcedModule?: AuthModule | null): AuthModule {
  if (forcedModule === "parking" || forcedModule === "tanker") return forcedModule;
  if (intent === "supplier" || intent === "driver") return "tanker";
  if (intent === "owner") return "parking";
  return "parking";
}

export function publicHomePath(intent: string | null | undefined, module?: AuthModule | null): string {
  if (module === "tanker") {
    if (intent === "supplier") return "/app/supplier";
    if (intent === "driver") return "/app/driver";
    return "/app/tanker";
  }
  if (intent === "owner") return "/app/owner";
  return "/app/customer";
}

export function staffHomePath(module: AuthModule): string {
  if (module === "tanker") return "/staff/tanker";
  return "/staff";
}
