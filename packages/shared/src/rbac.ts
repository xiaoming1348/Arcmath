export const ROLES = ["STUDENT", "TEACHER", "ADMIN"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function canAccessAdmin(role: Role | null | undefined): boolean {
  return role === "ADMIN";
}

export const DEFAULT_ROLE: Role = "STUDENT";
