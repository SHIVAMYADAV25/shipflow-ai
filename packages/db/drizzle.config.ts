import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Single entry point — schema.ts now contains both BetterAuth identity
  // tables (user, session, account, verification) and all ShipFlow SaaS
  // tables. This ensures drizzle-kit generate produces one coherent migration.
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});