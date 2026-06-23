import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, subscriptions, webhookEvents, organizations } from "@shipflow/db";
import { razorpayWebhookSchema } from "@shipflow/common/schemas";
import { inngest } from "@shipflow/inngest";
import { createLogger, toLogError } from "@shipflow/logger";
import { readRawBody, sendJson } from "./util";

const log = createLogger("webhooks.razorpay");

function verifyRazorpaySignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function mapRazorpayStatus(status: string): "active" | "past_due" | "canceled" | "trialing" | "incomplete" {
  switch (status) {
    case "active":
    case "authenticated":
      return "active";
    case "pending":
    case "halted":
      return "past_due";
    case "cancelled":
    case "expired":
      return "canceled";
    case "created":
      return "incomplete";
    default:
      return "incomplete";
  }
}

export async function handleRazorpayWebhook(req: IncomingMessage, res: ServerResponse) {
  const rawBody = await readRawBody(req);
  const signature = req.headers["x-razorpay-signature"];

  if (!verifyRazorpaySignature(rawBody, typeof signature === "string" ? signature : undefined)) {
    log.warn("rejected Razorpay webhook with invalid signature");
    return sendJson(res, 401, { success: false, error: { code: "APP_002", message: "Invalid signature." } });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return sendJson(res, 400, { success: false, error: { code: "APP_001", message: "Invalid JSON body." } });
  }

  // Razorpay includes a stable event id as the top-level "id" field
  // (e.g. "evt_..."); fall back to a hash-free composite key if a sandbox
  // payload omits it rather than dropping the event.
  const externalEventId =
    typeof (payload as { id?: unknown })?.id === "string"
      ? ((payload as { id: string }).id)
      : `${(payload as { event?: string })?.event ?? "unknown"}:${rawBody.length}:${Date.now()}`;

  const existing = await db.query.webhookEvents.findFirst({
    where: and(eq(webhookEvents.source, "razorpay"), eq(webhookEvents.externalEventId, externalEventId)),
  });
  if (existing) {
    log.debug({ externalEventId }, "duplicate Razorpay event, already processed -- acking");
    return sendJson(res, 200, { success: true, data: { deduped: true } });
  }

  const parsed = razorpayWebhookSchema.safeParse(payload);
  const [eventRow] = await db
    .insert(webhookEvents)
    .values({
      source: "razorpay",
      externalEventId,
      eventType: parsed.success ? parsed.data.event : "unknown",
      payload: payload as object,
    })
    .returning();

  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues }, "Razorpay payload did not match expected shape -- ignoring");
    return sendJson(res, 200, { success: true });
  }

  try {
    const subEntity = parsed.data.payload.subscription?.entity;
    if (subEntity) {
      const orgId = subEntity.notes?.orgId;
      if (!orgId) {
        log.warn({ subscriptionId: subEntity.id }, "subscription webhook has no orgId in notes -- cannot apply");
      } else {
        await db
          .update(subscriptions)
          .set({
            status: mapRazorpayStatus(subEntity.status),
            currentPeriodEnd: subEntity.current_end ? new Date(subEntity.current_end * 1000) : null,
            razorpaySubscriptionId: subEntity.id,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.orgId, orgId));

        // Keep organizations.plan denormalized in sync for fast reads
        // (e.g. enforcing AI credit limits doesn't need a join every call).
        if (mapRazorpayStatus(subEntity.status) === "active") {
          const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.orgId, orgId) });
          if (sub) {
            await db.update(organizations).set({ plan: sub.plan, updatedAt: new Date() }).where(eq(organizations.id, orgId));
          }
        }

        await inngest.send({ name: "billing/subscription.updated", data: { orgId } });
        log.info({ orgId, status: subEntity.status, event: parsed.data.event }, "subscription updated from Razorpay webhook");
      }
    } else {
      log.debug({ event: parsed.data.event }, "Razorpay event had no subscription entity -- no action taken");
    }

    if (eventRow) {
      await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, eventRow.id));
    }
    return sendJson(res, 200, { success: true });
  } catch (err) {
    log.error({ ...toLogError(err) }, "failed processing Razorpay webhook");
    if (eventRow) {
      await db
        .update(webhookEvents)
        .set({ error: err instanceof Error ? err.message : String(err) })
        .where(eq(webhookEvents.id, eventRow.id));
    }
    return sendJson(res, 200, { success: false, error: { code: "APP_500", message: "Processing failed, logged for replay." } });
  }
}
