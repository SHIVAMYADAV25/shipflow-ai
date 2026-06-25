"use client";
import { Skeleton } from "../ui/shadcn/skeleton";
import { Progress } from "../ui/progress";

type WorkflowStage =
  | "discovery"
  | "generating_prd"
  | "generating_tasks"
  | "reviewing_pr"
  | "idle";

const STAGE_META: Record<WorkflowStage, { label: string; detail: string; progress: number }> = {
  discovery: {
    label: "AI Discovery Agent running…",
    detail: "Analyzing your request and checking for duplicates.",
    progress: 20,
  },
  generating_prd: {
    label: "Generating PRD…",
    detail: "The AI is structuring your feature into a Product Requirements Document.",
    progress: 45,
  },
  generating_tasks: {
    label: "Splitting PRD into engineering tasks…",
    detail: "Breaking user stories into Kanban tasks. This usually takes 10-20 seconds.",
    progress: 70,
  },
  reviewing_pr: {
    label: "AI Code Review in progress…",
    detail: "Running requirements, security, performance, and testing checks against the PR diff.",
    progress: 60,
  },
  idle: { label: "", detail: "", progress: 0 },
};

interface WorkflowProgressBannerProps {
  stage: WorkflowStage;
}

export function WorkflowProgressBanner({ stage }: WorkflowProgressBannerProps) {
  if (stage === "idle") return null;
  const meta = STAGE_META[stage];

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">{meta.label}</p>
          <p className="mt-0.5 text-xs text-ink/60">{meta.detail}</p>
          <Progress value={meta.progress} className="mt-2 h-1" />
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/** Derive the current workflow stage from a feature's status */
export function deriveWorkflowStage(status: string): WorkflowStage {
  if (status === "new" || status === "discovery") return "discovery";
  if (status === "prd_ready" && status === "prd_ready") return "idle"; // PRD done, waiting
  if (status === "planning") return "generating_tasks";
  if (status === "review") return "reviewing_pr";
  return "idle";
}
