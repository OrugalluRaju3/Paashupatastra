export type AuthUser = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  roles: string[];
  isActive: boolean;
};

export type PortalKind = "public" | "staff";

export type PublicIntent = "customer" | "owner";

export type StaffIntent = "super_admin" | "verification_manager" | "field_executive";

export const STAFF_ROLES = [
  "super_admin",
  "verification_manager",
  "field_executive",
] as const;

export const PUBLIC_ROLES = ["customer", "parking_owner", "resident", "visitor"] as const;

export function isStaffUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
}

export function isOwnerUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.roles.includes("parking_owner");
}

export function hasAnyRole(user: AuthUser | null | undefined, roles: string[]): boolean {
  if (!user) return false;
  return user.roles.some((r) => roles.includes(r));
}
