import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { ERROR_CODES } from "@shipflow/common/envelope";
import { createLogger, toLogError } from "@shipflow/logger";
import type { Context } from "./context";

const log = createLogger("trpc.core");

const t = initTRPC.context<Context>().create({
  transformer: superjson, // lets Date/Map/Set survive the wire intact (our schemas use z.date())
  errorFormatter({ shape, error, path }) {
    const appCode =
      error.code === "UNAUTHORIZED"
        ? ERROR_CODES.UNAUTHORIZED
        : error.code === "FORBIDDEN"
          ? ERROR_CODES.FORBIDDEN
          : error.code === "NOT_FOUND"
            ? ERROR_CODES.NOT_FOUND
            : error.code === "BAD_REQUEST" && error.cause instanceof ZodError
              ? ERROR_CODES.VALIDATION_ERROR
              : error.code === "CONFLICT"
                ? ERROR_CODES.CONFLICT
                : error.code === "TOO_MANY_REQUESTS"
                  ? ERROR_CODES.RATE_LIMITED
                  : ERROR_CODES.INTERNAL_ERROR;

    // Anything that maps to our generic 500 bucket is, by definition,
    // unexpected -- log it at error level with the full stack. Client
    // errors (validation, forbidden, not found) are expected traffic and
    // are already covered by the per-call logging middleware below at
    // warn/info level, so we don't double-log them here.
    if (appCode === ERROR_CODES.INTERNAL_ERROR) {
      log.error({ path, appCode, ...toLogError(error.cause ?? error) }, "unhandled procedure error");
    }

    return {
      ...shape,
      data: {
        ...shape.data,
        appCode,
        zodFieldErrors:
          error.cause instanceof ZodError ? error.cause.flatten().fieldErrors : null,
      },
    };
  },
});

export const router = t.router;
export const middleware = t.middleware;

/** Logs every call (path, type, duration, outcome) at debug/warn level. */
const withLogging = t.middleware(async ({ ctx, path, type, next }) => {
  const start = Date.now();
  ctx.log.debug({ path, type }, "procedure start");

  const result = await next();
  const durationMs = Date.now() - start;

  if (result.ok) {
    ctx.log.info({ path, type, durationMs }, "procedure ok");
  } else {
    const level = result.error.code === "INTERNAL_SERVER_ERROR" ? "error" : "warn";
    ctx.log[level](
      { path, type, durationMs, code: result.error.code, message: result.error.message },
      "procedure failed",
    );
  }

  return result;
});

export const publicProcedure = t.procedure.use(withLogging);

/** Throws UNAUTHORIZED and narrows ctx.user to non-null for everything downstream. */
const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "You must be signed in." });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // now non-null to TypeScript
    },
  });
});

export const protectedProcedure = publicProcedure.use(isAuthed);
