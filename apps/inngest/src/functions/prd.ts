import { eq } from "drizzle-orm";
import { db, featureRequests, discoveryMessages, prds } from "@shipflow/db";
import { inngest } from "@shipflow/inngest";
import { runPrdGeneratorAgent, type DiscoveryConversationMessage } from "@shipflow/ai";
import { createLogger } from "@shipflow/logger";

const log = createLogger("inngest.prd");

export const prdGenerationWorkflow = inngest.createFunction(
  { id: "prd-generate", retries: 3 },
  { event: "prd/generate.requested" },
  async ({ event, step }) => {
    const { featureId } = event.data;

    const feature = await step.run("load-feature", async () => {
      const f = await db.query.featureRequests.findFirst({ where: eq(featureRequests.id, featureId) });
      if (!f) throw new Error(`feature ${featureId} not found`);
      return f;
    });

    const existing = await step.run("check-existing-prd", () =>
      db.query.prds.findFirst({ where: eq(prds.featureId, featureId) }),
    );
    if (existing) {
      log.info({ featureId, prdId: existing.id }, "PRD already exists -- skipping regeneration");
      return { outcome: "already_exists" as const, prdId: existing.id };
    }

    const conversation = await step.run("load-conversation", async () => {
      const rows = await db.query.discoveryMessages.findMany({
        where: eq(discoveryMessages.featureId, featureId),
        orderBy: discoveryMessages.createdAt,
      });
      return rows.map((r): DiscoveryConversationMessage => ({ role: r.role, content: r.content }));
    });

    const content = await step.run("run-prd-generator-agent", () =>
      runPrdGeneratorAgent({
        featureTitle: feature.title,
        featureDescription: feature.description,
        conversation,
      }),
    );

    const prd = await step.run("persist-prd", async () => {
      const [row] = await db
        .insert(prds)
        .values({
          featureId,
          status: "draft",
          problemStatement: content.problemStatement,
          goals: content.goals,
          nonGoals: content.nonGoals,
          userStories: content.userStories,
          acceptanceCriteria: content.acceptanceCriteria,
          edgeCases: content.edgeCases,
          successMetrics: content.successMetrics,
        })
        .returning();
      await db
        .update(featureRequests)
        .set({ status: "prd_ready", updatedAt: new Date() })
        .where(eq(featureRequests.id, featureId));
      return row;
    });

    log.info({ featureId, prdId: prd?.id }, "PRD generated");
    return { outcome: "generated" as const, prdId: prd?.id };
  },
);
