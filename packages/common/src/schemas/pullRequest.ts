import { z } from "zod";
import { PULL_REQUEST_STATES } from "../enums";

export const pullRequestStateSchema = z.enum(PULL_REQUEST_STATES);

export const linkPullRequestToFeatureInput = z.object({
  pullRequestId: z.string().uuid(),
  featureId: z.string().uuid(),
});
export type LinkPullRequestToFeatureInput = z.infer<typeof linkPullRequestToFeatureInput>;

export const listPullRequestsInput = z.object({
  projectId: z.string().uuid(),
  state: pullRequestStateSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type ListPullRequestsInput = z.infer<typeof listPullRequestsInput>;

export const pullRequestOutput = z.object({
  id: z.string().uuid(),
  repoId: z.string().uuid(),
  featureId: z.string().uuid().nullable(),
  prNumber: z.number().int(),
  title: z.string(),
  url: z.string(),
  branch: z.string(),
  headSha: z.string(),
  state: pullRequestStateSchema,
  mergeStatus: z.string(),
  authorGithubLogin: z.string().nullable(),
  lastReviewedSha: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PullRequestOutput = z.infer<typeof pullRequestOutput>;

/**
 * Minimal, *validated* slice of the GitHub `pull_request` webhook payload we
 * actually trust and persist. We never store/forward the full raw payload
 * into business logic -- only this parsed subset -- so a malformed or
 * unexpected GitHub payload fails fast instead of silently corrupting data.
 */
export const githubPullRequestWebhookSchema = z.object({
  action: z.enum([
    "opened",
    "synchronize",
    "reopened",
    "closed",
    "edited",
    "ready_for_review",
  ]),
  number: z.number().int(),
  repository: z.object({
    id: z.number(),
    full_name: z.string(),
  }),
  installation: z.object({
    id: z.number(),
  }),
  pull_request: z.object({
    title: z.string(),
    html_url: z.string().url(),
    head: z.object({
      ref: z.string(),
      sha: z.string(),
    }),
    base: z.object({
      ref: z.string(),
    }),
    user: z.object({
      login: z.string(),
    }),
    draft: z.boolean(),
    merged: z.boolean(),
    state: z.enum(["open", "closed"]),
  }),
});
export type GithubPullRequestWebhookPayload = z.infer<typeof githubPullRequestWebhookSchema>;

export const githubPushWebhookSchema = z.object({
  ref: z.string(),
  after: z.string(),
  repository: z.object({
    id: z.number(),
    full_name: z.string(),
  }),
  installation: z.object({
    id: z.number(),
  }),
});
export type GithubPushWebhookPayload = z.infer<typeof githubPushWebhookSchema>;
