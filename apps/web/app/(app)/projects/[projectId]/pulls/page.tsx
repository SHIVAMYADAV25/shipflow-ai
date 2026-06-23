"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Card, CardBody, SectionHeading, SeverityBadge, StatusBadge, Spinner, EmptyState, Button } from "@/components/ui";

export default function PullRequestsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const prs = trpc.github.listPullRequests.useQuery({ projectId, limit: 30 }, { refetchInterval: 15_000 });
  const triggerReview = trpc.review.trigger.useMutation({ onSuccess: () => prs.refetch() });

  if (prs.isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Pull Request Reviews" subtitle="AI reviews run automatically on every PR linked to a feature." />

      {prs.data?.length === 0 ? (
        <EmptyState icon="🔀" title="No pull requests yet" description="Open a PR on a connected GitHub repository to start AI-powered reviews." />
      ) : (
        <div className="flex flex-col gap-4">
          {prs.data?.map((pr: any) => (
            <Card key={pr.id}>
              <CardBody className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <a href={pr.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent">
                      #{pr.prNumber} {pr.title}
                    </a>
                    <StatusBadge status={pr.state} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink/50">{pr.branch} · {pr.headSha.slice(0, 7)}</p>
                  {pr.reviews && pr.reviews.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {["blocking", "non_blocking"].map((sev) => {
                        const count = pr.reviews.filter((r: any) => r.severity === sev && r.status === "open").length;
                        if (!count) return null;
                        return <SeverityBadge key={sev} severity={sev} />;
                      })}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => triggerReview.mutate({ pullRequestId: pr.id })}
                    loading={triggerReview.isPending}
                  >
                    Re-run AI review
                  </Button>
                  <Link href={`/app/projects/${projectId}/reviews?prId=${pr.id}`} className="text-xs text-accent underline">
                    View issues →
                  </Link>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
