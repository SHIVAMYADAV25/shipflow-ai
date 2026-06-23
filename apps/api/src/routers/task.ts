import { TRPCError } from "@trpc/server";
import { eq, asc } from "drizzle-orm";
import { tasks, prds, featureRequests, projects } from "@shipflow/db";
import { createTaskInput, updateTaskInput, moveTaskInput, taskOutput } from "@shipflow/common/schemas";
import { z } from "zod";
import { router, protectedProcedure } from "../trpc/trpc";
import { assertOrgPermission } from "../trpc/middleware";
import { createLogger } from "@shipflow/logger";

const log = createLogger("trpc.task");

async function resolveTaskOrg(db: any, taskId: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId), with: { prd: true } });
  if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
  const feature = await db.query.featureRequests.findFirst({ where: eq(featureRequests.id, task.prd.featureId) });
  if (!feature) throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
  const project = await db.query.projects.findFirst({ where: eq(projects.id, feature.projectId) });
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
  return { task, orgId: project.orgId };
}

async function resolvePrdOrg(db: any, prdId: string) {
  const prd = await db.query.prds.findFirst({ where: eq(prds.id, prdId) });
  if (!prd) throw new TRPCError({ code: "NOT_FOUND", message: "PRD not found." });
  const feature = await db.query.featureRequests.findFirst({ where: eq(featureRequests.id, prd.featureId) });
  if (!feature) throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found." });
  const project = await db.query.projects.findFirst({ where: eq(projects.id, feature.projectId) });
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
  return { prd, orgId: project.orgId };
}

export const taskRouter = router({
  listByPrd: protectedProcedure
    .input(z.object({ prdId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { orgId } = await resolvePrdOrg(ctx.db, input.prdId);
      if (!ctx.memberships.find((m: any) => m.orgId === orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }
      return ctx.db.query.tasks.findMany({
        where: eq(tasks.prdId, input.prdId),
        orderBy: asc(tasks.orderIndex),
      });
    }),

  create: protectedProcedure
    .input(createTaskInput)
    .output(taskOutput)
    .mutation(async ({ ctx, input }) => {
      const { orgId } = await resolvePrdOrg(ctx.db, input.prdId);
      assertOrgPermission(ctx.memberships, orgId, "task:update");

      const existing = await ctx.db.query.tasks.findMany({ where: eq(tasks.prdId, input.prdId) });
      const [task] = await ctx.db
        .insert(tasks)
        .values({
          prdId: input.prdId,
          title: input.title,
          description: input.description ?? null,
          userStoryId: input.userStoryId ?? null,
          status: "todo",
          orderIndex: existing.length,
        })
        .returning();

      if (!task) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create task." });
      log.info({ taskId: task.id, prdId: input.prdId }, "task created");
      return task;
    }),

  update: protectedProcedure
    .input(updateTaskInput)
    .output(taskOutput)
    .mutation(async ({ ctx, input }) => {
      const { orgId } = await resolveTaskOrg(ctx.db, input.taskId);
      assertOrgPermission(ctx.memberships, orgId, "task:update");

      const { taskId, ...fields } = input;
      const [updated] = await ctx.db
        .update(tasks)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      log.info({ taskId, newStatus: fields.status }, "task updated");
      return updated;
    }),

  move: protectedProcedure
    .input(moveTaskInput)
    .output(taskOutput)
    .mutation(async ({ ctx, input }) => {
      const { orgId } = await resolveTaskOrg(ctx.db, input.taskId);
      assertOrgPermission(ctx.memberships, orgId, "task:update");

      const [updated] = await ctx.db
        .update(tasks)
        .set({ status: input.status, orderIndex: input.orderIndex, updatedAt: new Date() })
        .where(eq(tasks.id, input.taskId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      log.info({ taskId: input.taskId, newStatus: input.status, orderIndex: input.orderIndex }, "task moved");
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { orgId } = await resolveTaskOrg(ctx.db, input.taskId);
      assertOrgPermission(ctx.memberships, orgId, "task:update");
      await ctx.db.delete(tasks).where(eq(tasks.id, input.taskId));
      log.info({ taskId: input.taskId }, "task deleted");
      return { deleted: true };
    }),
});
