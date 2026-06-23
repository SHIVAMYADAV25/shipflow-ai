"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button, Card, CardBody, SectionHeading, StatusBadge, EmptyState, Spinner } from "@/components/ui";
import type { FeatureStatus } from "@shipflow/common";

const STATUSES: Array<FeatureStatus | undefined> = [undefined, "new", "discovery", "prd_ready", "in_progress", "review", "shipped"];

export default function FeaturesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [filterStatus, setFilterStatus] = useState<FeatureStatus | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const features = trpc.feature.list.useQuery({ projectId, status: filterStatus, limit: 50 }, { refetchInterval: 15_000 });
  const createFeature = trpc.feature.create.useMutation({ onSuccess: () => { features.refetch(); setShowForm(false); setTitle(""); setDescription(""); } });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createFeature.mutateAsync({ projectId, title, description, sourceChannel: "manual", priority: "medium" });
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Feature Requests"
        subtitle="Manage the full lifecycle: discovery → PRD → tasks → review → ship."
        action={<Button onClick={() => setShowForm(true)}>+ New request</Button>}
      />

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <button
            key={s ?? "all"}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterStatus === s ? "bg-ink text-paper" : "bg-ink/10 text-ink/70 hover:bg-ink/15"}`}
          >
            {s ? s.replace("_", " ") : "All"}
          </button>
        ))}
      </div>

      {showForm && (
        <Card>
          <CardBody>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <input required placeholder="Feature title" value={title} onChange={(e) => setTitle(e.target.value)}
                className="rounded-md border border-ink/15 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              <textarea required placeholder="Describe the feature request (min 10 chars)" rows={3}
                value={description} onChange={(e) => setDescription(e.target.value)}
                className="rounded-md border border-ink/15 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              {createFeature.error && <p className="text-xs text-red-600">{createFeature.error.message}</p>}
              <div className="flex gap-2">
                <Button type="submit" loading={createFeature.isPending}>Submit request</Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {features.isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : features.data?.length === 0 ? (
        <EmptyState icon="💡" title="No feature requests" description="Submit a request and ShipFlow's AI agent will guide it from idea to shipped." />
      ) : (
        <div className="flex flex-col gap-3">
          {features.data?.map((f) => (
            <Link key={f.id} href={`/app/projects/${projectId}/features/${f.id}`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardBody className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{f.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-ink/60">{f.description}</p>
                    <p className="mt-2 text-xs text-ink/40">
                      {new Date(f.createdAt).toLocaleDateString()} · {f.priority} priority · {f.sourceChannel}
                    </p>
                  </div>
                  <StatusBadge status={f.status} />
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
