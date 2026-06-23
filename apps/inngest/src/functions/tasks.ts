import { eq } from "drizzle-orm";
import { db, prds, tasks, featureRequests } from "@shipflow/db";
import { inngest } from "@shipflow/inngest";
import { runTaskSplitterAgent, type PrdContent } from "@shipflow/ai";
import { createLogger } from "@shipflow/logger";

const log = createLogger("inngest.tasks");

export const taskGenerationWorkflow = inngest.createFunction(
  { id: "tasks-generate", retries: 3 },
  { event: "tasks/generate.requested" },
  async ({ event, step }) => {
    const { prdId } = event.data;

    const prd = await step.run("load-prd", async () => {
      const p = await db.query.prds.findFirst({ where: eq(prds.id, prdId) });
      if (!p) throw new Error(`prd ${prdId} not found`);
      return p;
    });

    const existingTasks = await step.run("check-existing-tasks", () =>
      db.query.tasks.findMany({ where: eq(tasks.prdId, prdId) }),
    );
    if (existingTasks.length > 0) {
      log.info({ prdId, count: existingTasks.length }, "tasks already exist -- skipping regeneration");
      return { outcome: "already_exists" as const, taskCount: existingTasks.length };
    }

    const prdContent: PrdContent = {
      problemStatement: prd.problemStatement,
      goals: prd.goals,
      nonGoals: prd.nonGoals,
      userStories: prd.userStories,
      acceptanceCriteria: prd.acceptanceCriteria,
      edgeCases: prd.edgeCases,
      successMetrics: prd.successMetrics,
    };

    const generated = await step.run("run-task-splitter-agent", () => runTaskSplitterAgent(prdContent));

    const inserted = await step.run("persist-tasks", async () => {
      const rows = await db
        .insert(tasks)
        .values(
          generated.map((t, i) => ({
            prdId,
            title: t.title,
            description: t.description ?? null,
            userStoryId: t.userStoryId ?? null,
            status: "todo" as const,
            orderIndex: i,
          })),
        )
        .returning();

      await db
        .update(featureRequests)
        .set({ status: "planning", updatedAt: new Date() })
        .where(eq(featureRequests.id, prd.featureId));

      return rows;
    });

    log.info({ prdId, taskCount: inserted.length }, "tasks generated");
    return { outcome: "generated" as const, taskCount: inserted.length };
  },
);
