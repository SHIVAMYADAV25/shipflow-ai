import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { projects } from "@shipflow/db";
import { createProjectInput, listProjectsInput, projectOutput } from "@shipflow/common/schemas";
import { router } from "../trpc/trpc";
import { orgProcedure, orgMemberProcedure } from "../trpc/middleware";

export const projectRouter = router({
  create: orgProcedure("project:create")
    .input(createProjectInput)
    .output(projectOutput)
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .insert(projects)
        .values({
          orgId: input.orgId,
          name: input.name,
          description: input.description ?? null,
          createdByUserId: ctx.user.id,
        })
        .returning();

      if (!project) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create project." });
      }
      return project;
    }),

  list: orgMemberProcedure.input(listProjectsInput).query(async ({ ctx, input }) => {
    return ctx.db.query.projects.findMany({
      where: eq(projects.orgId, input.orgId),
      orderBy: desc(projects.createdAt),
      limit: input.limit,
    });
  }),
});
