"use client";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button, Card, CardBody, CardHeader, SectionHeading, Spinner, EmptyState } from "@/components/ui";
import type { TaskStatus } from "@shipflow/common";

const COLUMNS: Array<{ status: TaskStatus; label: string; color: string }> = [
  { status: "todo", label: "To Do", color: "bg-ink/5" },
  { status: "in_progress", label: "In Progress", color: "bg-accent/10" },
  { status: "done", label: "Done", color: "bg-emerald-50" },
];

export default function PlanPage() {
  const { featureId } = useParams<{ featureId: string }>();

  const feature = trpc.feature.get.useQuery({ featureId });
  const prdId = feature.data?.prd?.id;

  const tasks = trpc.task.listByPrd.useQuery({ prdId: prdId ?? "" }, { enabled: !!prdId, refetchInterval: 5000 });
  const moveTask = trpc.task.move.useMutation({ onSuccess: () => tasks.refetch() });
  const approvePrd = trpc.prd.approve.useMutation({ onSuccess: () => feature.refetch() });

  if (feature.isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  const prd = feature.data?.prd;

  if (!prd) {
    return (
      <EmptyState icon="📋" title="No PRD yet"
        description="The PRD must be generated and approved before tasks are created." />
    );
  }

  const totalTasks = tasks.data?.length ?? 0;
  const doneTasks = tasks.data?.filter((t) => t.status === "done").length ?? 0;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Task Board"
        subtitle={`${doneTasks}/${totalTasks} tasks done · ${progress}% complete`}
        action={
          prd.status !== "approved" ? (
            <Button onClick={() => approvePrd.mutate({ prdId: prd.id })} loading={approvePrd.isPending}>
              Approve PRD & Generate Tasks
            </Button>
          ) : undefined
        }
      />

      {/* Progress bar */}
      {totalTasks > 0 && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {tasks.isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : totalTasks === 0 ? (
        <EmptyState icon="⏳" title="Tasks are being generated…" description="Inngest is splitting the PRD into engineering tasks. Refresh in a moment." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.status}>
              <div className={`rounded-t-lg px-4 py-2 ${col.color}`}>
                <p className="text-sm font-medium text-ink">{col.label}</p>
                <p className="text-xs text-ink/50">{tasks.data?.filter((t) => t.status === col.status).length ?? 0} tasks</p>
              </div>
              <div className="flex flex-col gap-2 rounded-b-lg border border-t-0 border-ink/10 bg-white p-3">
                {tasks.data?.filter((t) => t.status === col.status).map((task) => (
                  <div key={task.id} className="rounded-lg border border-ink/8 bg-paper/50 p-3">
                    <p className="text-sm font-medium text-ink">{task.title}</p>
                    {task.description && <p className="mt-1 text-xs text-ink/60 line-clamp-2">{task.description}</p>}
                    {task.userStoryId && <p className="mt-1.5 text-xs text-ink/40">Story: {task.userStoryId}</p>}
                    <div className="mt-2 flex gap-1">
                      {COLUMNS.filter((c) => c.status !== col.status).map((target) => (
                        <button key={target.status}
                          onClick={() => moveTask.mutate({ taskId: task.id, status: target.status, orderIndex: task.orderIndex })}
                          className="rounded-md bg-ink/8 px-2 py-0.5 text-xs text-ink/60 hover:bg-ink/15"
                        >
                          → {target.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {tasks.data?.filter((t) => t.status === col.status).length === 0 && (
                  <p className="py-4 text-center text-xs text-ink/30">No tasks here yet</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
