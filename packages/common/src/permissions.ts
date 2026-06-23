import { ORG_ROLES, PERMISSIONS, type OrgRole, type Permission } from "./enums";

export type { OrgRole, Permission };

/**
 * Explicit allow-list per role. Deliberately verbose (no inheritance magic)
 * so it's easy to audit "who can do X" by reading one table.
 */
export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  owner: [...PERMISSIONS],
  admin: [
    "org:invite",
    "project:create",
    "project:delete",
    "feature:create",
    "feature:update_status",
    "prd:edit",
    "prd:approve",
    "task:update",
    "github:connect",
    "review:trigger",
    "review:resolve",
    "release:approve",
    "billing:manage",
  ],
  pm: [
    "project:create",
    "feature:create",
    "feature:update_status",
    "prd:edit",
    "prd:approve",
    "task:update",
    "release:approve",
  ],
  developer: ["feature:create", "task:update", "review:trigger", "prd:edit"],
  reviewer: ["review:trigger", "review:resolve", "release:approve"],
  viewer: [],
};

export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertRole(role: string): asserts role is OrgRole {
  if (!(ORG_ROLES as readonly string[]).includes(role)) {
    throw new Error(`Invalid org role: ${role}`);
  }
}
