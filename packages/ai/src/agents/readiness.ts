import { type ReleaseReadiness } from "@shipflow/common/schemas";

/**
 * Deliberately NOT an LLM call. A score that gates human release approval
 * needs to be reproducible and auditable -- the same inputs must always
 * produce the same score. The qualitative judgment (is this code actually
 * good) comes from the review agents in ./review.ts; this just turns their
 * structured output into a single number plus a rationale.
 */
export function computeReleaseReadiness(params: {
  blockingCount: number;
  nonBlockingCount: number;
  acceptanceCriteriaCount: number;
  acceptanceCriteriaCoveredCount: number;
  hasTests: boolean;
}): ReleaseReadiness {
  let score = 100;

  // Any blocking issue caps readiness hard -- this mirrors the PRD's rule
  // that only a feature with zero outstanding blocking issues can ship.
  if (params.blockingCount > 0) {
    score = Math.max(0, 40 - params.blockingCount * 10);
  } else {
    score -= params.nonBlockingCount * 5;
  }

  const coverageRatio =
    params.acceptanceCriteriaCount === 0
      ? 1
      : params.acceptanceCriteriaCoveredCount / params.acceptanceCriteriaCount;
  score -= Math.round((1 - coverageRatio) * 30);

  if (!params.hasTests) score -= 10;

  score = Math.max(0, Math.min(100, score));

  const rationaleParts: string[] = [];
  if (params.blockingCount > 0) {
    rationaleParts.push(`${params.blockingCount} blocking issue(s) must be resolved before this can ship.`);
  } else {
    rationaleParts.push("No blocking issues outstanding.");
  }
  if (coverageRatio < 1) {
    rationaleParts.push(
      `${params.acceptanceCriteriaCoveredCount}/${params.acceptanceCriteriaCount} acceptance criteria verified as implemented.`,
    );
  } else if (params.acceptanceCriteriaCount > 0) {
    rationaleParts.push("All acceptance criteria verified as implemented.");
  }
  if (params.nonBlockingCount > 0) {
    rationaleParts.push(`${params.nonBlockingCount} non-blocking issue(s) remain.`);
  }
  if (!params.hasTests) {
    rationaleParts.push("No tests detected in the diff.");
  }

  return {
    score,
    blockingIssueCount: params.blockingCount,
    nonBlockingIssueCount: params.nonBlockingCount,
    rationale: rationaleParts.join(" "),
  };
}
