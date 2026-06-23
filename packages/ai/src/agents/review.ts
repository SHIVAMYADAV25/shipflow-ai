import { MODELS, runStructuredAgent } from "../client";
import { reviewFindingsSchema, type ReviewFindings, type PrdContent } from "@shipflow/common/schemas";
import type { ChangedFile } from "@shipflow/github";
import { createLogger } from "@shipflow/logger";

const log = createLogger("ai.review");

const ASPECTS = [
  {
    agentType: "ai_requirements" as const,
    instructions: `Check whether the code actually satisfies the PRD's user stories and
acceptance criteria -- not just whether it compiles or looks reasonable. For
every acceptance criterion, explicitly verify the diff implements it; if an
acceptance criterion has NO corresponding code, that is a BLOCKING finding
("missing implementation of <criterion>"), not a style nitpick. Also check
the listed edge cases are handled. Do not flag things the PRD doesn't ask for.`,
  },
  {
    agentType: "ai_security" as const,
    instructions: `Check for security issues: injection (SQL/XSS/command), missing
authorization/ownership checks on data access, secrets committed in code,
unsafe deserialization, missing input validation on user-controlled data,
insecure direct object references. Only flag what's actually visible in
the diff -- do not speculate about code you can't see.`,
  },
  {
    agentType: "ai_performance" as const,
    instructions: `Check for performance issues: N+1 queries, missing indexes implied by new
query patterns, unbounded loops over potentially large collections, missing
pagination on list endpoints, synchronous work that should be async/queued.
Only flag issues clearly visible in the diff.`,
  },
  {
    agentType: "ai_testing" as const,
    instructions: `Check test coverage: does the diff include tests for the new behavior? Is
each acceptance criterion covered by at least one test? Flag missing tests
as non_blocking unless the PRD or org convention implies tests are required
to merge, in which case flag as blocking.`,
  },
];

function buildDiffSection(files: ChangedFile[], truncated: boolean): string {
  const body = files
    .map((f) => `### ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n\`\`\`diff\n${f.patch ?? "(no patch available, e.g. binary file)"}\n\`\`\``)
    .join("\n\n");
  return truncated
    ? `${body}\n\n_(Note: this diff was truncated to the highest-signal files due to size. Mention in any finding's explanation if you suspect relevant code is outside what you can see.)_`
    : body;
}

export async function runCodeReviewAgents(params: {
  prd: PrdContent;
  files: ChangedFile[];
  diffTruncated: boolean;
}): Promise<ReviewFindings> {
  const diffSection = buildDiffSection(params.files, params.diffTruncated);

  const prdSection = `## PRD acceptance criteria
${params.prd.acceptanceCriteria.map((c) => `- [${c.id}] ${c.criterion}`).join("\n")}

## PRD edge cases
${params.prd.edgeCases.map((e) => `- ${e}`).join("\n")}

## User stories
${params.prd.userStories.map((s) => `- [${s.id}] ${s.story}`).join("\n")}`;

  const results = await Promise.allSettled(
    ASPECTS.map(async (aspect) => {
      const system = `You are ShipFlow's Code Review Agent, running the "${aspect.agentType}" pass.
You act as a QA and engineering reviewer evaluating whether this implementation is
actually ready for production against the product requirements -- not merely a
syntax/style checker. Every finding MUST include a clear "explanation" of why it's
an issue; never just flag a line with no reasoning.

${aspect.instructions}

Severity rules: "blocking" = must be fixed before merge (breaks a requirement,
security hole, data loss risk). "non_blocking" = should be fixed but not
merge-blocking (style, minor perf, nice-to-have test). "info" = observation,
no action required. Set every finding's agentType to exactly "${aspect.agentType}".
If you find nothing in this category, return an empty array -- do not invent
issues to have something to say.`;

      const prompt = `${prdSection}\n\n## Code diff\n${diffSection}`;

      const result = await runStructuredAgent({
        agentName: `review.${aspect.agentType}`,
        model: MODELS.review(),
        schema: reviewFindingsSchema,
        system,
        prompt,
      });

      // Defensive: force the correct agentType even if the model mislabels
      // it despite instructions -- grouping/filtering downstream depends on
      // this being accurate, and the enum being schema-valid doesn't
      // guarantee it picked the *right* member.
      return result.object.map((f) => ({ ...f, agentType: aspect.agentType }));
    }),
  );

  const findings: ReviewFindings = [];
  for (const [i, r] of results.entries()) {
    if (r.status === "fulfilled") {
      findings.push(...r.value);
    } else {
      log.error(
        { aspect: ASPECTS[i]?.agentType, reason: r.reason instanceof Error ? r.reason.message : String(r.reason) },
        "one review aspect agent failed -- continuing with the others rather than failing the whole review",
      );
    }
  }

  return findings;
}
