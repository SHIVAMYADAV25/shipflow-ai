"use client";
import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { WorkflowProgressBanner, deriveWorkflowStage } from "@/components/features/WorkflowProgress";
import { StatusBadge } from "@/components/ui";

export default function FeatureDetailPage() {
  const { projectId, featureId } = useParams<{ projectId: string; featureId: string }>();
  const router = useRouter();
  const [reply, setReply] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const feature = trpc.feature.get.useQuery(
    { featureId },
    { refetchInterval: (q) => ["new","discovery","planning"].includes(q.state.data?.status ?? "") ? 3000 : 8000 }
  );
  const replyMutation = trpc.feature.replyToDiscovery.useMutation({
    onSuccess: () => { setReply(""); feature.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const triggerPrd = trpc.feature.triggerPrdGeneration.useMutation({
    onSuccess: () => { toast.success("PRD generation queued!"); feature.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [feature.data?.discoveryMessages?.length]);

  if (feature.isLoading) return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
  if (!feature.data) return <p className="text-ink/60">Feature request not found.</p>;

  const f = feature.data;
  const inDiscovery = ["new","discovery"].includes(f.status);
  const stage = deriveWorkflowStage(f.status);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{f.title}</h1>
          <p className="mt-1 text-sm text-ink/60 line-clamp-2">{f.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={f.status} />
        </div>
      </div>

      {/* Workflow progress banner */}
      {stage !== "idle" && <WorkflowProgressBanner stage={stage} />}

      {/* Quick nav */}
      <div className="flex flex-wrap gap-2">
        {f.prd && (
          <Link href={`/app/projects/${projectId}/features/${featureId}/prd`}>
            <Button size="sm" variant="outline">📋 Edit PRD</Button>
          </Link>
        )}
        {f.prd?.status === "approved" && (
          <Link href={`/app/projects/${projectId}/features/${featureId}/plan`}>
            <Button size="sm" variant="outline">✅ Task Board</Button>
          </Link>
        )}
        {["review","approval"].includes(f.status) && (
          <Link href={`/app/projects/${projectId}/pulls`}>
            <Button size="sm" variant="outline">🔀 PR Reviews</Button>
          </Link>
        )}
        {f.status === "approval" && (
          <Link href={`/app/projects/${projectId}/features/${featureId}/approve`}>
            <Button size="sm">🚀 Approve & Ship →</Button>
          </Link>
        )}
      </div>

      {/* Discovery Q&A */}
      {(inDiscovery || (f.discoveryMessages?.length ?? 0) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              🤖 AI Discovery Agent
              {inDiscovery && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(f.discoveryMessages ?? []).map((msg: any) => (
              <div key={msg.id} className={`flex ${msg.role === "ai" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "ai" ? "bg-ink/5 text-ink" : "bg-accent text-white"}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {inDiscovery && (f.discoveryMessages ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-ink/50">Analyzing your request…</p>
            )}
            <div ref={messagesEndRef} />

            {inDiscovery && (
              <form onSubmit={(e) => { e.preventDefault(); if (reply.trim()) replyMutation.mutate({ featureId, content: reply }); }}
                className="mt-2 flex gap-2">
                <input value={reply} onChange={(e) => setReply(e.target.value)}
                  placeholder="Answer the AI's question…"
                  className="flex-1 rounded-md border border-ink/15 bg-paper/50 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
                <Button type="submit" disabled={!reply.trim() || replyMutation.isPending}>
                  {replyMutation.isPending ? "Sending…" : "Send"}
                </Button>
              </form>
            )}
            {inDiscovery && (
              <p className="text-center text-xs text-ink/40">
                Or{" "}
                <button className="text-accent underline" onClick={() => triggerPrd.mutate({ featureId })} disabled={triggerPrd.isPending}>
                  skip to PRD generation
                </button>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* PRD Summary (read-only preview -- full edit via PRD Editor) */}
      {f.prd && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Product Requirements Document</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={f.prd.status === "approved" ? "success" : "warning"} className="capitalize">{f.prd.status}</Badge>
              <Link href={`/app/projects/${projectId}/features/${featureId}/prd`}>
                <Button size="sm" variant="outline">Edit PRD →</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-ink/70">{f.prd.problemStatement}</p>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink/40">Goals</p>
              <ul className="ml-4 list-disc space-y-0.5 text-ink/70">
                {f.prd.goals?.map((g: string, i: number) => <li key={i}>{g}</li>)}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink/40">
                Acceptance Criteria ({f.prd.acceptanceCriteria?.length ?? 0})
              </p>
              <ul className="ml-4 list-disc space-y-0.5 text-ink/70">
                {f.prd.acceptanceCriteria?.map((c: any) => <li key={c.id}>[{c.id}] {c.criterion}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
