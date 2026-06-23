import { z } from "zod";

/**
 * Mirrors the backend PRD's standardized error envelope. tRPC already wraps
 * everything in its own success/error transport, so in practice this shape
 * is used for the `cause`/`data` payload of TRPCError and for any non-tRPC
 * REST endpoints (e.g. raw webhook handlers) that need the same contract.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: "APP_001",
  UNAUTHORIZED: "APP_002",
  FORBIDDEN: "APP_003",
  NOT_FOUND: "APP_004",
  CONFLICT: "APP_005",
  RATE_LIMITED: "APP_006",
  AI_PROVIDER_ERROR: "APP_007",
  GITHUB_API_ERROR: "APP_008",
  PAYMENT_ERROR: "APP_009",
  INTERNAL_ERROR: "APP_500",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const apiEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: apiErrorSchema.optional(),
  meta: z
    .object({
      timestamp: z.string(),
    })
    .optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function errorEnvelope(code: ErrorCode, message: string) {
  return {
    success: false as const,
    error: { code, message },
    meta: { timestamp: new Date().toISOString() },
  };
}

export function successEnvelope<T>(data: T) {
  return {
    success: true as const,
    data,
    meta: { timestamp: new Date().toISOString() },
  };
}
