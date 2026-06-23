import { z } from "zod";

export const createProjectInput = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(2).max(256),
  description: z.string().max(2000).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const updateProjectInput = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2).max(256).optional(),
  description: z.string().max(2000).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectInput>;

export const listProjectsInput = z.object({
  orgId: z.string().uuid(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type ListProjectsInput = z.infer<typeof listProjectsInput>;

export const projectOutput = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ProjectOutput = z.infer<typeof projectOutput>;

// ---- Repository ----

export const connectRepositoryInput = z.object({
  projectId: z.string().uuid(),
  installationId: z.string().min(1),
  githubRepoId: z.string().min(1),
  fullName: z.string().min(1), // "owner/repo"
  url: z.string().url(),
  defaultBranch: z.string().min(1).default("main"),
});
export type ConnectRepositoryInput = z.infer<typeof connectRepositoryInput>;

export const toggleRepositoryInput = z.object({
  repositoryId: z.string().uuid(),
  isActive: z.boolean(),
});
export type ToggleRepositoryInput = z.infer<typeof toggleRepositoryInput>;

export const repositoryOutput = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  githubRepoId: z.string(),
  installationId: z.string(),
  fullName: z.string(),
  url: z.string(),
  defaultBranch: z.string(),
  isActive: z.boolean(),
  lastSyncedAt: z.date().nullable(),
  lastSyncError: z.string().nullable(),
  createdAt: z.date(),
});
export type RepositoryOutput = z.infer<typeof repositoryOutput>;
