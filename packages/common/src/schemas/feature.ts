import { z } from "zod";
import {
  FEATURE_STATUSES,
  FEATURE_PRIORITIES,
  FEATURE_SOURCE_CHANNELS,
  DISCOVERY_ROLES,
} from "../enums";

export const featureStatusSchema = z.enum(FEATURE_STATUSES);
export const featurePrioritySchema = z.enum(FEATURE_PRIORITIES);
export const featureSourceChannelSchema = z.enum(FEATURE_SOURCE_CHANNELS);
export const discoveryRoleSchema = z.enum(DISCOVERY_ROLES);

export const createFeatureRequestInput = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(3).max(512),
  description: z.string().min(10).max(10_000),
  sourceChannel: featureSourceChannelSchema.default("manual"),
  priority: featurePrioritySchema.default("medium"),
});
export type CreateFeatureRequestInput = z.infer<typeof createFeatureRequestInput>;

export const updateFeatureStatusInput = z.object({
  featureId: z.string().uuid(),
  status: featureStatusSchema,
  // required when status === "closed_duplicate"
  isDuplicateOfFeatureId: z.string().uuid().optional(),
}).refine(
  (val) => val.status !== "closed_duplicate" || !!val.isDuplicateOfFeatureId,
  { message: "isDuplicateOfFeatureId is required when closing as a duplicate", path: ["isDuplicateOfFeatureId"] },
);
export type UpdateFeatureStatusInput = z.infer<typeof updateFeatureStatusInput>;

export const listFeatureRequestsInput = z.object({
  projectId: z.string().uuid(),
  status: featureStatusSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type ListFeatureRequestsInput = z.infer<typeof listFeatureRequestsInput>;

export const featureRequestOutput = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  sourceChannel: featureSourceChannelSchema,
  status: featureStatusSchema,
  priority: featurePrioritySchema,
  isDuplicateOfFeatureId: z.string().uuid().nullable(),
  createdByUserId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type FeatureRequestOutput = z.infer<typeof featureRequestOutput>;

// ---- Discovery (AI clarification Q&A) ----

export const postDiscoveryMessageInput = z.object({
  featureId: z.string().uuid(),
  content: z.string().min(1).max(5000),
});
export type PostDiscoveryMessageInput = z.infer<typeof postDiscoveryMessageInput>;

export const discoveryMessageOutput = z.object({
  id: z.string().uuid(),
  featureId: z.string().uuid(),
  role: discoveryRoleSchema,
  content: z.string(),
  authorUserId: z.string().uuid().nullable(),
  createdAt: z.date(),
});
export type DiscoveryMessageOutput = z.infer<typeof discoveryMessageOutput>;

/**
 * Structured output the Discovery Agent (AI SDK `generateObject`) must return.
 * `readyForPrd: false` means the agent still needs more context and
 * `nextQuestion` should be posted as the next discovery message.
 * `isDuplicate: true` means the agent recognized an existing feature/offering
 * and the request should be auto-closed and the user educated, per the PRD.
 */
export const discoveryAgentDecisionSchema = z.object({
  readyForPrd: z.boolean(),
  isDuplicate: z.boolean(),
  duplicateOfFeatureId: z.string().uuid().nullable(),
  duplicateExplanation: z.string().nullable(),
  nextQuestion: z.string().nullable(),
  reasoning: z.string(),
});
export type DiscoveryAgentDecision = z.infer<typeof discoveryAgentDecisionSchema>;
