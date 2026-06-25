"use client";
import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Card, CardBody, Button, SectionHeading, EmptyState, Spinner } from "@/components/ui";
import { useSession } from "@/lib/auth/client";

export default function ProjectsPage() {
  const { data: session } = useSession();
  const myOrgs = trpc.org.listMine.useQuery(undefined, { enabled: !!session });
  const firstOrg = myOrgs.data?.[0];

  const projects = trpc.project.list.useQuery(
    { orgId: firstOrg?.id ?? "", limit: 50 },
    { enabled: !!firstOrg },
  );

  const createProject = trpc.project.create.useMutation({
    onSuccess: () => projects.refetch(),
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  if (myOrgs.isLoading || (firstOrg && projects.isLoading)) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!firstOrg) return;
    await createProject.mutateAsync({ orgId: firstOrg.id, name, description });
    setName(""); setDescription(""); setShowForm(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Projects"
        action={<Button onClick={() => setShowForm(true)}>+ New project</Button>}
      />

      {showForm && (
        <Card>
          <CardBody>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <input
                required placeholder="Project name"
                value={name} onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-ink/15 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <textarea
                placeholder="Description (optional)"
                rows={2}
                value={description} onChange={(e) => setDescription(e.target.value)}
                className="rounded-md border border-ink/15 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              {createProject.error && <p className="text-xs text-red-600">{createProject.error.message}</p>}
              <div className="flex gap-2">
                <Button type="submit" loading={createProject.isPending}>Create</Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {!firstOrg ? (
        <EmptyState icon="🏢" title="Create an organization first" action={<Link href="/app/workspaces" className="mt-2 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">Go to Workspaces</Link>} />
      ) : projects.data?.length === 0 ? (
        <EmptyState icon="📂" title="No projects yet" description="Create your first project to start managing features." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.data?.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}/features`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardBody>
                  <p className="font-medium text-ink">{p.name}</p>
                  {p.description && <p className="mt-1 text-sm text-ink/60 line-clamp-2">{p.description}</p>}
                  <p className="mt-3 text-xs text-ink/40">{new Date(p.createdAt).toLocaleDateString()}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
