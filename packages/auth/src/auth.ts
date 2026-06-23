import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@shipflow/db";

/**
 * DESIGN NOTE (read before changing this file):
 *
 * BetterAuth owns identity (user, session, account, email verification).
 * It does NOT own our multi-tenant org/role model. ShipFlow's roles
 * (owner/admin/pm/developer/reviewer/viewer) and billing fields
 * (plan, aiCreditsUsed, repoLimit) don't map onto BetterAuth's generic
 * "organization" plugin shape, so we deliberately keep our own
 * `organizations` / `org_members` tables (packages/db/src/schema.ts) as the
 * source of truth for tenancy and RBAC, and resolve membership/role
 * ourselves in the tRPC context (apps/api/src/trpc/context.ts) by querying
 * those tables with the authenticated user's id from the BetterAuth session.
 *
 * This keeps BetterAuth's upgrade surface small (just auth) and keeps all
 * SaaS-specific logic in code we control and can evolve freely.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // flip on once transactional email is wired up
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? "",
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
});

export type Auth = typeof auth;
