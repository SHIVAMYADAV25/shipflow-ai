import { MODELS, runStructuredAgent } from "../client";
import { generatedTasksSchema, type GeneratedTasks, type PrdContent } from "@shipflow/common/schemas";

const SYSTEM_PROMPT = `You are ShipFlow's Task Splitter Agent. Break an approved PRD into concrete,
independently-implementable engineering tasks for a Kanban board.

Rules:
- Every user story must be covered by at least one task; link each task to
  its userStoryId.
- Tasks should be scoped to roughly 0.5-2 days of engineering work each --
  split anything bigger, merge anything trivially small.
- Include tasks for things engineers commonly forget but the PRD implies:
  tests for each acceptance criterion, error/edge-case handling listed in
  edgeCases, and any migration/infra work implied by the user stories.
- Do not invent work outside what the PRD's goals and user stories justify.`;

export async function runTaskSplitterAgent(prd: PrdContent): Promise<GeneratedTasks> {
  const prompt = `## PRD

Problem statement: ${prd.problemStatement}

Goals:
${prd.goals.map((g) => `- ${g}`).join("\n")}

Non-goals:
${prd.nonGoals.map((g) => `- ${g}`).join("\n")}

User stories:
${prd.userStories.map((s) => `- [${s.id}] ${s.story}`).join("\n")}

Acceptance criteria:
${prd.acceptanceCriteria.map((c) => `- [${c.id}] (${c.userStoryId ?? "general"}) ${c.criterion}`).join("\n")}

Edge cases:
${prd.edgeCases.map((e) => `- ${e}`).join("\n")}

Break this into engineering tasks now.`;

  const result = await runStructuredAgent({
    agentName: "task-splitter",
    model: MODELS.prd(), // same tier as PRD generation; not worth a separate model config
    schema: generatedTasksSchema,
    system: SYSTEM_PROMPT,
    prompt,
  });

  return result.object;
}
