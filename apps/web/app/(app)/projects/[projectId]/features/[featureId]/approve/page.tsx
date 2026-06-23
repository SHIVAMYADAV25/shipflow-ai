"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button, Card, CardBody, CardHeader, SectionHeading, SeverityBadge, StatusBadge, Spinner, EmptyState } from "@/components/ui";

export default function ApprovePage() {
  const { projectId, featureId } = useParams<{ projectId: string; featureId: string }>();
  const router = useRouter();
  const [notes, setNotes] = useState("");

  const feature = trpc.feature.get.useQuery({ featureId }, { refetchInterval: 8000 });
  const readiness = trpc.release.getReadiness.useQuery({ featureId }, { refetchInterval: 8000 });
  const approveMutation = trpc.release.approve.useMutation({ onSuccess: () => feature.refetch() });
  const shipMutation = trpc.release.ship.useMutation({
    onSuccess: () => { feature.refetch(); router.push(`/app/projects/${projectId}/features`); },
  });

  if (feature.isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  const f = feature.data;
  if (!f) return <p className="text-ink/60">Feature not found.</p>;

  const r = readiness.data;
  const canApprove = r && r.blockingIssueCount === 0 && f.status !== "shipped";
  const isApproved = f.status === "approval";

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Final Approval & Release"
        subtitle="Human reviewer verifies all requirements before shipping."
        action={<StatusBadge status={f.status} />}
      />

      {/* Readiness score */}
      {r && (
        <Card>
          <CardHeader><h3 className="text-sm font-medium text-ink">Release Readiness</h3></CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0">
                <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none"
                    stroke={r.score >= 80 ? "#10b981" : r.score >= 50 ? "#f59e0b" : "#ef4444"}
                    strokeWidth="3"
                    strokeDasharray={`${r.score} ${100 - r.score}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-ink">{r.score}</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-ink/70">{r.rationale}</p>
                <div className="mt-2 flex gap-3 text-xs">
                  <span className="text-red-600">🛑 {r.blockingIssueCount} blocking</span>
                  <span className="text-amber-600">⚠️ {r.nonBlockingIssueCount} non-blocking</span>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* PRD summary */}
      {f.prd && (
        <Card>
          <CardHeader><h3 className="text-sm font-medium text-ink">PRD Summary</h3></CardHeader>
          <CardBody className="text-sm text-ink/70">
            <p className="font-medium text-ink">{f.title}</p>
            <p className="mt-1">{f.prd.problemStatement}</p>
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink/40">Acceptance Criteria ({f.prd.acceptanceCriteria.length})</p>
              <ul className="ml-4 list-disc space-y-0.5">
                {f.prd.acceptanceCriteria.map((c) => (
                  <li key={c.id}>[{c.id}] {c.criterion}</li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Approval action */}
      {!isApproved && (
        <Card>
          <CardHeader><h3 className="text-sm font-medium text-ink">Approve for Release</h3></CardHeader>
          <CardBody className="flex flex-col gap-3">
            {!canApprove && r && r.blockingIssueCount > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                🛑 {r.blockingIssueCount} blocking issue(s) must be resolved before this can ship.
                Go to the PR Reviews page, resolve them, then return here.
              </div>
            )}
            <textarea
              placeholder="Release notes (optional)…"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-ink/15 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            {approveMutation.error && <p className="text-xs text-red-600">{approveMutation.error.message}</p>}
            <Button
              disabled={!canApprove}
              loading={approveMutation.isPending}
              onClick={() => approveMutation.mutate({ featureId, notes })}
            >
              Approve Release
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Ship button -- only after approval */}
      {isApproved && (
        <Card>
          <CardHeader><h3 className="text-sm font-medium text-accent">Ready to Ship ✓</h3></CardHeader>
          <CardBody className="flex flex-col gap-3">
            <p className="text-sm text-ink/70">Release has been approved. Click Ship to mark this feature as fully delivered.</p>
            {shipMutation.error && <p className="text-xs text-red-600">{shipMutation.error.message}</p>}
            <Button loading={shipMutation.isPending} onClick={() => shipMutation.mutate({ featureId })}>
              🚀 Ship Feature
            </Button>
          </CardBody>
        </Card>
      )}

      {f.status === "shipped" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
          <p className="text-2xl">🎉</p>
          <p className="mt-2 text-lg font-semibold text-emerald-800">Feature Shipped!</p>
          <p className="mt-1 text-sm text-emerald-700">{f.title} has been delivered to production.</p>
        </div>
      )}
    </div>
  );
}
