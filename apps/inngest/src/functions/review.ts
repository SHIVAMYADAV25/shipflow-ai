import { eq } from "drizzle-orm";
import { db, pullRequests, repositories, prds, reviews } from "@shipflow/db";
import { inngest } from "@shipflow/inngest";
import { getInstallationOctokit, fetchPullRequestDiffContext, postAiReviewToGithub } from "@shipflow/github";
import { runCodeReviewAgents, computeReleaseReadiness, type PrdContent } from "@shipflow/ai";
import { createLogger } from "@shipflow/logger";

const log = createLogger("inngest.review");

export const prReviewWorkflow = inngest.createFunction(
  { id: "pr-review", retries: 3, concurrency: { limit: 5 } },
  [{ event: "github/pull_request.opened" }, { event: "github/pull_request.synchronized" }],
  async ({ event, step }) => {
    const { pullRequestId } = event.data;

    const pr = await step.run("load-pull-request", async () => {
      const row = await db.query.pullRequests.findFirst({ where: eq(pullRequests.id, pullRequestId) });
      if (!row) throw new Error(`pull request ${pullRequestId} not found`);
      return row;
    });

    if (pr.lastReviewedSha === pr.headSha) {
      log.info({ pullRequestId, sha: pr.headSha }, "this commit was already reviewed -- skipping");
      return { outcome: "already_reviewed" as const };
    }

    if (!pr.featureId) {
      log.warn(
        { pullRequestId },
        "PR is not linked to a feature request -- nothing to review against, skipping AI review",
      );
      return { outcome: "unlinked" as const };
    }

    const { repo, prdRow } = await step.run("load-repo-and-prd", async () => {
      const repoRow = await db.query.repositories.findFirst({ where: eq(repositories.id, pr.repoId) });
      if (!repoRow) throw new Error(`repository ${pr.repoId} not found`);
      const prd = await db.query.prds.findFirst({ where: eq(prds.featureId, pr.featureId as string) });
      return { repo: repoRow, prdRow: prd ?? null };
    });

    if (!prdRow) {
      log.warn({ pullRequestId, featureId: pr.featureId }, "linked feature has no approved PRD yet -- skipping");
      return { outcome: "no_prd" as const };
    }

    const [owner, repoName] = repo.fullName.split("/");
    if (!owner || !repoName) throw new Error(`malformed repository full_name: ${repo.fullName}`);

    const diffContext = await step.run("fetch-diff", async () => {
      const octokit = await getInstallationOctokit(repo.installationId);
      return fetchPullRequestDiffContext(octokit, owner, repoName, pr.prNumber);
    });

    if (diffContext.files.length === 0) {
      log.info({ pullRequestId }, "no reviewable files in diff (all filtered: lockfiles/binaries/etc)");
      return { outcome: "nothing_to_review" as const };
    }

    const prdContent: PrdContent = {
      problemStatement: prdRow.problemStatement,
      goals: prdRow.goals,
      nonGoals: prdRow.nonGoals,
      userStories: prdRow.userStories,
      acceptanceCriteria: prdRow.acceptanceCriteria,
      edgeCases: prdRow.edgeCases,
      successMetrics: prdRow.successMetrics,
    };

    const findings = await step.run("run-review-agents", () =>
      runCodeReviewAgents({ prd: prdContent, files: diffContext.files, diffTruncated: diffContext.truncated }),
    );

    const blockingCount = findings.filter((f) => f.severity === "blocking").length;
    const nonBlockingCount = findings.filter((f) => f.severity === "non_blocking").length;

    const reviewRunId = await step.run("persist-findings", async () => {
      const runId = crypto.randomUUID();
      if (findings.length > 0) {
        await db.insert(reviews).values(
          findings.map((f) => ({
            pullRequestId: pr.id,
            agentType: f.agentType,
            severity: f.severity,
            title: f.title,
            feedback: f.explanation,
            filePath: f.filePath,
            lineNumber: f.lineNumber,
            relatedAcceptanceCriterionId: f.relatedAcceptanceCriterionId,
            reviewRunId: runId,
          })),
        );
      }
      await db
        .update(pullRequests)
        .set({
          lastReviewedSha: pr.headSha,
          state: blockingCount > 0 ? "changes_requested" : "open",
          updatedAt: new Date(),
        })
        .where(eq(pullRequests.id, pr.id));
      return runId;
    });

    await step.run("post-review-to-github", async () => {
      const octokit = await getInstallationOctokit(repo.installationId);
      await postAiReviewToGithub(octokit, {
        owner,
        repo: repoName,
        pullNumber: pr.prNumber,
        commitSha: pr.headSha,
        findings,
        blockingCount,
        nonBlockingCount,
      });
    });

    const coveredCriteriaIds = new Set(prdContent.acceptanceCriteria.map((c) => c.id));
    for (const f of findings) {
      if (f.agentType === "ai_requirements" && f.severity === "blocking" && f.relatedAcceptanceCriterionId) {
        coveredCriteriaIds.delete(f.relatedAcceptanceCriterionId);
      }
    }
    const readiness = computeReleaseReadiness({
      blockingCount,
      nonBlockingCount,
      acceptanceCriteriaCount: prdContent.acceptanceCriteria.length,
      acceptanceCriteriaCoveredCount: coveredCriteriaIds.size,
      hasTests: diffContext.files.some((f) => /\.(test|spec)\.[jt]sx?$/.test(f.filename)),
    });

    log.info(
      { pullRequestId, reviewRunId, blockingCount, nonBlockingCount, readinessScore: readiness.score },
      "PR review complete",
    );

    return { outcome: "reviewed" as const, reviewRunId, blockingCount, nonBlockingCount, readiness };
  },
);
