"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Progress } from "@/components/ui/shadcn/progress";
import { StatusBadge, SeverityBadge } from "@/components/ui";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const features = trpc.feature.list.useQuery({ projectId, limit: 50 }, { refetchInterval: 10_000 });
  const repos = trpc.github.listRepos.useQuery({ projectId }, { refetchInterval: 20_000 });
  const pullRequests = trpc.github.listPullRequests.useQuery({ projectId, limit: 20 }, { refetchInterval: 10_000 });

  const featureList = features.data ?? [];
  const repoList = repos.data ?? [];
  const prList = pullRequests.data ?? [];

  // Summary counts
  const openFeatures = featureList.filter((f) => !["shipped", "closed_duplicate"].includes(f.status)).length;
  const inReview = featureList.filter((f) => f.status === "review").length;
  const shipped = featureList.filter((f) => f.status === "shipped").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Project Overview</h1>
          <p className="mt-1 text-sm text-ink/60">
            {openFeatures} open · {inReview} in review · {shipped} shipped
          </p>
        </div>
        <Link href={`/projects/${projectId}/features`}>
          <Button>+ New Feature Request</Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open Features", value: openFeatures, color: "text-ink" },
          { label: "In Review", value: inReview, color: "text-amber-600" },
          { label: "Shipped", value: shipped, color: "text-emerald-600" },
          { label: "Repositories", value: repoList.length, color: "text-ink" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="mt-0.5 text-xs text-ink/50">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="features">
        <TabsList>
          <TabsTrigger value="features">
            Features {featureList.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{featureList.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="pulls">
            Pull Requests {prList.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{prList.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="repos">
            Repositories {repoList.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{repoList.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Features tab */}
        <TabsContent value="features">
          {features.isLoading ? (
            <SkeletonList />
          ) : featureList.length === 0 ? (
            <EmptyTab icon="💡" label="No feature requests yet" cta={<Link href={`/projects/${projectId}/features`}><Button size="sm">Add the first feature →</Button></Link>} />
          ) : (
            <div className="flex flex-col gap-2">
              {featureList.map((f) => (
                <Link key={f.id} href={`/projects/${projectId}/features/${f.id}`}>
                  <Card className="cursor-pointer transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{f.title}</p>
                        <p className="mt-0.5 text-xs text-ink/50">{new Date(f.updatedAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={f.priority === "urgent" ? "destructive" : "secondary"} className="text-xs capitalize">{f.priority}</Badge>
                        <StatusBadge status={f.status} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Pull Requests tab */}
        <TabsContent value="pulls">
          {pullRequests.isLoading ? (
            <SkeletonList />
          ) : prList.length === 0 ? (
            <EmptyTab icon="🔀" label="No pull requests yet" cta={<Link href={`/projects/${projectId}/integrations/github?projectId=${projectId}`}><Button size="sm" variant="outline">Connect a repository →</Button></Link>} />
          ) : (
            <div className="flex flex-col gap-2">
              {prList.map((pr: any) => {
                const blocking = pr.reviews?.filter((r: any) => r.severity === "blocking" && r.status === "open").length ?? 0;
                const nonBlocking = pr.reviews?.filter((r: any) => r.severity === "non_blocking" && r.status === "open").length ?? 0;
                return (
                  <Card key={pr.id}>
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <a href={pr.url} target="_blank" rel="noreferrer" className="truncate font-medium text-ink hover:text-accent">
                            #{pr.prNumber} {pr.title}
                          </a>
                          <StatusBadge status={pr.state} />
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-ink/40">{pr.branch} · {pr.headSha?.slice(0, 7)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {blocking > 0 && <SeverityBadge severity="blocking" />}
                        {nonBlocking > 0 && <SeverityBadge severity="non_blocking" />}
                        <Link href={`/projects/${projectId}/reviews?prId=${pr.id}`}>
                          <Button size="sm" variant="outline">Reviews →</Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Repositories tab */}
        <TabsContent value="repos">
          {repos.isLoading ? (
            <SkeletonList />
          ) : repoList.length === 0 ? (
            <EmptyTab icon="🐙" label="No repositories connected" cta={
              <Link href={`/integrations/github?projectId=${projectId}`}>
                <Button size="sm">Connect GitHub repository →</Button>
              </Link>
            } />
          ) : (
            <div className="flex flex-col gap-2">
              {repoList.map((repo: any) => (
                <Card key={repo.id}>
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <p className="font-mono font-medium text-ink">{repo.fullName}</p>
                      <p className="mt-0.5 text-xs text-ink/40">Branch: {repo.defaultBranch}</p>
                    </div>
                    <Badge variant={repo.isActive ? "success" : "secondary"}>
                      {repo.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2 pt-2">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
    </div>
  );
}

function EmptyTab({ icon, label, cta }: { icon: string; label: string; cta?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink/20 bg-paper/50 px-6 py-12 text-center">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm text-ink/60">{label}</p>
      {cta}
    </div>
  );
}
