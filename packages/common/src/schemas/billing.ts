import { z } from "zod";
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES } from "../enums";

export const subscriptionPlanSchema = z.enum(SUBSCRIPTION_PLANS);
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);

// ---- Release ----

export const approveReleaseInput = z.object({
  featureId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});
export type ApproveReleaseInput = z.infer<typeof approveReleaseInput>;

export const shipFeatureInput = z.object({
  featureId: z.string().uuid(),
});
export type ShipFeatureInput = z.infer<typeof shipFeatureInput>;

export const releaseOutput = z.object({
  id: z.string().uuid(),
  featureId: z.string().uuid(),
  approvedByUserId: z.string().uuid(),
  readinessScore: z.number().int().nullable(),
  notes: z.string().nullable(),
  releasedAt: z.date(),
});
export type ReleaseOutput = z.infer<typeof releaseOutput>;

// ---- Billing ----

export const createSubscriptionInput = z.object({
  orgId: z.string().uuid(),
  plan: subscriptionPlanSchema.exclude(["free"]),
});
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionInput>;

export const cancelSubscriptionInput = z.object({
  orgId: z.string().uuid(),
});
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionInput>;

export const subscriptionOutput = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  razorpaySubscriptionId: z.string().nullable(),
  plan: subscriptionPlanSchema,
  status: subscriptionStatusSchema,
  currentPeriodEnd: z.date().nullable(),
});
export type SubscriptionOutput = z.infer<typeof subscriptionOutput>;

/** Plan limits enforced in middleware before AI calls / repo connects. */
export const PLAN_LIMITS: Record<
  z.infer<typeof subscriptionPlanSchema>,
  { aiCreditsPerMonth: number; repoLimit: number }
> = {
  free: { aiCreditsPerMonth: 100, repoLimit: 1 },
  pro: { aiCreditsPerMonth: 2000, repoLimit: 10 },
  enterprise: { aiCreditsPerMonth: Number.POSITIVE_INFINITY, repoLimit: Number.POSITIVE_INFINITY },
};

/**
 * Minimal, validated slice of Razorpay webhook payloads we trust.
 * Signature verification happens before this is parsed (see apps/api
 * webhook handler) -- this schema only shapes what we read out of it.
 */
export const razorpayWebhookSchema = z.object({
  event: z.string(),
  payload: z.object({
    subscription: z
      .object({
        entity: z.object({
          id: z.string(),
          status: z.string(),
          current_end: z.number().nullable().optional(),
          notes: z.record(z.string()).optional(),
        }),
      })
      .optional(),
    payment: z
      .object({
        entity: z.object({
          id: z.string(),
          status: z.string(),
          notes: z.record(z.string()).optional(),
        }),
      })
      .optional(),
  }),
});
export type RazorpayWebhookPayload = z.infer<typeof razorpayWebhookSchema>;
