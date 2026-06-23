# ShipFlow AI

A production-ready, AI-assisted product delivery platform that takes a feature
from **Request → Discovery → PRD → Tasks → Code → AI Review → Fixes →
Re-Review → Human Approval → Ship** — with humans as the final decision-makers
at every gate and AI doing the structural work at every step.

---

## Project Overview

ShipFlow AI is a full-stack SaaS monorepo that replaces the siloed combination
of Jira + Notion + GitHub + code-review bots with one integrated workflow.
Unlike CodeRabbit (which reviews code), ShipFlow owns the entire lifecycle:

| What ShipFlow does | How |
|---|---|
| Gathers missing requirements | AI Discovery Agent (GPT-4.1 via AI SDK) |
| Detects duplicate requests | Keyword + LLM duplicate detection |
| Generates a structured PRD | AI PRD Generator agent (structured output via Zod) |
| Splits the PRD into tasks | AI Task Splitter agent → Kanban board |
| Connects to GitHub | GitHub App via Octokit |
| Reviews PRs against the PRD | Four AI agents: requirements, security, performance, testing |
| Posts review back to GitHub | Inline comments + summary review via Octokit |
| Computes release readiness | Deterministic 0-100 score (no LLM variance at this gate) |
| Gates release on human approval | reviewer must click Approve — no auto-merges |
| Handles billing | Razorpay subscriptions with webhook idempotency |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web app | Next.js 16 (App Router), React 19, Tailwind CSS |
| API layer | tRPC v11, Zod, superjson |
| Database | PostgreSQL 16 + Drizzle ORM |
| Auth | BetterAuth (email/password + GitHub OAuth) |
| Async workflows | Inngest (durable, retryable, step-level logging) |
| AI agents | Vercel AI SDK + OpenAI GPT-4.1, `generateObject` constrained to Zod schemas |
| GitHub integration | Octokit GitHub App (@octokit/app, @octokit/rest) |
| Billing | Razorpay subscriptions |
| Logging | Pino (structured JSON in prod, pretty-printed in dev, secrets redacted) |
| Deployment | Vercel (web), standalone Node (api + inngest) |

---

## Monorepo Architecture

```
apps/
  web/          Next.js 16 frontend – all 13 pages from the PRD
  api/          Standalone Node HTTP server hosting:
                  /trpc/*            → tRPC (9 routers, 40+ procedures)
                  /webhooks/github   → GitHub App webhook handler
                  /webhooks/razorpay → Razorpay webhook handler
                  /healthz           → liveness probe
  inngest/      Express server exposing 4 Inngest functions at /api/inngest

packages/
  common/       Single source of truth: enums, Zod schemas, permissions, error envelope
  db/           Drizzle schema (14 tables), client, migrations
  auth/         BetterAuth server config
  ai/           AI SDK agents: discovery, prd-generator, task-splitter, 4× code-review, readiness scorer
  github/       Octokit wrapper: app auth, webhook verify, diff fetch, comment posting
  inngest/      Shared Inngest client + typed event registry (ShipflowEvents)
  logger/       Pino-based structured logger with secret redaction and child loggers
```

### Why this architecture?

- **`packages/common` as the single source of truth**: Every enum value
  (feature status, task status, org role, etc.) is a `const` tuple defined
  once in `packages/common/src/enums.ts`. Both `packages/db` (for
  `pgEnum()`) and `packages/common/src/schemas` (for `z.enum()`) import
  from the same list. If you rename a status, the compiler catches every
  broken reference across the whole monorepo immediately.

- **Separate `apps/api` server**: GitHub and Razorpay webhooks need raw-body
  access (for HMAC signature verification) before JSON parsing. The tRPC
  standalone adapter consumes the body before you can read it raw. Routing
  both through a single raw `http.createServer` avoids this conflict cleanly
  and also means the API server can run as a long-lived Node process (with a
  real connection pool) instead of being constrained by Vercel's 10s function
  timeout.

- **Inngest for every async step**: PRD generation, task splitting, and AI
  code review can each take 15-60 seconds. Inngest provides durable execution
  with step-level retries, so a transient OpenAI rate-limit or GitHub API
  timeout on step 3 of a 5-step workflow doesn't restart from step 1.

- **`generateObject` with Zod schemas for every AI call**: The AI agents
  never return freeform text that gets parsed. Every agent call is constrained
  to an exact Zod schema (`prdContentSchema`, `reviewFindingsSchema`, etc.).
  This is the core anti-hallucination mechanism — the model can only produce
  fields the rest of the app expects, and the output is validated before it
  hits the database.

---

## Setup Instructions

### Prerequisites

- Node.js 18.18+
- pnpm 9+
- PostgreSQL 14+ (local Docker or managed: Neon, Supabase, Vercel Postgres)
- An OpenAI API key (GPT-4.1 access)
- A GitHub App (see GitHub Integration Setup below)
- A Razorpay account (optional for development — billing router degrades gracefully)
- An Inngest account (free tier works; or run `npx inngest-cli@latest dev` locally)

### 1. Install

```bash
pnpm install
```

### 2. Environment variables

```bash
cp .env.example .env
# Fill in at minimum:
#   DATABASE_URL
#   BETTER_AUTH_SECRET  (openssl rand -base64 32)
#   OPENAI_API_KEY
# Everything else is needed for specific features but the app boots without it.
```

### 3. Database

```bash
# Start local Postgres (Docker):
docker run -d --name shipflow-pg \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=shipflow \
  -p 5432:5432 postgres:16

# Generate SQL migrations from the Drizzle schema:
pnpm db:generate

# Apply them:
pnpm db:migrate
```

### 4. Run

```bash
pnpm dev
# Turborepo starts all three apps in parallel:
#   apps/web     → http://localhost:3000
#   apps/api     → http://localhost:4000
#   apps/inngest → http://localhost:4002
```

### 5. Register Inngest functions (local dev)

```bash
npx inngest-cli@latest dev
# Then visit http://localhost:8288 and register:
#   http://localhost:4002/api/inngest
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | ✅ | 32-byte random secret for BetterAuth sessions |
| `BETTER_AUTH_URL` | ✅ | App URL (e.g. http://localhost:3000) |
| `OPENAI_API_KEY` | ✅ | Used by all four AI agents |
| `GITHUB_APP_ID` | GitHub features | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub features | PEM private key (newlines as `\n`) |
| `GITHUB_APP_WEBHOOK_SECRET` | GitHub features | Webhook HMAC secret |
| `GITHUB_OAUTH_CLIENT_ID/SECRET` | GitHub login | GitHub OAuth App for BetterAuth social login |
| `NEXT_PUBLIC_GITHUB_APP_SLUG` | GitHub UI | App slug shown in install link |
| `RAZORPAY_KEY_ID` | Billing | Razorpay API key |
| `RAZORPAY_KEY_SECRET` | Billing | Razorpay API secret |
| `RAZORPAY_WEBHOOK_SECRET` | Billing | Webhook HMAC secret |
| `RAZORPAY_PLAN_ID_PRO` | Billing | Plan ID from Razorpay dashboard |
| `RAZORPAY_PLAN_ID_ENTERPRISE` | Billing | Plan ID from Razorpay dashboard |
| `INNGEST_EVENT_KEY` | Inngest | Event API key |
| `INNGEST_SIGNING_KEY` | Inngest | SDK signing key |
| `LOG_LEVEL` | Optional | `trace`/`debug`/`info`/`warn`/`error`/`fatal` (default: `info`) |

---

## Database Schema Notes

All tables are in `packages/db/src/schema.ts`. Key design decisions:

### Enums
Every enum value is defined **once** in `packages/common/src/enums.ts` as a
`const` tuple and imported by both Drizzle (`pgEnum([...STATUSES])`) and Zod
(`z.enum(STATUSES)`). This is the single source of truth.

### Feature lifecycle state machine
```
new → discovery → prd_ready → planning → in_progress → review → approval → shipped
                                                                          ↘ closed_duplicate
```
The `featureRequests.status` column drives this. Status transitions are
enforced in the tRPC `feature.updateStatus` procedure and in the Inngest
workflow functions.

### `reviews.review_run_id`
Groups every issue produced by one AI review pass (one commit SHA) so the
UI can show "Run #N: 2 blocking, 1 non-blocking" rather than a flat list.

### `webhook_events` (idempotency log)
Every GitHub and Razorpay delivery is recorded with `(source, externalEventId)`
as a unique key *before* being processed. Retried deliveries are detected and
acked without double-processing. Failed deliveries record the error for manual
replay.

### RBAC
`org_members.role` (owner/admin/pm/developer/reviewer/viewer) is the RBAC
axis. Permissions are defined in `packages/common/src/permissions.ts` as an
explicit allow-list per role — no inheritance, easy to audit. Both the tRPC
middleware (`assertOrgPermission`) and the frontend (to decide what to render)
import this same table.

---

## GitHub Integration Setup

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
2. Set:
   - Homepage URL: your app URL
   - Webhook URL: `https://your-api-domain/webhooks/github`
   - Webhook secret: generate and put in `GITHUB_APP_WEBHOOK_SECRET`
   - Permissions: Pull requests (Read & Write), Contents (Read), Issues (Write)
   - Subscribe to events: `Pull request`, `Push`
3. Generate a private key → paste as `GITHUB_APP_PRIVATE_KEY` (newlines as `\n`)
4. Note the App ID → `GITHUB_APP_ID`
5. Install the app on a repository
6. Note the installation ID → used when connecting a repo via the UI

**Branch convention for auto-linking PRs to features:**
Name your branch `feature/<featureId>-description` where `<featureId>` is the
UUID from ShipFlow (e.g. `feature/3fa85f64-5717-4562-b3fc-2c963f66afa6-checkout-export`).
The webhook handler extracts the UUID and auto-links the PR to that feature,
triggering an AI review immediately. Without this, you can link manually via the
PR Reviews page.

---

## Inngest Workflow Explanation

Four durable workflows in `apps/inngest/src/functions/`:

### `feature-discovery`
Triggered by `feature/created` and `feature/discovery.message`.
1. Loads the feature and existing conversation.
2. Runs a keyword search for potential duplicate features.
3. Calls the Discovery Agent (GPT-4.1 via `generateObject`).
4. If duplicate → closes the request and explains why to the user.
5. If needs more context → saves the AI's question as a `discoveryMessage`, waits for next `feature/discovery.message` event.
6. If ready → sends `prd/generate.requested`.

### `prd-generate`
Triggered by `prd/generate.requested`.
1. Loads the full discovery conversation.
2. Calls the PRD Generator Agent.
3. Persists the structured PRD document to the `prds` table.
4. Updates feature status to `prd_ready`.

### `tasks-generate`
Triggered by `tasks/generate.requested` (sent by `prd.approve` mutation).
1. Loads the approved PRD.
2. Calls the Task Splitter Agent.
3. Inserts all tasks into the `tasks` table with sequential `orderIndex`.
4. Updates feature status to `planning`.

### `pr-review`
Triggered by `github/pull_request.opened` and `.synchronized`.
1. Checks if this commit SHA was already reviewed (idempotency).
2. Loads the linked feature's PRD (skips review if no PRD).
3. Fetches the PR diff via Octokit (truncates gracefully if > 60k chars).
4. Runs four AI agents in parallel: requirements, security, performance, testing.
5. Persists all findings grouped by `review_run_id`.
6. Posts review back to GitHub as a PR review with inline comments.
7. Updates PR state (`changes_requested` if blocking issues, else `open`).

All four functions have `retries: 3` and individual steps are idempotent — a
retry of step 4 doesn't re-run steps 1-3.

---

## AI Features Implemented

| Agent | Schema | Description |
|---|---|---|
| Discovery Agent | `discoveryAgentDecisionSchema` | Decides: needs question / duplicate / ready for PRD |
| PRD Generator | `prdContentSchema` | Produces all 7 PRD sections as structured data |
| Task Splitter | `generatedTasksSchema` | Splits user stories into Kanban tasks with story links |
| Requirements Reviewer | `reviewFindingsSchema` | Checks code against acceptance criteria |
| Security Reviewer | `reviewFindingsSchema` | Checks for injections, missing authz, leaked secrets |
| Performance Reviewer | `reviewFindingsSchema` | Checks for N+1 queries, missing pagination, etc. |
| Testing Reviewer | `reviewFindingsSchema` | Checks test coverage per acceptance criterion |
| Release Readiness | `releaseReadinessSchema` | Deterministic 0-100 score (no LLM variance at a release gate) |

Every agent uses `generateObject` from the Vercel AI SDK, which forces the
model to produce output that matches the Zod schema or throws. This means
hallucinated fields are impossible — the schema is the contract, not a
post-hoc filter.

---

## Pages

| Route | Page |
|---|---|
| `/` | Landing / marketing |
| `/auth` | Sign in / Sign up (BetterAuth + GitHub OAuth) |
| `/app/dashboard` | Summary: plan, credits, quick links |
| `/app/workspaces` | Create and manage organizations |
| `/app/projects` | Project list and create |
| `/app/projects/[id]/features` | Feature request list with status filter |
| `/app/projects/[id]/features/[id]` | Feature detail: discovery chat + PRD view |
| `/app/projects/[id]/features/[id]/plan` | Kanban task board |
| `/app/projects/[id]/features/[id]/approve` | Final approval & ship |
| `/app/projects/[id]/pulls` | Pull request list with re-review trigger |
| `/app/projects/[id]/reviews` | Review history with resolve/dismiss |
| `/app/integrations/github` | Connect repos, toggle active status |
| `/app/billing` | Plan status, usage, upgrade/cancel via Razorpay |

---

## Logging

All logging goes through `@shipflow/logger` (Pino).

- **Development**: pretty-printed with colors and timestamps via `pino-pretty`.
- **Production**: raw JSON lines (one event per line) for log pipeline ingestion.
- **Levels**: `trace`, `debug`, `info`, `warn`, `error`, `fatal` — controlled by `LOG_LEVEL` env var.
- **Scoped loggers**: every module calls `createLogger("scope.name")` producing a `scope` field on every line so you can grep `scope":"inngest.review"` across a distributed trace.
- **Per-request logger**: built in `createContext` with `requestId` + `userId` attached to every tRPC log line.
- **Secret redaction**: passwords, tokens, API keys, webhook signatures, private keys are automatically replaced with `[REDACTED]` before any log line is written.
- **SQL logging**: Drizzle's query logger is wired to pino at `debug` level — set `LOG_LEVEL=debug` locally to see every SQL statement.

```bash
# Example log output (dev):
11:42:03.123  INFO  (trpc.request) procedure ok  { path: 'feature.create', durationMs: 234 }
11:42:03.456  DEBUG (db)           sql query      { query: 'insert into feature_requests ...', params: [...] }
11:42:04.789  INFO  (inngest.discovery) feature request created, discovery triggered { featureId: '...' }
```
