import { z } from "zod";
import { PRD_STATUSES } from "../enums";

export const prdStatusSchema = z.enum(PRD_STATUSES);

export const userStorySchema = z.object({
  id: z.string(), // short slug, e.g. "us-1"
  story: z.string().min(5), // "As a <role>, I want <goal>, so that <benefit>"
});

export const acceptanceCriterionSchema = z.object({
  id: z.string(), // short slug, e.g. "ac-1"
  criterion: z.string().min(5),
  userStoryId: z.string().optional(),
});

/**
 * Structured output the PRD Generator agent must return (via AI SDK's
 * generateObject against this exact schema -- never freeform text). This is
 * also the request body shape for manual PRD edits by a human (PRDController
 * .update in the backend PRD).
 */
export const prdContentSchema = z.object({
  problemStatement: z.string().min(20),
  goals: z.array(z.string().min(3)).min(1),
  nonGoals: z.array(z.string().min(3)).default([]),
  userStories: z.array(userStorySchema).min(1),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1),
  edgeCases: z.array(z.string().min(3)).default([]),
  successMetrics: z.array(z.string().min(3)).min(1),
});
export type PrdContent = z.infer<typeof prdContentSchema>;

export const generatePrdInput = z.object({
  featureId: z.string().uuid(),
});
export type GeneratePrdInput = z.infer<typeof generatePrdInput>;

export const updatePrdInput = prdContentSchema.partial().extend({
  prdId: z.string().uuid(),
});
export type UpdatePrdInput = z.infer<typeof updatePrdInput>;

export const approvePrdInput = z.object({
  prdId: z.string().uuid(),
});
export type ApprovePrdInput = z.infer<typeof approvePrdInput>;

export const prdOutput = prdContentSchema.extend({
  id: z.string().uuid(),
  featureId: z.string().uuid(),
  status: prdStatusSchema,
  approvedByUserId: z.string().uuid().nullable(),
  approvedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PrdOutput = z.infer<typeof prdOutput>;
