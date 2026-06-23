import type { Octokit } from "@octokit/rest";
import { createLogger } from "@shipflow/logger";
import type { ReviewFindings } from "@shipflow/common/schemas";

const log = createLogger("github.comments");

function severityEmoji(severity: string) {
  if (severity === "blocking") return "\u{1F6D1}"; // stop sign
  if (severity === "non_blocking") return "\u{26A0}\u{FE0F}"; // warning
  return "\u{2139}\u{FE0F}"; // info
}

/**
 * Posts the AI review as a single GitHub PR review: a summary comment plus
 * one inline comment per finding that has a file/line we can anchor to.
 * Findings without a filePath/lineNumber (e.g. "missing acceptance
 * criterion: email verification" with no single line responsible) are
 * folded into the summary instead, since GitHub rejects review comments
 * that don't map to a line in the diff.
 */
export async function postAiReviewToGithub(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    commitSha: string;
    findings: ReviewFindings;
    blockingCount: number;
    nonBlockingCount: number;
  },
) {
  const { owner, repo, pullNumber, commitSha, findings } = params;

  const inline = findings.filter((f) => f.filePath && f.lineNumber);
  const general = findings.filter((f) => !f.filePath || !f.lineNumber);

  const summaryLines = [
    `## ShipFlow AI Review`,
    ``,
    `**${params.blockingCount} blocking**, **${params.nonBlockingCount} non-blocking** issue(s) found against the PRD's acceptance criteria, security, performance, and test coverage.`,
    ``,
    ...general.map((f) => `- ${severityEmoji(f.severity)} **${f.title}** (${f.agentType}): ${f.explanation}`),
  ];

  try {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitSha,
      event: params.blockingCount > 0 ? "REQUEST_CHANGES" : "COMMENT",
      body: summaryLines.join("\n"),
      comments: inline.map((f) => ({
        path: f.filePath as string,
        line: f.lineNumber as number,
        body: `${severityEmoji(f.severity)} **${f.title}** (${f.agentType}, ${f.severity})\n\n${f.explanation}`,
      })),
    });
    log.info({ owner, repo, pullNumber, findingCount: findings.length }, "posted AI review to GitHub");
  } catch (err) {
    // GitHub rejects the whole review if any inline comment's line isn't
    // part of the diff (e.g. unchanged context line). Fall back to a
    // summary-only comment so the review is never silently lost.
    log.warn(
      { owner, repo, pullNumber, err: err instanceof Error ? err.message : String(err) },
      "createReview failed (likely a stale inline anchor) -- falling back to a plain issue comment",
    );
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: [
        ...summaryLines,
        ``,
        `_(Inline comments could not be anchored to the diff and are summarized below.)_`,
        ...inline.map(
          (f) => `- ${severityEmoji(f.severity)} \`${f.filePath}:${f.lineNumber}\` **${f.title}**: ${f.explanation}`,
        ),
      ].join("\n"),
    });
  }
}
