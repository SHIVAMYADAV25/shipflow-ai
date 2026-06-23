import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { organizations, orgMembers } from "@shipflow/db";
import { createOrganizationInput, organizationOutput } from "@shipflow/common/schemas";
import { router, protectedProcedure } from "../trpc/trpc";
import { orgMemberProcedure } from "../trpc/middleware";
import { z } from "zod";

export const organizationRouter = router({
  /** Any signed-in user can create an org; they become its owner. */
  create: protectedProcedure
    .input(createOrganizationInput)
    .output(organizationOutput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.organizations.findFirst({
        where: eq(organizations.slug, input.slug),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "That organization slug is already taken." });
      }

      const [org] = await ctx.db.insert(organizations).values({
        name: input.name,
        slug: input.slug,
      }).returning();

      if (!org) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create organization." });
      }

      await ctx.db.insert(orgMembers).values({
        orgId: org.id,
        userId: ctx.user.id,
        role: "owner",
      });

      return org;
    }),

  /** Every org the signed-in user belongs to, with their role. */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        org: organizations,
        role: orgMembers.role,
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(eq(orgMembers.userId, ctx.user.id));

    return rows.map((r) => ({ ...r.org, myRole: r.role }));
  }),

  get: orgMemberProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .output(organizationOutput)
    .query(async ({ ctx, input }) => {
      const org = await ctx.db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }
      return org;
    }),

  listMembers: orgMemberProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.orgMembers.findMany({
        where: eq(orgMembers.orgId, input.orgId),
        with: { user: true },
      });
    }),
});
