/**
 * These tuples are the single source of truth for every enum in the system.
 * - packages/db/src/schema.ts imports them for pgEnum(...)
 * - packages/common/src/schemas/*.ts imports them for z.enum(...)
 * This guarantees the database, the Zod validators, and the inferred
 * TypeScript types can never drift apart.
 */

export const ORG_ROLES = [
  "owner",
  "admin",
  "pm",
  "developer",
  "reviewer",
  "viewer",
] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const SUBSCRIPTION_PLANS = ["free", "pro", "enterprise"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "canceled",
  "trialing",
  "incomplete",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const FEATURE_STATUSES = [
  "new",
  "discovery",
  "prd_ready",
  "planning",
  "in_progress",
  "review",
  "approval",
  "shipped",
  "closed_duplicate",
] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const FEATURE_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type FeaturePriority = (typeof FEATURE_PRIORITIES)[number];

export const FEATURE_SOURCE_CHANNELS = [
  "email",
  "support_ticket",
  "call_transcript",
  "manual",
] as const;
export type FeatureSourceChannel = (typeof FEATURE_SOURCE_CHANNELS)[number];

export const PRD_STATUSES = ["draft", "pending_approval", "approved"] as const;
export type PrdStatus = (typeof PRD_STATUSES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PULL_REQUEST_STATES = [
  "open",
  "draft",
  "changes_requested",
  "approved",
  "merged",
  "closed",
] as const;
export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];

export const REVIEW_AGENT_TYPES = [
  "ai_requirements",
  "ai_security",
  "ai_performance",
  "ai_testing",
  "manual",
] as const;
export type ReviewAgentType = (typeof REVIEW_AGENT_TYPES)[number];

export const REVIEW_SEVERITIES = ["blocking", "non_blocking", "info"] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export const REVIEW_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const DISCOVERY_ROLES = ["ai", "user"] as const;
export type DiscoveryRole = (typeof DISCOVERY_ROLES)[number];

/**
 * Role -> permission matrix referenced by both the tRPC procedure guards
 * (packages/common/src/permissions.ts) and the frontend (to decide what to
 * render). Keeping it here means there's exactly one place that defines
 * "who can do what."
 */
export const PERMISSIONS = [
  "org:manage",
  "org:invite",
  "project:create",
  "project:delete",
  "feature:create",
  "feature:update_status",
  "prd:edit",
  "prd:approve",
  "task:update",
  "github:connect",
  "review:trigger",
  "review:resolve",
  "release:approve",
  "billing:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
