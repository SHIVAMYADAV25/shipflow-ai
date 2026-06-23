import dotenv from "dotenv";
import path from "node:path";

const result = dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

console.log("cwd =", process.cwd());
console.log("dotenv result =", result.error ?? "loaded");
console.log("DATABASE_URL =", process.env.DATABASE_URL);

import { drizzle } from "drizzle-orm/postgres-js";
import type { Logger as DrizzleLogger } from "drizzle-orm/logger";
import postgres from "postgres";
import { createLogger } from "@shipflow/logger";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __shipflowQueryClient: ReturnType<typeof postgres> | undefined;
}

function createQueryClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  return postgres(connectionString, {
    // Use a small pool for serverless environments (Vercel); raise this for a
    // long-lived Node server (apps/api running as a standalone process).
    max: process.env.NODE_ENV === "production" ? 1 : 10,
  });
}

const dbLog = createLogger("db");

/** Routes every SQL statement Drizzle executes through the shared logger at debug level. */
class PinoDrizzleLogger implements DrizzleLogger {
  logQuery(query: string, params: unknown[]): void {
    dbLog.debug({ query, params }, "sql query");
  }
}

// Reuse the connection across hot reloads in dev to avoid exhausting Postgres connections.
const queryClient = globalThis.__shipflowQueryClient ?? createQueryClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__shipflowQueryClient = queryClient;
}

export const db = drizzle(queryClient, { schema, logger: new PinoDrizzleLogger() });

export type Database = typeof db;
