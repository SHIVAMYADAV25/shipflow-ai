import type { IncomingMessage, ServerResponse } from "node:http";
import { eq, and } from "drizzle-orm";
import { db, repositories, pullRequests, featureRequests, webhookEvents } from "@shipflow/db";
import { verifyGithubWebhookSignature } from "@shipflow/github";
import { inngest } from "@shipflow/inngest";
import {
  githubPullRequestWebhookSchema,
  githubPushWebhookSchema,
} from "@shipflow/common/schemas";
import { createLogger, toLogError } from "@shipflow/logger";
import { readRawBody, sendJson } from "./util";

const log = createLogger("webhooks.github");

// Branch names are expected to reference the feature they implement, e.g.
// "feature/3fa85f64-5717-4562-b3fc-2c963f66afa6-checkout-export" -- this is
// the convention documented in the README for auto-linking a PR to a
// feature without requiring a manual step in the UI. If no UUID is found in
// the branch name, the PR is left unlinked and a human links it manually
// via pullRequest.linkToFeature (it will simply not get an AI review until
// linked, which is logged, not silently dropped).
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function findFeatureIdFromBranch(branch: string): Promise<string | null> {
  const match = branch.match(UUID_RE);
  if (!match) return null;
  const feature = await db.query.featureRequests.findFirst({ where: eq(featureRequests.id, match[0]) });
  return feature?.id ?? null;
}

export async function handleGithubWebhook(req: IncomingMessage, res: ServerResponse) {
  const rawBody = await readRawBody(req);
  const signature = req.headers["x-hub-signature-256"];
  const eventType = req.headers["x-github-event"];
  const deliveryId = req.headers["x-github-delivery"];

  if (typeof eventType !== "string" || typeof deliveryId !== "string") {
    return sendJson(res, 400, { success: false, error: { code: "APP_001", message: "Missing GitHub headers." } });
  }

  const isValid = await verifyGithubWebhookSignature(
    rawBody,
    typeof signature === "string" ? signature : null,
  );
  if (!isValid) {
    log.warn({ eventType, deliveryId }, "rejected webhook with invalid signature");
    return sendJson(res, 401, { success: false, error: { code: "APP_002", message: "Invalid signature." } });
  }

  // Idempotency: GitHub retries deliveries that don't 2xx quickly, and can
  // occasionally send the same delivery twice. Dedupe on (source, deliveryId).
  const existing = await db.query.webhookEvents.findFirst({
    where: and(eq(webhookEvents.source, "github"), eq(webhookEvents.externalEventId, deliveryId)),
  });
  if (existing) {
    log.debug({ deliveryId }, "duplicate delivery, already processed -- acking");
    return sendJson(res, 200, { success: true, data: { deduped: true } });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return sendJson(res, 400, { success: false, error: { code: "APP_001", message: "Invalid JSON body." } });
  }

  const [eventRow] = await db
    .insert(webhookEvents)
    .values({ source: "github", externalEventId: deliveryId, eventType, payload: payload as object })
    .returning();

  try {
    if (eventType === "pull_request") {
      await handlePullRequestEvent(payload);
    } else if (eventType === "push") {
      const parsed = githubPushWebhookSchema.safeParse(payload);
      if (parsed.success) {
        log.info({ ref: parsed.data.ref, sha: parsed.data.after }, "received push event (no action taken yet)");
      }
    } else {
      log.debug({ eventType }, "received unhandled GitHub event type -- acking without action");
    }

    if (eventRow) {
      await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, eventRow.id));
    }
    return sendJson(res, 200, { success: true });
  } catch (err) {
    log.error({ eventType, deliveryId, ...toLogError(err) }, "failed processing GitHub webhook");
    if (eventRow) {
      await db
        .update(webhookEvents)
        .set({ error: err instanceof Error ? err.message : String(err) })
        .where(eq(webhookEvents.id, eventRow.id));
    }
    // Still ack 200: the event is durably recorded in webhook_events with the
    // error attached, so it can be replayed manually. Returning a non-2xx
    // here would just cause GitHub to retry the exact same payload into the
    // exact same bug.
    return sendJson(res, 200, { success: false, error: { code: "APP_500", message: "Processing failed, logged for replay." } });
  }
}

async function handlePullRequestEvent(payload: unknown) {
  const parsed = githubPullRequestWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "pull_request payload did not match expected shape -- ignoring");
    return;
  }
  const { action, number, repository, pull_request: ghPr } = parsed.data;

  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.githubRepoId, String(repository.id)),
  });
  if (!repo) {
    log.info(
      { githubRepoId: repository.id, fullName: repository.full_name },
      "PR event for a repo that isn't connected in ShipFlow -- ignoring",
    );
    return;
  }

  const existingPr = await db.query.pullRequests.findFirst({
    where: and(eq(pullRequests.repoId, repo.id), eq(pullRequests.prNumber, number)),
  });

  if (action === "closed") {
    if (existingPr) {
      await db
        .update(pullRequests)
        .set({ state: ghPr.merged ? "merged" : "closed", updatedAt: new Date() })
        .where(eq(pullRequests.id, existingPr.id));
    }
    return;
  }

  const featureId = existingPr?.featureId ?? (await findFeatureIdFromBranch(ghPr.head.ref));

  let pullRequestId: string;
  if (existingPr) {
    await db
      .update(pullRequests)
      .set({
        title: ghPr.title,
        url: ghPr.html_url,
        branch: ghPr.head.ref,
        headSha: ghPr.head.sha,
        authorGithubLogin: ghPr.user.login,
        state: ghPr.draft ? "draft" : "open",
        featureId: featureId ?? existingPr.featureId,
        updatedAt: new Date(),
      })
      .where(eq(pullRequests.id, existingPr.id));
    pullRequestId = existingPr.id;
  } else {
    const [inserted] = await db
      .insert(pullRequests)
      .values({
        repoId: repo.id,
        featureId,
        prNumber: number,
        title: ghPr.title,
        url: ghPr.html_url,
        branch: ghPr.head.ref,
        headSha: ghPr.head.sha,
        authorGithubLogin: ghPr.user.login,
        state: ghPr.draft ? "draft" : "open",
        mergeStatus: "unknown",
      })
      .returning();
    if (!inserted) throw new Error("failed to insert pull_request row");
    pullRequestId = inserted.id;
  }

  if (!featureId) {
    log.warn(
      { pullRequestId, branch: ghPr.head.ref },
      "PR has no feature UUID in its branch name -- link it manually before an AI review can run",
    );
  }

  if (ghPr.draft) {
    log.debug({ pullRequestId }, "PR is a draft -- not triggering review yet");
    return;
  }

  if (action === "opened" || action === "reopened" || action === "ready_for_review") {
    await inngest.send({ name: "github/pull_request.opened", data: { pullRequestId } });
  } else if (action === "synchronize") {
    await inngest.send({ name: "github/pull_request.synchronized", data: { pullRequestId } });
  }
}
