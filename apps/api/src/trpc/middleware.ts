import { TRPCError } from "@trpc/server";
import { hasPermission, type Permission } from "@shipflow/common/permissions";
import { middleware, protectedProcedure } from "./trpc";

/**
 * Requires org *membership* only -- no specific permission. Use for read
 * endpoints (list projects, list features, etc.) where every role,
 * including viewer, should be able to see the data.
 *
 * NOTE: this middleware is added to the chain *before* `.input()` is called
 * in the routers that use it (e.g. `orgMemberProcedure.input(listProjectsInput)`),
 * so the input hasn't been parsed yet at this point in the pipeline. We read
 * it via tRPC's async `getRawInput()` rather than the (parsed, and not yet
 * available here) `input` property.
 */
export const orgMemberProcedure = protectedProcedure.use(
  middleware(async ({ ctx, getRawInput, next }) => {
    const raw = (await getRawInput()) as { orgId?: unknown } | undefined;
    const orgId = typeof raw?.orgId === "string" ? raw.orgId : undefined;
    if (!orgId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This procedure requires `orgId` in its input.",
      });
    }
    const membership = ctx.memberships.find((m) => m.orgId === orgId);
    if (!membership) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization." });
    }
    return next({ ctx: { ...ctx, orgRole: membership.role, orgId } });
  }),
);

/**
 * Factory for a procedure that:
 *   1. Reads `orgId` out of the (not-yet-parsed) input via getRawInput().
 *   2. Requires the signed-in user to be a member of that org.
 *   3. Requires their role in that org to carry `permission`.
 *   4. Attaches `ctx.orgRole` / `ctx.orgId` for use inside the resolver.
 *
 * Usage:
 *   export const projectRouter = router({
 *     create: orgProcedure("project:create")
 *       .input(createProjectInput)
 *       .mutation(async ({ ctx, input }) => { ... ctx.orgRole is typed ... }),
 *   });
 *
 * For procedures scoped by projectId/featureId/prdId instead of a direct
 * orgId (most of the routers built in the next phase), look up the owning
 * org server-side inside the resolver and call `assertOrgPermission`
 * directly rather than relying on this input-shape-based factory.
 */
export function orgProcedure(permission: Permission) {
  return protectedProcedure.use(
    middleware(async ({ ctx, getRawInput, next }) => {
      const raw = (await getRawInput()) as { orgId?: unknown } | undefined;
      const orgId = typeof raw?.orgId === "string" ? raw.orgId : undefined;
      if (!orgId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This procedure requires `orgId` in its input.",
        });
      }

      const membership = ctx.memberships.find((m) => m.orgId === orgId);
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization." });
      }
      if (!hasPermission(membership.role, permission)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your role (${membership.role}) does not have permission: ${permission}.`,
        });
      }

      return next({ ctx: { ...ctx, orgRole: membership.role, orgId } });
    }),
  );
}

/** Use inside a resolver when the org isn't known until after a DB lookup (e.g. via projectId). */
export function assertOrgPermission(
  memberships: { orgId: string; role: string }[],
  orgId: string,
  permission: Permission,
) {
  const membership = memberships.find((m) => m.orgId === orgId);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization." });
  }
  if (!hasPermission(membership.role as Parameters<typeof hasPermission>[0], permission)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your role (${membership.role}) does not have permission: ${permission}.`,
    });
  }
  return membership;
}
