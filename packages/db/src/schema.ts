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
// BetterAuth identity tables
//
// DESIGN NOTE: BetterAuth requires its tables to be named exactly "user",
// "session", "account", and "verification" (singular, lowercase) and the
// "user.id" column must be text (it generates nanoid/cuid values, not UUIDs).
//
// We keep these here -- not in a separate auth-schema.ts -- so that
// drizzle.config.ts has a single schema entry point and drizzle-kit generates
// one coherent migration that covers both BetterAuth tables and our SaaS
// tables.  All ShipFlow FK columns that reference a user use text("...") to
// match BetterAuth's id type.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => ({
    userIdIdx: index("session_user_id_idx").on(t.userId),
  }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdIdx: index("account_user_id_idx").on(t.userId),
  }),
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    identifierIdx: index("verification_identifier_idx").on(t.identifier),
  }),
);

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

// Many-to-many: a user can belong to multiple orgs with a role per org.
// userId is text to match BetterAuth's user.id type.
export const orgMembers = pgTable("org_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
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
  invitedByUserId: text("invited_by_user_id").notNull().references(() => user.id),
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
  createdByUserId: text("created_by_user_id").notNull().references(() => user.id),
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
  fullName: varchar("full_name", { length: 512 }).notNull(),
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
  sourceChannel: varchar("source_channel", { length: 64 }).notNull().default("manual"),
  status: featureStatusEnum("status").notNull().default("new"),
  priority: varchar("priority", { length: 32 }).notNull().default("medium"),
  isDuplicateOfFeatureId: uuid("is_duplicate_of_feature_id"),
  createdByUserId: text("created_by_user_id").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectIdx: index("feature_requests_project_idx").on(t.projectId),
  statusIdx: index("feature_requests_status_idx").on(t.status),
}));

export const discoveryMessages = pgTable("discovery_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  featureId: uuid("feature_id").notNull().references(() => featureRequests.id, { onDelete: "cascade" }),
  role: discoveryRoleEnum("role").notNull(),
  content: text("content").notNull(),
  authorUserId: text("author_user_id").references(() => user.id),
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
  approvedByUserId: text("approved_by_user_id").references(() => user.id),
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
  userStoryId: varchar("user_story_id", { length: 64 }),
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
  reviewRunId: uuid("review_run_id").notNull(),
  resolvedByUserId: text("resolved_by_user_id").references(() => user.id),
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
  approvedByUserId: text("approved_by_user_id").notNull().references(() => user.id),
  readinessScore: integer("readiness_score"),
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

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: varchar("source", { length: 32 }).notNull(),
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
// Relations
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(orgMembers),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  members: many(orgMembers),
  projects: many(projects),
  subscription: one(subscriptions, {
    fields: [organizations.id],
    references: [subscriptions.orgId],
  }),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgMembers.orgId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [orgMembers.userId],
    references: [user.id],
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
  prd: one(prds, { fields: [tasks.prdId], references: [prds.id] }),
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