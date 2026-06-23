"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button, Card, CardBody, CardHeader, SectionHeading, Spinner, EmptyState } from "@/components/ui";

export default function WorkspacesPage() {
  const orgs = trpc.org.listMine.useQuery();
  const createOrg = trpc.org.create.useMutation({ onSuccess: () => orgs.refetch() });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createOrg.mutateAsync({ name, slug });
    setName(""); setSlug(""); setShowForm(false);
  }

  if (orgs.isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Workspaces" action={<Button onClick={() => setShowForm(true)}>+ New workspace</Button>} />

      {showForm && (
        <Card>
          <CardBody>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <input required placeholder="Workspace name" value={name}
                onChange={(e) => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")); }}
                className="rounded-md border border-ink/15 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              <input required placeholder="slug (e.g. my-team)" value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="rounded-md border border-ink/15 px-3 py-2 font-mono text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              {createOrg.error && <p className="text-xs text-red-600">{createOrg.error.message}</p>}
              <div className="flex gap-2">
                <Button type="submit" loading={createOrg.isPending}>Create</Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {orgs.data?.length === 0 ? (
        <EmptyState icon="🏢" title="No workspaces yet" description="Create your first workspace to invite your team and start shipping." />
      ) : (
        <div className="flex flex-col gap-4">
          {orgs.data?.map((org) => (
            <Card key={org.id}>
              <CardHeader className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink">{org.name}</p>
                  <p className="font-mono text-xs text-ink/40">/{org.slug}</p>
                </div>
                <span className="rounded-full bg-ink/10 px-3 py-1 text-xs font-medium capitalize text-ink">{org.myRole}</span>
              </CardHeader>
              <CardBody className="flex gap-6 text-sm text-ink/60">
                <span>Plan: <strong className="text-ink capitalize">{org.plan}</strong></span>
                <span>AI credits: <strong className="text-ink">{org.aiCreditsUsed}/{org.aiCreditsLimit}</strong></span>
                <span>Repos: <strong className="text-ink">{org.repoLimit} max</strong></span>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
