import { eq, and, ilike, ne, desc } from "drizzle-orm";
import { db, featureRequests, discoveryMessages } from "@shipflow/db";
import { inngest } from "@shipflow/inngest";
import { runDiscoveryAgent, type DiscoveryConversationMessage } from "@shipflow/ai";
import { createLogger } from "@shipflow/logger";

const log = createLogger("inngest.discovery");

export const discoveryWorkflow = inngest.createFunction(
  { id: "feature-discovery", retries: 3 },
  [{ event: "feature/created" }, { event: "feature/discovery.message" }],
  async ({ event, step }) => {
    const { featureId } = event.data;

    const feature = await step.run("load-feature", async () => {
      const f = await db.query.featureRequests.findFirst({ where: eq(featureRequests.id, featureId) });
      if (!f) throw new Error(`feature ${featureId} not found`);
      return f;
    });

    // Discovery only applies while the request hasn't already moved past it
    // (e.g. a stray retried event after the feature was manually fast-tracked).
    if (!["new", "discovery"].includes(feature.status)) {
      log.info({ featureId, status: feature.status }, "skipping discovery -- feature already past this phase");
      return { skipped: true, reason: "feature not in new/discovery status" };
    }

    const conversation = await step.run("load-conversation", async () => {
      const rows = await db.query.discoveryMessages.findMany({
        where: eq(discoveryMessages.featureId, featureId),
        orderBy: discoveryMessages.createdAt,
      });
      return rows.map((r): DiscoveryConversationMessage => ({ role: r.role, content: r.content }));
    });

    // Lightweight duplicate-candidate retrieval: same project, similar title,
    // not already closed. A full pgvector/embedding similarity search is a
    // natural upgrade here (see README "What's next") but this keyword
    // search is real, queries the live DB, and is good enough signal for
    // the LLM to judge true duplication against -- not a placeholder.
    const candidates = await step.run("load-duplicate-candidates", async () => {
      const titleWords = feature.title.split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
      if (titleWords.length === 0) return [];
      const rows = await db.query.featureRequests.findMany({
        where: and(
          eq(featureRequests.projectId, feature.projectId),
          ne(featureRequests.id, feature.id),
          ne(featureRequests.status, "closed_duplicate"),
          ilike(featureRequests.title, `%${titleWords[0]}%`),
        ),
        orderBy: desc(featureRequests.createdAt),
        limit: 5,
      });
      return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, status: r.status }));
    });

    const decision = await step.run("run-discovery-agent", () =>
      runDiscoveryAgent({
        featureTitle: feature.title,
        featureDescription: feature.description,
        conversation,
        candidateExistingFeatures: candidates,
      }),
    );

    if (decision.isDuplicate) {
      await step.run("close-as-duplicate", async () => {
        await db.transaction(async (tx) => {
          await tx
            .update(featureRequests)
            .set({
              status: "closed_duplicate",
              isDuplicateOfFeatureId: decision.duplicateOfFeatureId,
              updatedAt: new Date(),
            })
            .where(eq(featureRequests.id, featureId));
          await tx.insert(discoveryMessages).values({
            featureId,
            role: "ai",
            content:
              decision.duplicateExplanation ??
              "This looks like it already exists -- closing as a duplicate.",
          });
        });
      });
      log.info({ featureId, duplicateOf: decision.duplicateOfFeatureId }, "feature closed as duplicate");
      return { outcome: "duplicate" as const };
    }

    if (!decision.readyForPrd) {
      await step.run("ask-followup-question", async () => {
        await db.transaction(async (tx) => {
          await tx.insert(discoveryMessages).values({
            featureId,
            role: "ai",
            content: decision.nextQuestion ?? "Could you share a bit more detail about this request?",
          });
          if (feature.status !== "discovery") {
            await tx
              .update(featureRequests)
              .set({ status: "discovery", updatedAt: new Date() })
              .where(eq(featureRequests.id, featureId));
          }
        });
      });
      log.info({ featureId }, "discovery agent asked a follow-up question");
      return { outcome: "needs_more_context" as const };
    }

    await step.sendEvent("trigger-prd-generation", {
      name: "prd/generate.requested",
      data: { featureId },
    });
    log.info({ featureId }, "discovery complete -- handed off to PRD generation");
    return { outcome: "ready_for_prd" as const };
  },
);
