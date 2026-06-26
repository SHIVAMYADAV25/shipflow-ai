// import { createOpenAI } from "@ai-sdk/openai";
// import { generateObject, type LanguageModel } from "ai";
// import type { z } from "zod";
// import { createLogger, toLogError } from "@shipflow/logger";

// const log = createLogger("ai.client");

// function getApiKey() {
//   const key = process.env.OPENAI_API_KEY;
//   if (!key) {
//     throw new Error("OPENAI_API_KEY is not set. Fill it in .env to use AI features.");
//   }
//   return key;
// }

// const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

// export const MODELS = {
//   discovery: () => openai(process.env.OPENAI_MODEL_DISCOVERY ?? "gpt-4.1"),
//   prd: () => openai(process.env.OPENAI_MODEL_PRD ?? "gpt-4.1"),
//   review: () => openai(process.env.OPENAI_MODEL_REVIEW ?? "gpt-4.1"),
// } as const;

// export interface StructuredCallResult<T> {
//   object: T;
//   promptTokens: number;
//   completionTokens: number;
//   totalTokens: number;
//   durationMs: number;
// }

// /**
//  * Every AI agent in this package goes through this single function. It:
//  *  - Forces the model into our exact Zod schema (no freeform text parsing,
//  *    no risk of the agent inventing fields the rest of the app doesn't
//  *    expect -- this is the core anti-hallucination mechanism).
//  *  - Retries once on transient failures (rate limit / network) with backoff.
//  *  - Logs duration and token usage at info level for cost observability,
//  *    and the failure (with the agent name) at error level so a bad agent
//  *    run is never silent.
//  */
// export async function runStructuredAgent<T>(opts: {
//   agentName: string;
//   model: LanguageModel;
//   schema: z.ZodType<T>;
//   system: string;
//   prompt: string;
//   maxRetries?: number;
// }): Promise<StructuredCallResult<T>> {
//   getApiKey(); // fail fast with a clear message rather than a cryptic SDK error
//   const { agentName, model, schema, system, prompt, maxRetries = 1 } = opts;
//   const start = Date.now();

//   let lastError: unknown;
//   for (let attempt = 0; attempt <= maxRetries; attempt++) {
//     try {
//       const result = await generateObject({ model, schema, system, prompt });
//       const durationMs = Date.now() - start;
//       log.info(
//         {
//           agentName,
//           durationMs,
//           promptTokens: result.usage?.promptTokens,
//           completionTokens: result.usage?.completionTokens,
//           attempt,
//         },
//         "ai agent call succeeded",
//       );
//       return {
//         object: result.object,
//         promptTokens: result.usage?.promptTokens ?? 0,
//         completionTokens: result.usage?.completionTokens ?? 0,
//         totalTokens: result.usage?.totalTokens ?? 0,
//         durationMs,
//       };
//     } catch (err) {
//       lastError = err;
//       log.warn({ agentName, attempt, ...toLogError(err) }, "ai agent call failed, will retry if attempts remain");
//       if (attempt < maxRetries) {
//         await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
//       }
//     }
//   }

//   log.error({ agentName, ...toLogError(lastError) }, "ai agent call failed after all retries");
//   throw lastError instanceof Error ? lastError : new Error(`AI agent "${agentName}" failed`);
// }


import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { createLogger, toLogError } from "@shipflow/logger";

const log = createLogger("ai.client");

// ---------------------------------------------------------------------------
// OpenRouter — chat/completion models (free tier via OpenRouter)
// The @ai-sdk/openai provider is fully OpenAI-compatible, so pointing its
// baseURL at OpenRouter is all we need. No other code changes required.
// ---------------------------------------------------------------------------

function getOpenRouterKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set. Fill it in .env to use AI features.");
  }
  return key;
}

// Lazily constructed so the missing-key error is thrown at call time, not
// at module load time (which would break the whole inngest server startup).
let _openrouter: ReturnType<typeof createOpenAI> | null = null;
function getOpenRouter() {
  if (!_openrouter) {
    _openrouter = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: getOpenRouterKey(),
      headers: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "ShipFlow AI",
      },
    });
  }
  return _openrouter;
}

// Default free models on OpenRouter. Override via env if you want paid ones.
// google/gemini-2.0-flash-exp:free is capable enough for all 4 agents.
const DEFAULT_MODEL = "google/gemini-2.0-flash-exp:free";

export const MODELS = {
  discovery: () => getOpenRouter()(process.env.OPENROUTER_MODEL_DISCOVERY ?? DEFAULT_MODEL),
  prd: () => getOpenRouter()(process.env.OPENROUTER_MODEL_PRD ?? DEFAULT_MODEL),
  review: () => getOpenRouter()(process.env.OPENROUTER_MODEL_REVIEW ?? DEFAULT_MODEL),
} as const;

// ---------------------------------------------------------------------------
// Gemini Embeddings — via @google/genai directly (Vercel AI SDK has no
// Gemini embedding support). Free tier: gemini-embedding-001
// ---------------------------------------------------------------------------

function getGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set. Fill it in .env to use embeddings.");
  }
  return key;
}

let _gemini: GoogleGenAI | null = null;
function getGemini() {
  if (!_gemini) {
    _gemini = new GoogleGenAI({ apiKey: getGeminiKey() });
  }
  return _gemini;
}

/**
 * Generate a text embedding using Gemini's free embedding model.
 * Returns a flat number[] (768 dimensions by default).
 *
 * Usage:
 *   const vec = await embedText("user feature request text");
 */
export async function embedText(text: string): Promise<number[]> {
  const ai = getGemini();
  const model = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
  const response = await ai.models.embedContent({
    model,
    contents: text,
    config: { outputDimensionality: 768 },
  });
  const values = response.embeddings?.[0]?.values;
  if (!values) throw new Error("Gemini embedding returned no values");
  return values;
}

// ---------------------------------------------------------------------------
// Shared structured agent runner — unchanged interface, new provider under the hood
// ---------------------------------------------------------------------------

export interface StructuredCallResult<T> {
  object: T;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

/**
 * Every AI agent goes through this single function. It:
 *  - Forces the model into our exact Zod schema via generateObject (same as before).
 *  - Retries once on transient failures with backoff.
 *  - Logs duration + token usage for cost observability.
 *
 * The only change from the original: `getApiKey()` → `getOpenRouterKey()`,
 * and the model comes from OpenRouter instead of OpenAI directly.
 */
export async function runStructuredAgent<T>(opts: {
  agentName: string;
  model: LanguageModel;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  maxRetries?: number;
}): Promise<StructuredCallResult<T>> {
  getOpenRouterKey(); // fail fast with a clear message
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