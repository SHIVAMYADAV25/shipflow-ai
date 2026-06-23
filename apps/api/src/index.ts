import http from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { appRouter } from "./routers/_app";
import { createContext } from "./trpc/context";
import { createLogger, toLogError } from "@shipflow/logger";
import { handleGithubWebhook } from "./webhooks/github";
import { handleRazorpayWebhook } from "./webhooks/razorpay";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

const log = createLogger("api.server");
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const trpcHandler = createHTTPHandler({
  router: appRouter,
  createContext: async ({ req }) => {
    // Convert Node's IncomingMessage headers into a standard Headers object
    // so createContext (shared with the Next.js fetch adapter, if used) stays
    // identical across runtimes.
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(", "));
    }
    return createContext({ headers });
  },
  onError({ error, path }) {
    log.error({ path, ...toLogError(error) }, "trpc transport error");
  },
});

/**
 * Single raw HTTP server hosting:
 *   /trpc/*            -> type-safe app API (tRPC)
 *   /webhooks/github    -> GitHub App webhook (pull_request, push)
 *   /webhooks/razorpay   -> Razorpay subscription/payment webhook
 *   /healthz            -> liveness check
 *
 * Webhooks need raw-body signature verification (see webhooks/*.ts), which
 * is incompatible with tRPC's own body parsing -- hence routing manually
 * here instead of mounting everything through the tRPC standalone adapter.
 */
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const start = Date.now();
  log.debug({ method: req.method, path: url.pathname }, "incoming request");

  try {
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/webhooks/github" && req.method === "POST") {
      await handleGithubWebhook(req, res);
      return;
    }

    if (url.pathname === "/webhooks/razorpay" && req.method === "POST") {
      await handleRazorpayWebhook(req, res);
      return;
    }

    if (url.pathname.startsWith("/trpc")) {
      // The standalone tRPC adapter has no built-in path-prefix support, so
      // strip the /trpc prefix before handing off -- it expects req.url to
      // be the bare procedure path (e.g. "/org.create").
      req.url = url.pathname.slice("/trpc".length) + url.search;
      await trpcHandler(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: { code: "APP_004", message: "Not found" } }));
  } catch (err) {
    log.error({ path: url.pathname, ...toLogError(err) }, "unhandled error in request router");
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: { code: "APP_500", message: "Internal server error" } }));
    }
  } finally {
    log.info({ method: req.method, path: url.pathname, durationMs: Date.now() - start, status: res.statusCode }, "request complete");
  }
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port);
log.info({ port }, "shipflow api server listening (tRPC at /trpc/*, webhooks at /webhooks/*)");

process.on("unhandledRejection", (reason) => {
  log.fatal(toLogError(reason), "unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  log.fatal(toLogError(err), "uncaught exception");
});
