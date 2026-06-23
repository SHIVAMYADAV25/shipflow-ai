import { z } from "zod";
import { REVIEW_AGENT_TYPES, REVIEW_SEVERITIES, REVIEW_STATUSES } from "../enums";

export const reviewAgentTypeSchema = z.enum(REVIEW_AGENT_TYPES);
export const reviewSeveritySchema = z.enum(REVIEW_SEVERITIES);
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);

export const triggerReviewInput = z.object({
  pullRequestId: z.string().uuid(),
});
export type TriggerReviewInput = z.infer<typeof triggerReviewInput>;

export const resolveReviewIssueInput = z.object({
  reviewId: z.string().uuid(),
  status: z.enum(["resolved", "dismissed"]),
});
export type ResolveReviewIssueInput = z.infer<typeof resolveReviewIssueInput>;

export const listReviewsInput = z.object({
  pullRequestId: z.string().uuid(),
});
export type ListReviewsInput = z.infer<typeof listReviewsInput>;

export const reviewOutput = z.object({
  id: z.string().uuid(),
  pullRequestId: z.string().uuid(),
  agentType: reviewAgentTypeSchema,
  severity: reviewSeveritySchema,
  status: reviewStatusSchema,
  title: z.string(),
  feedback: z.string(),
  filePath: z.string().nullable(),
  lineNumber: z.number().int().nullable(),
  relatedAcceptanceCriterionId: z.string().nullable(),
  reviewRunId: z.string().uuid(),
  resolvedByUserId: z.string().uuid().nullable(),
  resolvedAt: z.date().nullable(),
  createdAt: z.date(),
});
export type ReviewOutput = z.infer<typeof reviewOutput>;

/**
 * Structured output the Code Review Agent must return for ONE finding.
 * The agent (run once per concern -- requirements/security/performance/
 * testing, per the backend PRD's "Other Agents" section) returns an array
 * of these via generateObject. `explanation` is mandatory: the PRD requires
 * the agent to "explain why issues exist," never just flag a line.
 */
export const reviewFindingSchema = z.object({
  agentType: reviewAgentTypeSchema,
  severity: reviewSeveritySchema,
  title: z.string().min(3).max(512),
  explanation: z.string().min(10),
  filePath: z.string().nullable(),
  lineNumber: z.number().int().nullable(),
  relatedAcceptanceCriterionId: z.string().nullable(),
});
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

export const reviewFindingsSchema = z.array(reviewFindingSchema);
export type ReviewFindings = z.infer<typeof reviewFindingsSchema>;

/** Release readiness score computed after a review run completes. */
export const releaseReadinessSchema = z.object({
  score: z.number().int().min(0).max(100),
  blockingIssueCount: z.number().int().min(0),
  nonBlockingIssueCount: z.number().int().min(0),
  rationale: z.string(),
});
export type ReleaseReadiness = z.infer<typeof releaseReadinessSchema>;
