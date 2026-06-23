"use client";
import { useParams, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Card, CardBody, CardHeader, SectionHeading, SeverityBadge, Spinner, EmptyState, Button } from "@/components/ui";

export default function ReviewsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const prId = searchParams.get("prId");

  const history = trpc.review.listByProject.useQuery({ projectId, limit: 50 }, { enabled: !prId, refetchInterval: 10_000 });
  const prReviews = trpc.review.listByPullRequest.useQuery({ pullRequestId: prId! }, { enabled: !!prId, refetchInterval: 10_000 });
  const resolveIssue = trpc.review.resolve.useMutation({
    onSuccess: () => { history.refetch(); prReviews.refetch(); },
  });

  const loading = history.isLoading || prReviews.isLoading;
  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  // When showing a single PR's reviews (linked from the PR list)
  if (prId) {
    const issues = prReviews.data ?? [];
    return (
      <div className="flex flex-col gap-6">
        <SectionHeading title="Review Issues" subtitle={`${issues.filter((i) => i.status === "open").length} open · ${issues.length} total`} />
        {issues.length === 0 ? (
          <EmptyState icon="✅" title="No issues found" description="The AI review found nothing to flag on this PR." />
        ) : (
          <IssueList issues={issues} onResolve={(id, status) => resolveIssue.mutate({ reviewId: id, status })} isPending={resolveIssue.isPending} />
        )}
      </div>
    );
  }

  // Project-wide review history
  const prs = history.data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Review History" subtitle="All AI review runs across every pull request in this project." />
      {prs.length === 0 ? (
        <EmptyState icon="📜" title="No review history yet" description="Review results will appear here after AI reviews run on connected PRs." />
      ) : (
        prs.map((pr: any) => (
          <Card key={pr.id}>
            <CardHeader className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink">#{pr.prNumber} {pr.title}</p>
                <p className="mt-0.5 font-mono text-xs text-ink/40">{pr.branch} · {pr.headSha?.slice(0, 7)}</p>
              </div>
              <a href={pr.url} target="_blank" rel="noreferrer" className="text-xs text-accent underline">Open on GitHub ↗</a>
            </CardHeader>
            {pr.reviews?.length > 0 ? (
              <IssueList
                issues={pr.reviews}
                onResolve={(id, status) => resolveIssue.mutate({ reviewId: id, status })}
                isPending={resolveIssue.isPending}
              />
            ) : (
              <CardBody><p className="text-sm text-ink/50">No issues found in this PR.</p></CardBody>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

function IssueList({ issues, onResolve, isPending }: {
  issues: any[];
  onResolve: (id: string, status: "resolved" | "dismissed") => void;
  isPending: boolean;
}) {
  return (
    <div className="divide-y divide-ink/5">
      {issues.map((issue) => (
        <div key={issue.id} className={`px-5 py-4 ${issue.status !== "open" ? "opacity-50" : ""}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={issue.severity} />
                <span className="truncate text-sm font-medium text-ink">{issue.title}</span>
                <span className="shrink-0 rounded bg-ink/8 px-1.5 py-0.5 font-mono text-xs text-ink/50">{issue.agentType}</span>
              </div>
              <p className="mt-1.5 text-sm text-ink/70">{issue.feedback}</p>
              {issue.filePath && (
                <p className="mt-1 font-mono text-xs text-ink/40">
                  {issue.filePath}{issue.lineNumber ? `:${issue.lineNumber}` : ""}
                </p>
              )}
            </div>
            {issue.status === "open" && (
              <div className="flex shrink-0 gap-1.5">
                <Button variant="secondary" onClick={() => onResolve(issue.id, "resolved")} loading={isPending}>Resolved</Button>
                <Button variant="ghost" onClick={() => onResolve(issue.id, "dismissed")} loading={isPending}>Dismiss</Button>
              </div>
            )}
            {issue.status !== "open" && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{issue.status}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
