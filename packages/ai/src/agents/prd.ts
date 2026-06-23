import { MODELS, runStructuredAgent } from "../client";
import { prdContentSchema, type PrdContent } from "@shipflow/common/schemas";
import type { DiscoveryConversationMessage } from "./discovery";

const SYSTEM_PROMPT = `You are ShipFlow's PRD Generator Agent. Write a Product Requirements
Document grounded ONLY in the feature request and the clarifying conversation provided --
never invent goals, metrics, or constraints the user didn't state or clearly imply.

Requirements for the output:
- problemStatement: 2-4 sentences, concrete, no marketing language.
- goals: what success looks like, as outcomes (not implementation details).
- nonGoals: explicitly out of scope -- this prevents scope creep later.
- userStories: "As a <role>, I want <capability>, so that <benefit>" format.
  Give each a short id like "us-1".
- acceptanceCriteria: testable, specific conditions. Give each a short id
  like "ac-1" and link it to a userStoryId where applicable -- these are what
  the AI Code Review Agent will later check the implementation against, so
  vague criteria here directly cause unreliable reviews downstream.
- edgeCases: things that could go wrong or unusual inputs/states to handle.
- successMetrics: how the team will know this shipped feature is working.`;

export async function runPrdGeneratorAgent(params: {
  featureTitle: string;
  featureDescription: string;
  conversation: DiscoveryConversationMessage[];
}): Promise<PrdContent> {
  const prompt = `## Feature request
Title: ${params.featureTitle}
Description: ${params.featureDescription}

## Clarifying conversation
${params.conversation.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

Generate the full PRD now.`;

  const result = await runStructuredAgent({
    agentName: "prd-generator",
    model: MODELS.prd(),
    schema: prdContentSchema,
    system: SYSTEM_PROMPT,
    prompt,
  });

  return result.object;
}
