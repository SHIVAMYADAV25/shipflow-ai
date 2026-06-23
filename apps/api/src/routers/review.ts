import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { reviews, pullRequests, repositories, projects } from "@shipflow/db";
import { resolveReviewIssueInput, listReviewsInput, reviewOutput } from "@shipflow/common/schemas";
import { z } from "zod";
import { inngest } from "@shipflow/inngest";
import { router, protectedProcedure } from "../trpc/trpc";
import { assertOrgPermission } from "../trpc/middleware";
import { createLogger } from "@shipflow/logger";

const log = createLogger("trpc.review");

async function resolvePrOrg(db: any, pullRequestId: string) {
  const pr = await db.query.pullRequests.findFirst({ where: eq(pullRequests.id, pullRequestId) });
  if (!pr) throw new TRPCError({ code: "NOT_FOUND", message: "Pull request not found." });
  const repo = await db.query.repositories.findFirst({ where: eq(repositories.id, pr.repoId) });
  if (!repo) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
  const project = await db.query.projects.findFirst({ where: eq(projects.id, repo.projectId) });
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
  return { pr, repo, orgId: project.orgId };
}

export const reviewRouter = router({
  /** Manually trigger an AI review run (e.g. after a fix was pushed). */
  trigger: protectedProcedure
    .input(z.object({ pullRequestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { orgId } = await resolvePrOrg(ctx.db, input.pullRequestId);
      assertOrgPermission(ctx.memberships, orgId, "review:trigger");

      await inngest.send({ name: "github/pull_request.synchronized", data: { pullRequestId: input.pullRequestId } });
      log.info({ pullRequestId: input.pullRequestId }, "AI review manually triggered");
      return { queued: true };
    }),

  listByPullRequest: protectedProcedure
    .input(listReviewsInput)
    .query(async ({ ctx, input }) => {
      const { orgId } = await resolvePrOrg(ctx.db, input.pullRequestId);
      if (!ctx.memberships.find((m: any) => m.orgId === orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }
      return ctx.db.query.reviews.findMany({
        where: eq(reviews.pullRequestId, input.pullRequestId),
        orderBy: desc(reviews.createdAt),
      });
    }),

  /** Get all reviews for a project (Review History page). */
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({ where: eq(projects.id, input.projectId) });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      if (!ctx.memberships.find((m: any) => m.orgId === project.orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }
      const repos = await ctx.db.query.repositories.findMany({ where: eq(repositories.projectId, input.projectId) });
      if (repos.length === 0) return [];

      const prs = await ctx.db.query.pullRequests.findMany({
        where: eq(pullRequests.repoId, repos[0].id),
        with: { reviews: { orderBy: desc(reviews.createdAt) } },
        limit: input.limit,
        orderBy: desc(pullRequests.updatedAt),
      });
      return prs;
    }),

  resolve: protectedProcedure
    .input(resolveReviewIssueInput)
    .output(reviewOutput)
    .mutation(async ({ ctx, input }) => {
      const review = await ctx.db.query.reviews.findFirst({ where: eq(reviews.id, input.reviewId) });
      if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "Review issue not found." });
      const { orgId } = await resolvePrOrg(ctx.db, review.pullRequestId);
      assertOrgPermission(ctx.memberships, orgId, "review:resolve");

      const [updated] = await ctx.db
        .update(reviews)
        .set({ status: input.status, resolvedByUserId: ctx.user.id, resolvedAt: new Date() })
        .where(eq(reviews.id, input.reviewId))
        .returning();

      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update review issue." });
      log.info({ reviewId: input.reviewId, newStatus: input.status, resolvedBy: ctx.user.id }, "review issue resolved");
      return updated;
    }),
});
