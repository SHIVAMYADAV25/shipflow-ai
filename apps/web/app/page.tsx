import Link from "next/link";

const STEPS = [
  { icon: "💬", title: "Submit a feature request", desc: "Any channel — form, email, call transcript. ShipFlow AI captures it." },
  { icon: "🤖", title: "AI Discovery Agent", desc: "Asks follow-up questions, detects duplicates, gathers full context." },
  { icon: "📋", title: "Structured PRD", desc: "Problem statement, goals, user stories, acceptance criteria, edge cases — generated and editable." },
  { icon: "✅", title: "Engineering Tasks", desc: "PRD split into Kanban tasks ready for your team or a coding agent." },
  { icon: "🔀", title: "GitHub PR Review", desc: "Every pull request is reviewed by AI against the PRD acceptance criteria — not just syntax." },
  { icon: "🚀", title: "Human Approval & Ship", desc: "A human reviewer sees the full picture and makes the final call. No surprise auto-merges." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold tracking-tight text-accent">ShipFlow<span className="ml-1 text-sm font-normal text-ink/40">AI</span></span>
          <div className="flex gap-3">
            <Link href="/auth" className="rounded-md px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5">Sign in</Link>
            <Link href="/auth" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">Get started free</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <span className="inline-block rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs font-medium text-accent">AI-Assisted Product Delivery</span>
        <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight text-ink">From feature request<br/>to shipped software.</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-ink/60">ShipFlow AI guides every feature through discovery, PRD, tasks, code review against requirements, and human approval — AI does the work, humans make the call.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/auth" className="rounded-md bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent/90">Start shipping better features →</Link>
          <a href="https://github.com/your-org/shipflow-ai" target="_blank" rel="noreferrer" className="rounded-md border border-ink/15 px-6 py-3 text-sm font-medium text-ink hover:bg-ink/5">View on GitHub</a>
        </div>
      </section>

      <section className="border-y border-ink/10 bg-white py-6">
        <div className="mx-auto max-w-5xl overflow-x-auto px-6">
          <div className="flex items-center gap-2 whitespace-nowrap text-sm font-medium text-ink/60">
            {["Request","PRD","Tasks","Code","AI Review","Fixes","Re-Review","Approval","Ship"].map((s,i,arr) => (
              <span key={s} className="flex items-center gap-2">
                <span className="rounded-md bg-ink/5 px-2 py-1 text-ink">{s}</span>
                {i < arr.length - 1 && <span className="text-ink/30">→</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="mb-12 text-2xl font-bold tracking-tight text-ink">The complete delivery loop</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-xl border border-ink/10 bg-white p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-2xl">{step.icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-ink/30">Step {i+1}</span>
              </div>
              <p className="font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-sm text-ink/60">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-ink/10 bg-white py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="mb-2 text-2xl font-bold text-ink">Beyond code review</h2>
          <p className="mb-8 text-ink/60">CodeRabbit reviews code. ShipFlow owns the full delivery lifecycle.</p>
          <div className="overflow-hidden rounded-xl border border-ink/10">
            {[
              ["Feature","ShipFlow AI","CodeRabbit"],
              ["PRD-aware review","✓ Reviews against acceptance criteria","✗"],
              ["Discovery Agent","✓ Gathers missing requirements","✗"],
              ["Task generation","✓ Splits PRD into Kanban tasks","✗"],
              ["Release readiness score","✓ 0-100 deterministic score","✗"],
              ["Multi-agent code review","✓ Requirements, security, perf, tests","✓ Code quality"],
              ["GitHub integration","✓ App webhooks + inline comments","✓"],
              ["Human approval gate","✓ Required before ship","Optional"],
            ].map(([f,sf,cr],i) => (
              <div key={i} className={`grid grid-cols-3 gap-4 px-4 py-3 text-sm ${i===0?"border-b border-ink/10 text-xs font-semibold uppercase tracking-wide text-ink/40":i%2===0?"bg-paper":""}`}>
                <span className="text-ink">{f}</span>
                <span className="text-emerald-700">{sf}</span>
                <span className="text-ink/40">{cr}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 text-center">
        <h2 className="text-2xl font-bold text-ink">Ready to ship with confidence?</h2>
        <p className="mt-2 text-ink/60">Free plan includes 100 AI credits/month and 1 repository.</p>
        <Link href="/auth" className="mt-6 inline-flex rounded-md bg-accent px-8 py-3 text-sm font-medium text-white hover:bg-accent/90">Get started free →</Link>
      </section>

      <footer className="border-t border-ink/10 py-8 text-center text-xs text-ink/30">
        ShipFlow AI · Next.js, tRPC, Drizzle, OpenAI, Inngest · MIT License
      </footer>
    </div>
  );
}
