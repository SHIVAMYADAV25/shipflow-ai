"use client";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Card, CardBody, CardHeader, SectionHeading, StatusBadge, Spinner, EmptyState } from "@/components/ui";

export default function DashboardPage() {
  const myOrgs = trpc.org.listMine.useQuery();

  if (myOrgs.isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  const firstOrg = myOrgs.data?.[0];

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        title="Dashboard"
        subtitle={firstOrg ? `Welcome back to ${firstOrg.name}` : "Welcome to ShipFlow AI"}
      />

      {!firstOrg ? (
        <EmptyState
          icon="🏢"
          title="No organization yet"
          description="Create your first workspace to start shipping features."
          action={<Link href="/app/workspaces" className="mt-2 inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">Create Workspace</Link>}
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard orgId={firstOrg.id} />
          </div>

          {/* Quick links */}
          <Card>
            <CardHeader><h3 className="text-sm font-medium text-ink">Quick links</h3></CardHeader>
            <CardBody className="flex flex-wrap gap-3">
              <Link href="/app/projects" className="rounded-md border border-ink/15 px-3 py-2 text-sm hover:bg-ink/5">→ Projects</Link>
              <Link href="/app/integrations/github" className="rounded-md border border-ink/15 px-3 py-2 text-sm hover:bg-ink/5">→ GitHub Integration</Link>
              <Link href="/app/billing" className="rounded-md border border-ink/15 px-3 py-2 text-sm hover:bg-ink/5">→ Billing</Link>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({ orgId }: { orgId: string }) {
  const billing = trpc.billing.getStatus.useQuery({ orgId });
  if (billing.isLoading) return <div className="col-span-3 flex justify-center py-6"><Spinner /></div>;

  const d = billing.data;
  if (!d) return null;

  return (
    <>
      <Card>
        <CardBody className="text-center">
          <p className="text-3xl font-bold text-ink">{d.plan.toUpperCase()}</p>
          <p className="mt-1 text-xs text-ink/50">Current plan</p>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="text-center">
          <p className="text-3xl font-bold text-ink">{d.aiCreditsUsed} <span className="text-base text-ink/40">/ {d.aiCreditsLimit}</span></p>
          <p className="mt-1 text-xs text-ink/50">AI credits used this month</p>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="text-center">
          <p className="text-3xl font-bold text-ink">{d.repoLimit}</p>
          <p className="mt-1 text-xs text-ink/50">Repo limit</p>
        </CardBody>
      </Card>
    </>
  );
}
