import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import type { z } from "zod";
import { createLogger, toLogError } from "@shipflow/logger";

const log = createLogger("ai.client");

function getApiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set. Fill it in .env to use AI features.");
  }
  return key;
}

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const MODELS = {
  discovery: () => openai(process.env.OPENAI_MODEL_DISCOVERY ?? "gpt-4.1"),
  prd: () => openai(process.env.OPENAI_MODEL_PRD ?? "gpt-4.1"),
  review: () => openai(process.env.OPENAI_MODEL_REVIEW ?? "gpt-4.1"),
} as const;

export interface StructuredCallResult<T> {
  object: T;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

/**
 * Every AI agent in this package goes through this single function. It:
 *  - Forces the model into our exact Zod schema (no freeform text parsing,
 *    no risk of the agent inventing fields the rest of the app doesn't
 *    expect -- this is the core anti-hallucination mechanism).
 *  - Retries once on transient failures (rate limit / network) with backoff.
 *  - Logs duration and token usage at info level for cost observability,
 *    and the failure (with the agent name) at error level so a bad agent
 *    run is never silent.
 */
export async function runStructuredAgent<T>(opts: {
  agentName: string;
  model: LanguageModel;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  maxRetries?: number;
}): Promise<StructuredCallResult<T>> {
  getApiKey(); // fail fast with a clear message rather than a cryptic SDK error
  const { agentName, model, schema, system, prompt, maxRetries = 1 } = opts;
  const start = Date.now();

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateObject({ model, schema, system, prompt });
      const durationMs = Date.now() - start;
      log.info(
        {
          agentName,
          durationMs,
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
          attempt,
        },
        "ai agent call succeeded",
      );
      return {
        object: result.object,
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0,
        durationMs,
      };
    } catch (err) {
      lastError = err;
      log.warn({ agentName, attempt, ...toLogError(err) }, "ai agent call failed, will retry if attempts remain");
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  log.error({ agentName, ...toLogError(lastError) }, "ai agent call failed after all retries");
  throw lastError instanceof Error ? lastError : new Error(`AI agent "${agentName}" failed`);
}
