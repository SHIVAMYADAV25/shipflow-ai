import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import Razorpay from "razorpay";
import { subscriptions, organizations } from "@shipflow/db";
import { createSubscriptionInput, subscriptionOutput, cancelSubscriptionInput, PLAN_LIMITS } from "@shipflow/common/schemas";
import { router, protectedProcedure } from "../trpc/trpc";
import { assertOrgPermission } from "../trpc/middleware";
import { createLogger } from "@shipflow/logger";

const log = createLogger("trpc.billing");

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Billing is not configured. Contact support." });
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// Razorpay Plan IDs -- set in your Razorpay dashboard and store in env.
const PLAN_IDS: Record<"pro" | "enterprise", string | undefined> = {
  pro: process.env.RAZORPAY_PLAN_ID_PRO,
  enterprise: process.env.RAZORPAY_PLAN_ID_ENTERPRISE,
};

export const billingRouter = router({
  getStatus: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.memberships.find((m: any) => m.orgId === input.orgId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization." });
      }
      const org = await ctx.db.query.organizations.findFirst({ where: eq(organizations.id, input.orgId) });
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });

      const sub = await ctx.db.query.subscriptions.findFirst({ where: eq(subscriptions.orgId, input.orgId) });
      const limits = PLAN_LIMITS[org.plan];
      return {
        plan: org.plan,
        aiCreditsUsed: org.aiCreditsUsed,
        aiCreditsLimit: org.aiCreditsLimit,
        repoLimit: org.repoLimit,
        subscription: sub ?? null,
        limits,
      };
    }),

  createSubscription: protectedProcedure
    .input(createSubscriptionInput)
    .mutation(async ({ ctx, input }) => {
      assertOrgPermission(ctx.memberships, input.orgId, "billing:manage");

      const planId = PLAN_IDS[input.plan];
      if (!planId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Razorpay plan ID for "${input.plan}" is not configured. Check RAZORPAY_PLAN_ID_* env vars.` });
      }

      const org = await ctx.db.query.organizations.findFirst({ where: eq(organizations.id, input.orgId) });
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });

      const rzp = getRazorpay();
      const rzpSubscription = await (rzp.subscriptions as any).create({
        plan_id: planId,
        quantity: 1,
        total_count: 12,
        notes: { orgId: input.orgId, orgName: org.name },
      });

      await ctx.db.transaction(async (tx) => {
        const existing = await tx.query.subscriptions.findFirst({ where: eq(subscriptions.orgId, input.orgId) });
        if (existing) {
          await tx.update(subscriptions).set({
            razorpaySubscriptionId: rzpSubscription.id,
            plan: input.plan,
            status: "incomplete",
            updatedAt: new Date(),
          }).where(eq(subscriptions.orgId, input.orgId));
        } else {
          await tx.insert(subscriptions).values({
            orgId: input.orgId,
            razorpaySubscriptionId: rzpSubscription.id,
            plan: input.plan,
            status: "incomplete",
          });
        }
        const limits = PLAN_LIMITS[input.plan];
        await tx.update(organizations).set({
          plan: input.plan,
          aiCreditsLimit: limits.aiCreditsPerMonth === Infinity ? 99999 : limits.aiCreditsPerMonth,
          repoLimit: limits.repoLimit === Infinity ? 9999 : limits.repoLimit,
          updatedAt: new Date(),
        }).where(eq(organizations.id, input.orgId));
      });

      log.info({ orgId: input.orgId, plan: input.plan, razorpaySubscriptionId: rzpSubscription.id }, "Razorpay subscription created");
      return { subscriptionId: rzpSubscription.id as string, shortUrl: rzpSubscription.short_url as string };
    }),

  cancelSubscription: protectedProcedure
    .input(cancelSubscriptionInput)
    .mutation(async ({ ctx, input }) => {
      assertOrgPermission(ctx.memberships, input.orgId, "billing:manage");

      const sub = await ctx.db.query.subscriptions.findFirst({ where: eq(subscriptions.orgId, input.orgId) });
      if (!sub?.razorpaySubscriptionId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active subscription found." });
      }

      const rzp = getRazorpay();
      await (rzp.subscriptions as any).cancel(sub.razorpaySubscriptionId, true);

      await ctx.db.update(subscriptions).set({ status: "canceled", updatedAt: new Date() }).where(eq(subscriptions.orgId, input.orgId));
      await ctx.db.update(organizations).set({ plan: "free", aiCreditsLimit: 100, repoLimit: 1, updatedAt: new Date() }).where(eq(organizations.id, input.orgId));

      log.info({ orgId: input.orgId }, "subscription canceled");
      return { canceled: true };
    }),
});
