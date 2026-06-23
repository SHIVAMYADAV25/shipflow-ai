import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { releases, featureRequests, prds, reviews, projects, pullRequests } from "@shipflow/db";
import { approveReleaseInput, releaseOutput } from "@shipflow/common/schemas";
import { computeReleaseReadiness } from "@shipflow/ai";
import { router, protectedProcedure } from "../trpc/trpc";
import { assertOrgPermission } from "../trpc/middleware";
import { createLogger } from "@shipflow/logger";

const log = createLogger("trpc.release");

async function resolveFeatureOrg(db: any, featureId: string) {
  const feature = await db.query.featureRequests.findFirst({ where: eq(featureRequests.id, featureId) });
  if (!feature) throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
  const project = await db.query.projects.findFirst({ where: eq(projects.id, feature.projectId) });
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
  return { feature, orgId: project.orgId };
}

export const releaseRouter = router({
  /** Human approves the feature for release (Approval page). */
  approve: protectedProcedure
    .input(approveReleaseInput)
    .output(releaseOutput)
    .mutation(async ({ ctx, input }) => {
      const { feature, orgId } = await resolveFeatureOrg(ctx.db, input.featureId);
      assertOrgPermission(ctx.memberships, orgId, "release:approve");

      if (feature.status === "shipped") {
        throw new TRPCError({ code: "CONFLICT", message: "Feature is already shipped." });
      }

      // Compute readiness from live review data -- this is authoritative.
      const prd = await ctx.db.query.prds.findFirst({ where: eq(prds.featureId, input.featureId) });
      const linkedPrs = await ctx.db.query.pullRequests.findMany({ where: eq(pullRequests.featureId, input.featureId) });
      const allReviews = linkedPrs.length > 0
        ? await ctx.db.query.reviews.findMany({ where: eq(reviews.pullRequestId, linkedPrs[0].id) })
        : [];

      const openBlocking = allReviews.filter((r: any) => r.severity === "blocking" && r.status === "open");
      const openNonBlocking = allReviews.filter((r: any) => r.severity === "non_blocking" && r.status === "open");

      const readiness = computeReleaseReadiness({
        blockingCount: openBlocking.length,
        nonBlockingCount: openNonBlocking.length,
        acceptanceCriteriaCount: prd?.acceptanceCriteria?.length ?? 0,
        acceptanceCriteriaCoveredCount: Math.max(0, (prd?.acceptanceCriteria?.length ?? 0) - openBlocking.length),
        hasTests: linkedPrs.some((pr: any) => pr.lastReviewedSha),
      });

      if (openBlocking.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot approve: ${openBlocking.length} blocking issue(s) are still open. Resolve them first.`,
        });
      }

      const [existing] = await ctx.db.query.releases.findMany({ where: eq(releases.featureId, input.featureId) });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A release record already exists for this feature." });

      const [release] = await ctx.db
        .insert(releases)
        .values({
          featureId: input.featureId,
          approvedByUserId: ctx.user.id,
          readinessScore: readiness.score,
          notes: input.notes ?? null,
        })
        .returning();

      if (!release) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create release." });

      await ctx.db.update(featureRequests).set({ status: "approval", updatedAt: new Date() }).where(eq(featureRequests.id, input.featureId));

      log.info({ featureId: input.featureId, approvedBy: ctx.user.id, readinessScore: readiness.score }, "release approved");
      return release;
    }),

  /** Final ship action: marks the feature as fully shipped. */
  ship: protectedProcedure
    .input(z.object({ featureId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { feature, orgId } = await resolveFeatureOrg(ctx.db, input.featureId);
      assertOrgPermission(ctx.memberships, orgId, "release:approve");

      if (feature.status === "shipped") {
        throw new TRPCError({ code: "CONFLICT", message: "Feature is already shipped." });
      }
      const existing = await ctx.db.query.releases.findFirst({ where: eq(releases.featureId, input.featureId) });
      if (!existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Feature must be approved via release.approve before shipping." });
      }

      await ctx.db.update(featureRequests).set({ status: "shipped", updatedAt: new Date() }).where(eq(featureRequests.id, input.featureId));

      log.info({ featureId: input.featureId, shippedBy: ctx.user.id }, "feature shipped");
      return { shipped: true };
    }),

  getReadiness: protectedProcedure
    .input(z.object({ featureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { orgId } = await resolveFeatureOrg(ctx.db, input.featureId);
      if (!ctx.memberships.find((m: any) => m.orgId === orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }
      const prd = await ctx.db.query.prds.findFirst({ where: eq(prds.featureId, input.featureId) });
      const linkedPrs = await ctx.db.query.pullRequests.findMany({ where: eq(pullRequests.featureId, input.featureId) });
      const allReviews = linkedPrs.length > 0
        ? await ctx.db.query.reviews.findMany({ where: eq(reviews.pullRequestId, linkedPrs[0].id) })
        : [];

      const openBlocking = allReviews.filter((r: any) => r.severity === "blocking" && r.status === "open");
      const openNonBlocking = allReviews.filter((r: any) => r.severity === "non_blocking" && r.status === "open");

      return computeReleaseReadiness({
        blockingCount: openBlocking.length,
        nonBlockingCount: openNonBlocking.length,
        acceptanceCriteriaCount: prd?.acceptanceCriteria?.length ?? 0,
        acceptanceCriteriaCoveredCount: Math.max(0, (prd?.acceptanceCriteria?.length ?? 0) - openBlocking.length),
        hasTests: linkedPrs.some((pr: any) => pr.lastReviewedSha),
      });
    }),
});
