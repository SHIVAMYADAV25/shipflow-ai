import type { Octokit } from "@octokit/rest";
import { createLogger } from "@shipflow/logger";

const log = createLogger("github.diff");

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PullRequestDiffContext {
  files: ChangedFile[];
  truncated: boolean;
  totalFiles: number;
}

// Keep the combined diff well under typical LLM context limits. If a PR is
// bigger than this, we still review it -- just on the highest-signal files
// first (largest diffs, excluding lockfiles/generated assets) -- and the
// review explicitly notes it was a partial review.
const MAX_DIFF_CHARS = 60_000;
const IGNORED_FILE_PATTERNS = [/package-lock\.json$/, /pnpm-lock\.yaml$/, /yarn\.lock$/, /\.min\.js$/, /dist\//, /\.snap$/];

export async function fetchPullRequestDiffContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PullRequestDiffContext> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  const relevant = files.filter((f) => !IGNORED_FILE_PATTERNS.some((re) => re.test(f.filename)));

  let runningChars = 0;
  let truncated = relevant.length < files.length;
  const included: ChangedFile[] = [];

  // Largest diffs first -- a few fully-reviewed substantial files beat many
  // truncated ones for review quality.
  const sorted = [...relevant].sort(
    (a, b) => b.additions + b.deletions - (a.additions + a.deletions),
  );

  for (const f of sorted) {
    const patchLength = f.patch?.length ?? 0;
    if (runningChars + patchLength > MAX_DIFF_CHARS) {
      truncated = true;
      continue;
    }
    runningChars += patchLength;
    included.push({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    });
  }

  if (truncated) {
    log.warn(
      { owner, repo, pullNumber, totalFiles: files.length, includedFiles: included.length },
      "PR diff truncated for review -- exceeded max diff size",
    );
  }

  return { files: included, truncated, totalFiles: files.length };
}

export async function fetchPullRequestMeta(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
) {
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
  return data;
}
