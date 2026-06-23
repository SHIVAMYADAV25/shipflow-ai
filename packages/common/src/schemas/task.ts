import { z } from "zod";
import { TASK_STATUSES } from "../enums";

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const generateTasksInput = z.object({
  prdId: z.string().uuid(),
});
export type GenerateTasksInput = z.infer<typeof generateTasksInput>;

/** Structured output the Task Splitter agent must return per user story. */
export const generatedTaskSchema = z.object({
  title: z.string().min(3).max(512),
  description: z.string().min(5).optional(),
  userStoryId: z.string().optional(),
});
export const generatedTasksSchema = z.array(generatedTaskSchema).min(1);
export type GeneratedTasks = z.infer<typeof generatedTasksSchema>;

export const createTaskInput = z.object({
  prdId: z.string().uuid(),
  title: z.string().min(3).max(512),
  description: z.string().max(5000).optional(),
  userStoryId: z.string().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

export const updateTaskInput = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(3).max(512).optional(),
  description: z.string().max(5000).optional(),
  status: taskStatusSchema.optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

/** Drag-and-drop reorder / column move on the Kanban board. */
export const moveTaskInput = z.object({
  taskId: z.string().uuid(),
  status: taskStatusSchema,
  orderIndex: z.number().int().min(0),
});
export type MoveTaskInput = z.infer<typeof moveTaskInput>;

export const taskOutput = z.object({
  id: z.string().uuid(),
  prdId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  orderIndex: z.number().int(),
  userStoryId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TaskOutput = z.infer<typeof taskOutput>;
