import express from "express";
import { serve } from "inngest/express";
import { inngest } from "@shipflow/inngest";
import { functions } from "./functions";
import { createLogger, toLogError } from "@shipflow/logger";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

const log = createLogger("inngest.server");
const app = express();
app.use(express.json());

app.use("/api/inngest", serve({ client: inngest, functions }));

const FUNCTION_IDS = ["feature-discovery", "prd-generate", "tasks-generate", "pr-review"];

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, functionCount: functions.length, functionIds: FUNCTION_IDS });
});

const port = Number(process.env.INNGEST_APP_PORT ?? 4002);
app.listen(port, () => {
  log.info({ port, functionCount: functions.length }, "shipflow inngest functions server listening");
});

process.on("unhandledRejection", (reason) => log.fatal(toLogError(reason), "unhandled promise rejection"));
process.on("uncaughtException", (err) => log.fatal(toLogError(err), "uncaught exception"));
