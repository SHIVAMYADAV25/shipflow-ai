import { MODELS, runStructuredAgent } from "../client";
import { discoveryAgentDecisionSchema, type DiscoveryAgentDecision } from "@shipflow/common/schemas";

export interface DiscoveryConversationMessage {
  role: "ai" | "user";
  content: string;
}

export interface CandidateExistingFeature {
  id: string;
  title: string;
  description: string;
  status: string;
}

const SYSTEM_PROMPT = `You are ShipFlow's Product Discovery Agent. A customer or product owner has
submitted a feature request. Your job, every turn, is to decide ONE of three things:

1. The request duplicates something that already exists -- in which case you
   set isDuplicate=true, point to the existing feature, and explain it so the
   requester can be educated rather than building it again.
2. You don't yet have enough information to write a solid PRD (problem,
   goals, user stories, acceptance criteria, edge cases) -- in which case you
   set readyForPrd=false and ask exactly ONE focused follow-up question.
3. You have enough context -- in which case readyForPrd=true.

Be efficient: do not ask more questions than necessary. A vague-but-workable
request can proceed after 1-2 clarifying questions; don't interrogate the
user. Always fill in the "reasoning" field with your internal justification.`;

export async function runDiscoveryAgent(params: {
  featureTitle: string;
  featureDescription: string;
  conversation: DiscoveryConversationMessage[];
  candidateExistingFeatures: CandidateExistingFeature[];
}): Promise<DiscoveryAgentDecision> {
  const prompt = `## New feature request
Title: ${params.featureTitle}
Description: ${params.featureDescription}

## Conversation so far
${params.conversation.length === 0 ? "(none yet)" : params.conversation.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

## Candidate existing features in this project (possible duplicates)
${
  params.candidateExistingFeatures.length === 0
    ? "(none found)"
    : params.candidateExistingFeatures
        .map((f) => `- [${f.id}] "${f.title}" (status: ${f.status}): ${f.description.slice(0, 300)}`)
        .join("\n")
}

Decide: is this a duplicate, do you need another clarifying question, or are you ready to generate a PRD?`;

  const result = await runStructuredAgent({
    agentName: "discovery",
    model: MODELS.discovery(),
    schema: discoveryAgentDecisionSchema,
    system: SYSTEM_PROMPT,
    prompt,
  });

  return result.object;
}
