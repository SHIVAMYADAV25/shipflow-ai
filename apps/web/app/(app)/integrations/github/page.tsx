"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button, Card, CardBody, CardHeader, SectionHeading, Spinner, EmptyState } from "@/components/ui";

export default function GithubIntegrationPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";

  const repos = trpc.github.listRepos.useQuery({ projectId }, { enabled: !!projectId, refetchInterval: 15_000 });
  const connectRepo = trpc.github.connectRepo.useMutation({ onSuccess: () => repos.refetch() });
  const toggleRepo = trpc.github.toggleRepo.useMutation({ onSuccess: () => repos.refetch() });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ githubRepoId: "", installationId: "", fullName: "", url: "", defaultBranch: "main" });

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    await connectRepo.mutateAsync({ projectId, ...form });
    setShowForm(false);
    setForm({ githubRepoId: "", installationId: "", fullName: "", url: "", defaultBranch: "main" });
  }

  const GITHUB_APP_URL = `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "shipflow-ai"}/installations/new`;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="GitHub Integration" subtitle="Connect repositories to track pull requests and run AI reviews." />

      {/* Install GitHub App banner */}
      <Card>
        <CardBody className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-ink">Install the ShipFlow GitHub App</p>
            <p className="mt-0.5 text-sm text-ink/60">
              Required to receive webhook events, fetch diffs, and post AI review comments back to GitHub.
            </p>
          </div>
          <a href={GITHUB_APP_URL} target="_blank" rel="noreferrer">
            <Button variant="secondary">Install App ↗</Button>
          </a>
        </CardBody>
      </Card>

      {/* Connect repo form */}
      {!projectId ? (
        <EmptyState icon="🔗" title="Select a project first" description="Navigate here from a project page to connect repositories." />
      ) : (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setShowForm(true)}>+ Connect repository</Button>
          </div>

          {showForm && (
            <Card>
              <CardHeader><p className="text-sm font-medium text-ink">Connect a GitHub Repository</p></CardHeader>
              <CardBody>
                <form onSubmit={handleConnect} className="flex flex-col gap-3">
                  {[
                    { key: "fullName", placeholder: "owner/repo-name", label: "Full name" },
                    { key: "githubRepoId", placeholder: "GitHub repo numeric ID", label: "GitHub repo ID" },
                    { key: "installationId", placeholder: "GitHub App installation ID", label: "Installation ID" },
                    { key: "url", placeholder: "https://github.com/owner/repo", label: "URL" },
                    { key: "defaultBranch", placeholder: "main", label: "Default branch" },
                  ].map(({ key, placeholder, label }) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs text-ink/50">{label}</label>
                      <input
                        required={key !== "defaultBranch"}
                        placeholder={placeholder}
                        value={(form as any)[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        className="w-full rounded-md border border-ink/15 px-3 py-2 font-mono text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-ink/40">
                    💡 Find the installation ID in your GitHub App settings → Installations.
                  </p>
                  {connectRepo.error && <p className="text-xs text-red-600">{connectRepo.error.message}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" loading={connectRepo.isPending}>Connect</Button>
                    <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}

          {repos.isLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : repos.data?.length === 0 ? (
            <EmptyState icon="🐙" title="No repositories connected" description="Connect a GitHub repository to start tracking pull requests." />
          ) : (
            <div className="flex flex-col gap-3">
              {repos.data?.map((repo: any) => (
                <Card key={repo.id}>
                  <CardBody className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-mono font-medium text-ink">{repo.fullName}</p>
                      <p className="mt-0.5 text-xs text-ink/40">
                        Branch: {repo.defaultBranch} · Installation: {repo.installationId}
                        {repo.lastSyncedAt && ` · Synced ${new Date(repo.lastSyncedAt).toLocaleString()}`}
                      </p>
                      {repo.lastSyncError && (
                        <p className="mt-1 text-xs text-red-600">⚠ {repo.lastSyncError}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${repo.isActive ? "text-emerald-600" : "text-ink/40"}`}>
                        {repo.isActive ? "● Active" : "○ Inactive"}
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => toggleRepo.mutate({ repositoryId: repo.id, isActive: !repo.isActive })}
                        loading={toggleRepo.isPending}
                      >
                        {repo.isActive ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
