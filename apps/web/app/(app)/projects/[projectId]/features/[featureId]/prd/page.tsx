"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/shadcn/button";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { WorkflowProgressBanner } from "@/components/features/WorkflowProgress";

export default function PrdEditorPage() {
  const { projectId, featureId } = useParams<{ projectId: string; featureId: string }>();
  const router = useRouter();

  const featureQ = trpc.feature.get.useQuery({ featureId }, { refetchInterval: 5000 });
  const prdQ = trpc.prd.getByFeature.useQuery({ featureId }, { refetchInterval: 5000 });

  const updatePrd = trpc.prd.update.useMutation({
    onSuccess: () => { toast.success("PRD saved."); prdQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const approvePrd = trpc.prd.approve.useMutation({
    onSuccess: () => { toast.success("PRD approved! Generating tasks…"); router.push(`/app/projects/${projectId}/features/${featureId}/plan`); },
    onError: (e) => toast.error(e.message),
  });

  const prd = prdQ.data;
  const feature = featureQ.data;

  const [form, setForm] = useState({
    problemStatement: "",
    goals: "",
    nonGoals: "",
    userStories: "",
    acceptanceCriteria: "",
    edgeCases: "",
    successMetrics: "",
  });

  useEffect(() => {
    if (!prd) return;
    setForm({
      problemStatement: prd.problemStatement ?? "",
      goals: prd.goals?.join("\n") ?? "",
      nonGoals: prd.nonGoals?.join("\n") ?? "",
      userStories: prd.userStories?.map((s: any) => `[${s.id}] ${s.story}`).join("\n") ?? "",
      acceptanceCriteria: prd.acceptanceCriteria?.map((c: any) => `[${c.id}] ${c.criterion}`).join("\n") ?? "",
      edgeCases: prd.edgeCases?.join("\n") ?? "",
      successMetrics: prd.successMetrics?.join("\n") ?? "",
    });
  }, [prd?.id]);

  function parseLines(raw: string) {
    return raw.split("\n").map((l) => l.trim()).filter(Boolean);
  }

  function parseUserStories(raw: string) {
    return parseLines(raw).map((line, i) => {
      const match = line.match(/^\[([^\]]+)\]\s+(.+)$/);
      return match ? { id: match[1], story: match[2] } : { id: `us-${i + 1}`, story: line };
    });
  }

  function parseAcceptanceCriteria(raw: string) {
    return parseLines(raw).map((line, i) => {
      const match = line.match(/^\[([^\]]+)\]\s+(.+)$/);
      return match ? { id: match[1], criterion: match[2] } : { id: `ac-${i + 1}`, criterion: line };
    });
  }

  async function handleSave() {
    if (!prd) return;
    await updatePrd.mutateAsync({
      prdId: prd.id,
      problemStatement: form.problemStatement,
      goals: parseLines(form.goals),
      nonGoals: parseLines(form.nonGoals),
      userStories: parseUserStories(form.userStories),
      acceptanceCriteria: parseAcceptanceCriteria(form.acceptanceCriteria),
      edgeCases: parseLines(form.edgeCases),
      successMetrics: parseLines(form.successMetrics),
    });
  }

  const isGenerating = feature?.status === "new" || feature?.status === "discovery" || (feature?.status === "prd_ready" && !prd);
  const isApproved = prd?.status === "approved";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">PRD Editor</h1>
          <p className="mt-1 text-sm text-ink/60 line-clamp-1">{feature?.title}</p>
        </div>
        <div className="flex items-center gap-2">
          {prd && (
            <Badge variant={isApproved ? "success" : "warning"} className="capitalize">
              {prd.status}
            </Badge>
          )}
          {prd && !isApproved && (
            <>
              <Button variant="outline" onClick={handleSave} disabled={updatePrd.isPending}>
                {updatePrd.isPending ? "Saving…" : "Save Draft"}
              </Button>
              <Button onClick={() => approvePrd.mutate({ prdId: prd.id })} disabled={approvePrd.isPending}>
                {approvePrd.isPending ? "Approving…" : "Approve PRD →"}
              </Button>
            </>
          )}
          {isApproved && (
            <Button variant="outline" onClick={() => router.push(`/app/projects/${projectId}/features/${featureId}/plan`)}>
              View Tasks →
            </Button>
          )}
        </div>
      </div>

      {/* Workflow progress */}
      {isGenerating && <WorkflowProgressBanner stage="generating_prd" />}

      {/* Loading skeletons */}
      {prdQ.isLoading && (
        <div className="flex flex-col gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      )}

      {/* PRD not yet generated */}
      {!prdQ.isLoading && !prd && !isGenerating && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-ink/60">No PRD yet. Complete the discovery conversation first, then trigger PRD generation.</p>
            <Button className="mt-4" variant="outline" onClick={() => router.push(`/app/projects/${projectId}/features/${featureId}`)}>
              ← Back to Discovery
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Editor sections */}
      {prd && (
        <div className="flex flex-col gap-4">
          {[
            { key: "problemStatement", label: "Problem Statement", hint: "2-4 sentences describing the problem this feature solves.", rows: 4 },
            { key: "goals", label: "Goals", hint: "One goal per line. What success looks like (outcomes, not implementation).", rows: 4 },
            { key: "nonGoals", label: "Non-Goals", hint: "One per line. Explicitly out of scope to prevent scope creep.", rows: 3 },
            { key: "userStories", label: "User Stories", hint: 'One per line. Format: [us-1] As a <role>, I want <goal>, so that <benefit>.', rows: 5 },
            { key: "acceptanceCriteria", label: "Acceptance Criteria", hint: "One per line. Format: [ac-1] Testable, specific condition. These are what the AI reviewer checks against.", rows: 6 },
            { key: "edgeCases", label: "Edge Cases", hint: "One per line. Unusual inputs or states to handle.", rows: 4 },
            { key: "successMetrics", label: "Success Metrics", hint: "One per line. How will the team know this feature is working?", rows: 3 },
          ].map(({ key, label, hint, rows }) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-ink">{label}</CardTitle>
                <p className="text-xs text-ink/50">{hint}</p>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={rows}
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  disabled={isApproved}
                  className="font-mono text-sm"
                  placeholder={isApproved ? "Approved — read only." : `Edit ${label.toLowerCase()}…`}
                />
              </CardContent>
            </Card>
          ))}

          {!isApproved && (
            <div className="flex justify-end gap-2 pb-6">
              <Button variant="outline" onClick={handleSave} disabled={updatePrd.isPending}>
                {updatePrd.isPending ? "Saving…" : "Save Draft"}
              </Button>
              <Button onClick={() => approvePrd.mutate({ prdId: prd.id })} disabled={approvePrd.isPending}>
                {approvePrd.isPending ? "Approving…" : "Approve PRD & Generate Tasks →"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
