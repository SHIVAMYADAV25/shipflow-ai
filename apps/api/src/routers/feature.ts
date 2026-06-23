import { TRPCError } from "@trpc/server";
import { eq, desc, and } from "drizzle-orm";
import { featureRequests, discoveryMessages, projects, prds } from "@shipflow/db";
import {
  createFeatureRequestInput,
  listFeatureRequestsInput,
  updateFeatureStatusInput,
  postDiscoveryMessageInput,
  featureRequestOutput,
  discoveryMessageOutput,
} from "@shipflow/common/schemas";
import { z } from "zod";
import { inngest } from "@shipflow/inngest";
import { router, protectedProcedure } from "../trpc/trpc";
import { assertOrgPermission } from "../trpc/middleware";
import { createLogger } from "@shipflow/logger";

const log = createLogger("trpc.feature");

async function resolveProjectOrg(db: any, projectId: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
  return project;
}

export const featureRouter = router({
  create: protectedProcedure
    .input(createFeatureRequestInput)
    .output(featureRequestOutput)
    .mutation(async ({ ctx, input }) => {
      const project = await resolveProjectOrg(ctx.db, input.projectId);
      assertOrgPermission(ctx.memberships, project.orgId, "feature:create");

      const [feature] = await ctx.db
        .insert(featureRequests)
        .values({
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          sourceChannel: input.sourceChannel,
          priority: input.priority,
          status: "new",
          createdByUserId: ctx.user.id,
        })
        .returning();

      if (!feature) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create feature request." });

      await inngest.send({ name: "feature/created", data: { featureId: feature.id, projectId: feature.projectId } });
      log.info({ featureId: feature.id, projectId: input.projectId }, "feature request created, discovery triggered");
      return feature;
    }),

  list: protectedProcedure
    .input(listFeatureRequestsInput)
    .query(async ({ ctx, input }) => {
      const project = await resolveProjectOrg(ctx.db, input.projectId);
      const membership = ctx.memberships.find((m: any) => m.orgId === project.orgId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });

      return ctx.db.query.featureRequests.findMany({
        where: and(
          eq(featureRequests.projectId, input.projectId),
          input.status ? eq(featureRequests.status, input.status) : undefined,
        ),
        orderBy: desc(featureRequests.createdAt),
        limit: input.limit,
      });
    }),

  get: protectedProcedure
    .input(z.object({ featureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const feature = await ctx.db.query.featureRequests.findFirst({
        where: eq(featureRequests.id, input.featureId),
        with: {
          discoveryMessages: { orderBy: discoveryMessages.createdAt },
          prd: true,
        },
      });
      if (!feature) throw new TRPCError({ code: "NOT_FOUND", message: "Feature request not found." });
      const project = await resolveProjectOrg(ctx.db, feature.projectId);
      if (!ctx.memberships.find((m: any) => m.orgId === project.orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }
      return feature;
    }),

  updateStatus: protectedProcedure
    .input(updateFeatureStatusInput)
    .mutation(async ({ ctx, input }) => {
      const feature = await ctx.db.query.featureRequests.findFirst({ where: eq(featureRequests.id, input.featureId) });
      if (!feature) throw new TRPCError({ code: "NOT_FOUND", message: "Feature request not found." });
      const project = await resolveProjectOrg(ctx.db, feature.projectId);
      assertOrgPermission(ctx.memberships, project.orgId, "feature:update_status");

      const [updated] = await ctx.db
        .update(featureRequests)
        .set({
          status: input.status,
          isDuplicateOfFeatureId: input.isDuplicateOfFeatureId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(featureRequests.id, input.featureId))
        .returning();

      log.info({ featureId: input.featureId, newStatus: input.status }, "feature status updated");
      return updated;
    }),

  replyToDiscovery: protectedProcedure
    .input(postDiscoveryMessageInput)
    .output(discoveryMessageOutput)
    .mutation(async ({ ctx, input }) => {
      const feature = await ctx.db.query.featureRequests.findFirst({ where: eq(featureRequests.id, input.featureId) });
      if (!feature) throw new TRPCError({ code: "NOT_FOUND", message: "Feature request not found." });
      if (!["new", "discovery"].includes(feature.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Discovery is only open while the feature is in new or discovery status." });
      }
      const project = await resolveProjectOrg(ctx.db, feature.projectId);
      if (!ctx.memberships.find((m: any) => m.orgId === project.orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }

      const [message] = await ctx.db
        .insert(discoveryMessages)
        .values({ featureId: input.featureId, role: "user", content: input.content, authorUserId: ctx.user.id })
        .returning();

      if (!message) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save message." });

      await inngest.send({ name: "feature/discovery.message", data: { featureId: input.featureId } });
      return message;
    }),

  triggerPrdGeneration: protectedProcedure
    .input(z.object({ featureId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const feature = await ctx.db.query.featureRequests.findFirst({ where: eq(featureRequests.id, input.featureId) });
      if (!feature) throw new TRPCError({ code: "NOT_FOUND", message: "Feature request not found." });
      const project = await resolveProjectOrg(ctx.db, feature.projectId);
      assertOrgPermission(ctx.memberships, project.orgId, "feature:update_status");

      const existing = await ctx.db.query.prds.findFirst({ where: eq(prds.featureId, input.featureId) });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A PRD already exists for this feature." });

      await inngest.send({ name: "prd/generate.requested", data: { featureId: input.featureId } });
      log.info({ featureId: input.featureId }, "manual PRD generation triggered");
      return { queued: true };
    }),
});
