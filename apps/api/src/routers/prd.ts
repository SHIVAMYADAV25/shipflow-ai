import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { prds, featureRequests, projects, tasks } from "@shipflow/db";
import { updatePrdInput, approvePrdInput, prdOutput } from "@shipflow/common/schemas";
import { z } from "zod";
import { inngest } from "@shipflow/inngest";
import { router, protectedProcedure } from "../trpc/trpc";
import { assertOrgPermission } from "../trpc/middleware";
import { createLogger } from "@shipflow/logger";

const log = createLogger("trpc.prd");

async function resolvePrdOrg(db: any, prdId: string) {
  const prd = await db.query.prds.findFirst({ where: eq(prds.id, prdId), with: { feature: true } });
  if (!prd) throw new TRPCError({ code: "NOT_FOUND", message: "PRD not found." });
  const project = await db.query.projects.findFirst({ where: eq(projects.id, prd.feature.projectId) });
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
  return { prd, orgId: project.orgId };
}

export const prdRouter = router({
  get: protectedProcedure
    .input(z.object({ prdId: z.string().uuid() }))
    .output(prdOutput)
    .query(async ({ ctx, input }) => {
      const { prd, orgId } = await resolvePrdOrg(ctx.db, input.prdId);
      if (!ctx.memberships.find((m: any) => m.orgId === orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }
      return prd;
    }),

  getByFeature: protectedProcedure
    .input(z.object({ featureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const feature = await ctx.db.query.featureRequests.findFirst({ where: eq(featureRequests.id, input.featureId) });
      if (!feature) throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
      const project = await ctx.db.query.projects.findFirst({ where: eq(projects.id, feature.projectId) });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      if (!ctx.memberships.find((m: any) => m.orgId === project.orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }
      return ctx.db.query.prds.findFirst({ where: eq(prds.featureId, input.featureId) });
    }),

  update: protectedProcedure
    .input(updatePrdInput)
    .output(prdOutput)
    .mutation(async ({ ctx, input }) => {
      const { prd, orgId } = await resolvePrdOrg(ctx.db, input.prdId);
      if (prd.status === "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Approved PRDs are immutable. Create a new feature request if requirements change." });
      }
      assertOrgPermission(ctx.memberships, orgId, "prd:edit");

      const { prdId, ...fields } = input;
      const [updated] = await ctx.db
        .update(prds)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(prds.id, prdId))
        .returning();

      log.info({ prdId }, "PRD updated");
      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update PRD." });
      return updated;
    }),

  approve: protectedProcedure
    .input(approvePrdInput)
    .output(prdOutput)
    .mutation(async ({ ctx, input }) => {
      const { prd, orgId } = await resolvePrdOrg(ctx.db, input.prdId);
      assertOrgPermission(ctx.memberships, orgId, "prd:approve");

      const [approved] = await ctx.db
        .update(prds)
        .set({ status: "approved", approvedByUserId: ctx.user.id, approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(prds.id, input.prdId))
        .returning();

      // Kick off async task generation via Inngest.
      await inngest.send({ name: "tasks/generate.requested", data: { prdId: input.prdId } });
      // Also update the feature status.
      await ctx.db.update(featureRequests).set({ status: "planning", updatedAt: new Date() }).where(eq(featureRequests.id, prd.featureId));

      log.info({ prdId: input.prdId, approvedBy: ctx.user.id }, "PRD approved, task generation queued");
      if (!approved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to approve PRD." });
      return approved;
    }),

  /** Manually trigger task generation (e.g. if the auto-run failed). */
  generateTasks: protectedProcedure
    .input(z.object({ prdId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { prd, orgId } = await resolvePrdOrg(ctx.db, input.prdId);
      if (prd.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PRD must be approved before generating tasks." });
      }
      assertOrgPermission(ctx.memberships, orgId, "prd:approve");
      const existing = await ctx.db.query.tasks.findMany({ where: eq(tasks.prdId, input.prdId) });
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `${existing.length} tasks already exist for this PRD. Delete them first if you want to regenerate.` });
      }
      await inngest.send({ name: "tasks/generate.requested", data: { prdId: input.prdId } });
      return { queued: true };
    }),
});
