import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import {
  ORG_ROLES,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  FEATURE_STATUSES,
  PRD_STATUSES,
  TASK_STATUSES,
  PULL_REQUEST_STATES,
  REVIEW_AGENT_TYPES,
  REVIEW_SEVERITIES,
  REVIEW_STATUSES,
  DISCOVERY_ROLES,
} from "@shipflow/common/enums";

// ---------------------------------------------------------------------------
// Enums
// All value lists are imported from @shipflow/common/enums -- the single
// source of truth shared with the Zod schemas. Do not hardcode strings here.
// ---------------------------------------------------------------------------

export const orgRoleEnum = pgEnum("org_role", [...ORG_ROLES]);
export const subscriptionPlanEnum = pgEnum("subscription_plan", [...SUBSCRIPTION_PLANS]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [...SUBSCRIPTION_STATUSES]);
export const featureStatusEnum = pgEnum("feature_status", [...FEATURE_STATUSES]);
export const prdStatusEnum = pgEnum("prd_status", [...PRD_STATUSES]);
export const taskStatusEnum = pgEnum("task_status", [...TASK_STATUSES]);
export const pullRequestStateEnum = pgEnum("pull_request_state", [...PULL_REQUEST_STATES]);
export const reviewAgentTypeEnum = pgEnum("review_agent_type", [...REVIEW_AGENT_TYPES]);
export const reviewSeverityEnum = pgEnum("review_severity", [...REVIEW_SEVERITIES]);
export const reviewStatusEnum = pgEnum("review_status", [...REVIEW_STATUSES]);
export const discoveryRoleEnum = pgEnum("discovery_role", [...DISCOVERY_ROLES]);

// ---------------------------------------------------------------------------
// Core tenancy
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 256 }).notNull(),
  plan: subscriptionPlanEnum("plan").notNull().default("free"),
  aiCreditsUsed: integer("ai_credits_used").notNull().default(0),
  aiCreditsLimit: integer("ai_credits_limit").notNull().default(100),
  repoLimit: integer("repo_limit").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugIdx: uniqueIndex("organizations_slug_idx").on(t.slug),
}));

// Global user identity (BetterAuth owns this table's auth-relevant columns)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 256 }),
  image: text("image"),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
}));

// Many-to-many: a user can belong to multiple orgs with a role per org
export const orgMembers = pgTable("org_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: orgRoleEnum("role").notNull().default("developer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgUserIdx: uniqueIndex("org_members_org_user_idx").on(t.orgId, t.userId),
  orgIdx: index("org_members_org_idx").on(t.orgId),
}));

export const orgInvitations = pgTable("org_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  role: orgRoleEnum("role").notNull().default("developer"),
  invitedByUserId: uuid("invited_by_user_id").notNull().references(() => users.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgEmailIdx: index("org_invitations_org_email_idx").on(t.orgId, t.email),
}));

// ---------------------------------------------------------------------------
// Projects & repositories
// ---------------------------------------------------------------------------

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("projects_org_idx").on(t.orgId),
}));

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  githubRepoId: varchar("github_repo_id", { length: 64 }).notNull(),
  installationId: varchar("installation_id", { length: 64 }).notNull(),
  fullName: varchar("full_name", { length: 512 }).notNull(), // e.g. "org/repo"
  url: text("url").notNull(),
  defaultBranch: varchar("default_branch", { length: 256 }).notNull().default("main"),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectIdx: index("repositories_project_idx").on(t.projectId),
  githubRepoIdIdx: uniqueIndex("repositories_github_repo_id_idx").on(t.githubRepoId),
}));

// ---------------------------------------------------------------------------
// Feature lifecycle: request -> discovery -> PRD -> tasks
// ---------------------------------------------------------------------------

export const featureRequests = pgTable("feature_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description").notNull(),
  sourceChannel: varchar("source_channel", { length: 64 }).notNull().default("manual"), // email, ticket, call, manual
  status: featureStatusEnum("status").notNull().default("new"),
  priority: varchar("priority", { length: 32 }).notNull().default("medium"), // low/medium/high/urgent
  isDuplicateOfFeatureId: uuid("is_duplicate_of_feature_id"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectIdx: index("feature_requests_project_idx").on(t.projectId),
  statusIdx: index("feature_requests_status_idx").on(t.status),
}));

// Discovery Q&A thread between the AI agent and the requester
export const discoveryMessages = pgTable("discovery_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  featureId: uuid("feature_id").notNull().references(() => featureRequests.id, { onDelete: "cascade" }),
  role: discoveryRoleEnum("role").notNull(),
  content: text("content").notNull(),
  authorUserId: uuid("author_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  featureIdx: index("discovery_messages_feature_idx").on(t.featureId),
}));

export const prds = pgTable("prds", {
  id: uuid("id").primaryKey().defaultRandom(),
  featureId: uuid("feature_id").notNull().references(() => featureRequests.id, { onDelete: "cascade" }),
  status: prdStatusEnum("status").notNull().default("draft"),
  problemStatement: text("problem_statement").notNull(),
  goals: jsonb("goals").$type<string[]>().notNull().default([]),
  nonGoals: jsonb("non_goals").$type<string[]>().notNull().default([]),
  userStories: jsonb("user_stories").$type<{ id: string; story: string }[]>().notNull().default([]),
  acceptanceCriteria: jsonb("acceptance_criteria").$type<{ id: string; criterion: string; userStoryId?: string }[]>().notNull().default([]),
  edgeCases: jsonb("edge_cases").$type<string[]>().notNull().default([]),
  successMetrics: jsonb("success_metrics").$type<string[]>().notNull().default([]),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  featureIdx: uniqueIndex("prds_feature_idx").on(t.featureId),
}));

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  prdId: uuid("prd_id").notNull().references(() => prds.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("todo"),
  orderIndex: integer("order_index").notNull().default(0),
  userStoryId: varchar("user_story_id", { length: 64 }), // links back to prd.userStories[].id
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  prdIdx: index("tasks_prd_idx").on(t.prdId),
  prdStatusIdx: index("tasks_prd_status_idx").on(t.prdId, t.status),
}));

// ---------------------------------------------------------------------------
// GitHub: pull requests & AI/manual reviews
// ---------------------------------------------------------------------------

export const pullRequests = pgTable("pull_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  featureId: uuid("feature_id").references(() => featureRequests.id, { onDelete: "set null" }),
  prNumber: integer("pr_number").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  url: text("url").notNull(),
  branch: varchar("branch", { length: 256 }).notNull(),
  headSha: varchar("head_sha", { length: 64 }).notNull(),
  state: pullRequestStateEnum("state").notNull().default("open"),
  mergeStatus: varchar("merge_status", { length: 32 }).notNull().default("unknown"),
  authorGithubLogin: varchar("author_github_login", { length: 256 }),
  lastReviewedSha: varchar("last_reviewed_sha", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  repoIdx: index("pull_requests_repo_idx").on(t.repoId),
  repoPrNumberIdx: uniqueIndex("pull_requests_repo_pr_number_idx").on(t.repoId, t.prNumber),
  featureIdx: index("pull_requests_feature_idx").on(t.featureId),
}));

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  pullRequestId: uuid("pull_request_id").notNull().references(() => pullRequests.id, { onDelete: "cascade" }),
  agentType: reviewAgentTypeEnum("agent_type").notNull(),
  severity: reviewSeverityEnum("severity").notNull(),
  status: reviewStatusEnum("status").notNull().default("open"),
  title: varchar("title", { length: 512 }).notNull(),
  feedback: text("feedback").notNull(),
  filePath: text("file_path"),
  lineNumber: integer("line_number"),
  relatedAcceptanceCriterionId: varchar("related_acceptance_criterion_id", { length: 64 }),
  reviewRunId: uuid("review_run_id").notNull(), // groups all issues from one AI review pass
  resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pullRequestIdx: index("reviews_pull_request_idx").on(t.pullRequestId),
  runIdx: index("reviews_run_idx").on(t.reviewRunId),
  statusIdx: index("reviews_status_idx").on(t.status),
}));

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

export const releases = pgTable("releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  featureId: uuid("feature_id").notNull().references(() => featureRequests.id, { onDelete: "cascade" }),
  approvedByUserId: uuid("approved_by_user_id").notNull().references(() => users.id),
  readinessScore: integer("readiness_score"), // 0-100
  notes: text("notes"),
  releasedAt: timestamp("released_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  featureIdx: uniqueIndex("releases_feature_idx").on(t.featureId),
}));

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  razorpaySubscriptionId: varchar("razorpay_subscription_id", { length: 128 }),
  razorpayCustomerId: varchar("razorpay_customer_id", { length: 128 }),
  plan: subscriptionPlanEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: uniqueIndex("subscriptions_org_idx").on(t.orgId),
}));

// Raw webhook audit log -- used for idempotency (dedupe by externalEventId) and debugging
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: varchar("source", { length: 32 }).notNull(), // "github" | "razorpay"
  externalEventId: varchar("external_event_id", { length: 256 }).notNull(),
  eventType: varchar("event_type", { length: 128 }).notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sourceExternalIdIdx: uniqueIndex("webhook_events_source_external_id_idx").on(t.source, t.externalEventId),
}));

// ---------------------------------------------------------------------------
// Relations (enables type-safe `with: {...}` queries)
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  members: many(orgMembers),
  projects: many(projects),
  subscription: one(subscriptions, {
    fields: [organizations.id],
    references: [subscriptions.orgId],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(orgMembers),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgMembers.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [orgMembers.userId],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id],
  }),
  repositories: many(repositories),
  featureRequests: many(featureRequests),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  project: one(projects, {
    fields: [repositories.projectId],
    references: [projects.id],
  }),
  pullRequests: many(pullRequests),
}));

export const featureRequestsRelations = relations(featureRequests, ({ one, many }) => ({
  project: one(projects, {
    fields: [featureRequests.projectId],
    references: [projects.id],
  }),
  discoveryMessages: many(discoveryMessages),
  prd: one(prds, {
    fields: [featureRequests.id],
    references: [prds.featureId],
  }),
  pullRequests: many(pullRequests),
  release: one(releases, {
    fields: [featureRequests.id],
    references: [releases.featureId],
  }),
}));

export const prdsRelations = relations(prds, ({ one, many }) => ({
  feature: one(featureRequests, {
    fields: [prds.featureId],
    references: [featureRequests.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  prd: one(prds, {
    fields: [tasks.prdId],
    references: [prds.id],
  }),
}));

export const pullRequestsRelations = relations(pullRequests, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [pullRequests.repoId],
    references: [repositories.id],
  }),
  feature: one(featureRequests, {
    fields: [pullRequests.featureId],
    references: [featureRequests.id],
  }),
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  pullRequest: one(pullRequests, {
    fields: [reviews.pullRequestId],
    references: [pullRequests.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.orgId],
    references: [organizations.id],
  }),
}));
