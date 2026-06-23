"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button, Card, CardBody, CardHeader, SectionHeading, Spinner, EmptyState } from "@/components/ui";

const PLANS = [
  {
    key: "pro" as const,
    name: "Pro",
    price: "₹2,499/mo",
    features: ["2,000 AI credits/month", "Up to 10 repositories", "Unlimited projects", "Priority support"],
  },
  {
    key: "enterprise" as const,
    name: "Enterprise",
    price: "Contact us",
    features: ["Unlimited AI credits", "Unlimited repositories", "SSO / SAML", "Dedicated support"],
  },
];

export default function BillingPage() {
  const myOrgs = trpc.org.listMine.useQuery();
  const firstOrg = myOrgs.data?.[0];

  const billing = trpc.billing.getStatus.useQuery(
    { orgId: firstOrg?.id ?? "" },
    { enabled: !!firstOrg, refetchInterval: 20_000 },
  );

  const createSubscription = trpc.billing.createSubscription.useMutation({
    onSuccess: (data) => {
      // Redirect to Razorpay-hosted checkout page (short_url)
      if (data.shortUrl) window.open(data.shortUrl, "_blank");
      billing.refetch();
    },
  });

  const cancelSubscription = trpc.billing.cancelSubscription.useMutation({
    onSuccess: () => billing.refetch(),
  });

  const [canceling, setCanceling] = useState(false);

  if (myOrgs.isLoading || billing.isLoading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }
  if (!firstOrg) {
    return <EmptyState icon="🏢" title="No organization found" description="Create a workspace first." />;
  }

  const b = billing.data;
  const isActive = b?.subscription?.status === "active";

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Billing & Plan" subtitle={`Organization: ${firstOrg.name}`} />

      {/* Current usage */}
      <Card>
        <CardHeader><h3 className="text-sm font-medium text-ink">Current Usage</h3></CardHeader>
        <CardBody className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            { label: "Plan", value: b?.plan?.toUpperCase() ?? "—" },
            { label: "AI Credits Used", value: `${b?.aiCreditsUsed ?? 0} / ${b?.aiCreditsLimit ?? 100}` },
            { label: "Repo Limit", value: String(b?.repoLimit ?? 1) },
            { label: "Subscription", value: b?.subscription?.status ?? "none" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-ink/40 uppercase tracking-wider">{label}</p>
              <p className="mt-1 font-semibold text-ink">{value}</p>
            </div>
          ))}
        </CardBody>
        {/* AI credit usage bar */}
        {b && (
          <CardBody className="pt-0">
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.min(100, ((b.aiCreditsUsed ?? 0) / (b.aiCreditsLimit ?? 100)) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-ink/40">
              {Math.round(((b.aiCreditsUsed ?? 0) / (b.aiCreditsLimit ?? 100)) * 100)}% of monthly AI credits used
            </p>
          </CardBody>
        )}
      </Card>

      {/* Plan cards */}
      {b?.plan === "free" && (
        <>
          <p className="text-sm font-medium text-ink/60">Upgrade to unlock more:</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {PLANS.map((plan) => (
              <Card key={plan.key} className="relative">
                {plan.key === "pro" && (
                  <span className="absolute right-3 top-3 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">Popular</span>
                )}
                <CardHeader>
                  <p className="text-base font-semibold text-ink">{plan.name}</p>
                  <p className="text-2xl font-bold text-ink">{plan.price}</p>
                </CardHeader>
                <CardBody className="flex flex-col gap-3">
                  <ul className="space-y-1 text-sm text-ink/70">
                    {plan.features.map((f) => <li key={f}>✓ {f}</li>)}
                  </ul>
                  {plan.key === "enterprise" ? (
                    <a href="mailto:sales@shipflow.ai" className="mt-2 inline-flex items-center justify-center rounded-md border border-ink/20 px-4 py-2 text-sm font-medium hover:bg-ink/5">
                      Contact Sales
                    </a>
                  ) : (
                    <Button
                      className="mt-2 justify-center"
                      loading={createSubscription.isPending}
                      onClick={() => createSubscription.mutate({ orgId: firstOrg.id, plan: plan.key })}
                    >
                      Upgrade to {plan.name}
                    </Button>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Active subscription management */}
      {isActive && (
        <Card>
          <CardHeader><h3 className="text-sm font-medium text-ink">Subscription Management</h3></CardHeader>
          <CardBody className="flex flex-col gap-3">
            <p className="text-sm text-ink/70">
              Your <strong className="capitalize">{b?.plan}</strong> subscription is active.
              {b?.subscription?.currentPeriodEnd && (
                <> Renews {new Date(b.subscription.currentPeriodEnd).toLocaleDateString()}.</>
              )}
            </p>
            {!canceling ? (
              <Button variant="danger" onClick={() => setCanceling(true)}>Cancel Subscription</Button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-red-600">Are you sure? Your plan will revert to Free at the end of the billing period.</p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    loading={cancelSubscription.isPending}
                    onClick={() => cancelSubscription.mutate({ orgId: firstOrg.id })}
                  >
                    Yes, cancel
                  </Button>
                  <Button variant="ghost" onClick={() => setCanceling(false)}>Never mind</Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
