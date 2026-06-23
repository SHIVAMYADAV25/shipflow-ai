import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { repositories, projects, pullRequests, organizations } from "@shipflow/db";
import {
  connectRepositoryInput,
  toggleRepositoryInput,
  listPullRequestsInput,
  repositoryOutput,
} from "@shipflow/common/schemas";
import { z } from "zod";
import { getInstallationOctokit } from "@shipflow/github";
import { router, protectedProcedure } from "../trpc/trpc";
import { assertOrgPermission } from "../trpc/middleware";
import { createLogger } from "@shipflow/logger";

const log = createLogger("trpc.github");

async function resolveProjectOrg(db: any, projectId: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
  return project;
}

export const githubRouter = router({
  connectRepo: protectedProcedure
    .input(connectRepositoryInput)
    .output(repositoryOutput)
    .mutation(async ({ ctx, input }) => {
      const project = await resolveProjectOrg(ctx.db, input.projectId);
      assertOrgPermission(ctx.memberships, project.orgId, "github:connect");

      // Enforce plan-level repo limits before inserting.
      const org = await ctx.db.query.organizations.findFirst({ where: eq(organizations.id, project.orgId) });
      if (org) {
        const repoCount = await ctx.db.query.repositories.findMany({
          where: and(
            eq(repositories.projectId, input.projectId),
            eq(repositories.isActive, true),
          ),
        });
        if (repoCount.length >= (org.repoLimit ?? 1)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Your plan allows ${org.repoLimit} connected repository(ies). Upgrade to connect more.` });
        }
      }

      const existing = await ctx.db.query.repositories.findFirst({
        where: eq(repositories.githubRepoId, input.githubRepoId),
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "This GitHub repository is already connected." });

      // Verify the installation actually has access to this repo by making a
      // real Octokit call -- a hardcoded repoId would pass validation but
      // fail here with a 404 from GitHub, providing a clear error rather
      // than silently storing bad data.
      try {
        const octokit = await getInstallationOctokit(input.installationId);
        const [owner, repoName] = input.fullName.split("/");
        if (!owner || !repoName) throw new Error("malformed fullName");
        await octokit.rest.repos.get({ owner, repo: repoName });
      } catch (err) {
        log.warn({ installationId: input.installationId, fullName: input.fullName, err: (err as Error).message }, "GitHub repo access verification failed");
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not verify access to this repository via the GitHub App installation. Make sure the app is installed and has access." });
      }

      const [repo] = await ctx.db
        .insert(repositories)
        .values({
          projectId: input.projectId,
          githubRepoId: input.githubRepoId,
          installationId: input.installationId,
          fullName: input.fullName,
          url: input.url,
          defaultBranch: input.defaultBranch,
          isActive: true,
        })
        .returning();

      if (!repo) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to connect repository." });
      log.info({ repoId: repo.id, fullName: input.fullName, projectId: input.projectId }, "repository connected");
      return repo;
    }),

  listRepos: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await resolveProjectOrg(ctx.db, input.projectId);
      if (!ctx.memberships.find((m: any) => m.orgId === project.orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }
      return ctx.db.query.repositories.findMany({ where: eq(repositories.projectId, input.projectId) });
    }),

  toggleRepo: protectedProcedure
    .input(toggleRepositoryInput)
    .output(repositoryOutput)
    .mutation(async ({ ctx, input }) => {
      const repo = await ctx.db.query.repositories.findFirst({ where: eq(repositories.id, input.repositoryId) });
      if (!repo) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
      const project = await resolveProjectOrg(ctx.db, repo.projectId);
      assertOrgPermission(ctx.memberships, project.orgId, "github:connect");

      const [updated] = await ctx.db
        .update(repositories)
        .set({ isActive: input.isActive })
        .where(eq(repositories.id, input.repositoryId))
        .returning();

      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update repository." });
      log.info({ repoId: input.repositoryId, isActive: input.isActive }, "repository toggled");
      return updated;
    }),

  listPullRequests: protectedProcedure
    .input(listPullRequestsInput)
    .query(async ({ ctx, input }) => {
      const project = await resolveProjectOrg(ctx.db, input.projectId);
      if (!ctx.memberships.find((m: any) => m.orgId === project.orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }

      // Get all repos for this project, then get PRs across them.
      const repos = await ctx.db.query.repositories.findMany({ where: eq(repositories.projectId, input.projectId) });
      const repoIds = repos.map((r: any) => r.id);
      if (repoIds.length === 0) return [];

      return ctx.db.query.pullRequests.findMany({
        where: input.state
          ? and(
              eq(pullRequests.repoId, repoIds[0]),
              eq(pullRequests.state, input.state),
            )
          : eq(pullRequests.repoId, repoIds[0]),
        with: { repository: true, reviews: true },
        limit: input.limit,
      });
    }),

  linkPrToFeature: protectedProcedure
    .input(z.object({ pullRequestId: z.string().uuid(), featureId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const pr = await ctx.db.query.pullRequests.findFirst({ where: eq(pullRequests.id, input.pullRequestId) });
      if (!pr) throw new TRPCError({ code: "NOT_FOUND", message: "Pull request not found." });
      const repo = await ctx.db.query.repositories.findFirst({ where: eq(repositories.id, pr.repoId) });
      if (!repo) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
      const project = await resolveProjectOrg(ctx.db, repo.projectId);
      assertOrgPermission(ctx.memberships, project.orgId, "review:trigger");

      await ctx.db.update(pullRequests).set({ featureId: input.featureId }).where(eq(pullRequests.id, input.pullRequestId));
      log.info({ pullRequestId: input.pullRequestId, featureId: input.featureId }, "PR linked to feature");
      return { linked: true };
    }),
});
