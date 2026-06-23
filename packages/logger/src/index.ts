import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

/**
 * Root logger. Levels (lowest -> highest severity): trace, debug, info,
 * warn, error, fatal. Set LOG_LEVEL to control verbosity per environment
 * (e.g. "debug" locally, "info" in production). Defaults to "info".
 *
 * - Development: pino-pretty, human-readable, colorized.
 * - Production: raw JSON lines (one log = one line) so they can be ingested
 *   by Vercel logs / Datadog / any log pipeline without a parser.
 */
export const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "shipflow" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Never let secrets land in logs even if a caller is careless about what
  // object they pass to `.info({ ... })`.
  redact: {
    paths: [
      "*.password",
      "*.secret",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.apiKey",
      "*.authorization",
      "headers.authorization",
      "headers.cookie",
      "*.privateKey",
      "*.webhookSecret",
      "*.razorpaySignature",
      "*.githubSignature",
    ],
    censor: "[REDACTED]",
  },
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname,service",
        },
      },
});

/**
 * Scoped child logger -- every log line carries `scope` so you can grep
 * `scope":"github.webhook"` across the whole pipeline. Use one per
 * module/router/agent/workflow, e.g.:
 *
 *   const log = createLogger("trpc.feature");
 *   log.info({ featureId }, "feature request created");
 */
export function createLogger(scope: string, bindings: Record<string, unknown> = {}) {
  return rootLogger.child({ scope, ...bindings });
}

/**
 * Per-request logger for tRPC, carrying correlation IDs through every log
 * line produced while handling that request. Built fresh in
 * apps/api/src/trpc/context.ts for every incoming call.
 */
export function createRequestLogger(opts: { requestId: string; userId?: string; orgId?: string }) {
  return rootLogger.child({
    scope: "trpc.request",
    requestId: opts.requestId,
    userId: opts.userId,
    orgId: opts.orgId,
  });
}

/** Normalizes unknown caught values into a loggable shape (pino wants `err`). */
export function toLogError(error: unknown): { err: unknown } {
  if (error instanceof Error) {
    return { err: { message: error.message, name: error.name, stack: error.stack } };
  }
  return { err: { message: String(error) } };
}

export type Logger = pino.Logger;
