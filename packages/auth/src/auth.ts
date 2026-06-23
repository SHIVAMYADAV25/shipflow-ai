import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@shipflow/db";
import * as schema from "@shipflow/db/schema";

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
 * KEY: We pass the full `schema` object to drizzleAdapter so BetterAuth can
 * locate the `user`, `session`, `account`, and `verification` table
 * definitions by name. Without this, BetterAuth throws:
 *   "The model 'user' was not found in the schema object"
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  // Allow the standalone API server to call BetterAuth's session endpoint
  // cross-origin (apps/api runs on :4000, web on :3000).
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  ],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false, // flip on once transactional email is wired up
  },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? "",
      // Required: fetch the user's email even if they've set it to private.
      // Without this scope BetterAuth gets email: null and throws email_not_found.
      scope: ["read:user", "user:email"],
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,      // refresh once a day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // re-validate session cookie every 5 minutes
    },
  },
});

export type Auth = typeof auth;