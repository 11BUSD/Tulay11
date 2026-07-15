# Tulay

Tulay ("bridge" in Tagalog) is an Ontario newcomer-settlement platform and
revenue operating system. It helps newcomers navigate settlement across 10
pillars (banking, phone & internet, housing, tenant insurance, jobs,
healthcare, tax & benefits, transportation, remittance, community), surfaces
trusted — and where required licensed — partner offers, and runs the
back-office revenue/compliance operations behind them.

- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) ·
  Tailwind CSS · next-intl (EN/TL bilingual) · Postgres (via `pg`, Supabase in
  production) · Zod.
- **Three surfaces:** the consumer PWA, the admin/operator dashboard, and the
  agent + outreach engine.

> This document is an engineering overview. For the compliance controls and how
> each is enforced, see [COMPLIANCE.md](./COMPLIANCE.md).

## Setup

### Prerequisites

- Node.js 20+ and npm.
- Docker (for local Postgres) or any reachable Postgres 15+.

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env.local` and fill in the values (never commit
`.env.local`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string used by the app and the `db:*` scripts. |
| `TEST_DATABASE_URL` | Separate Postgres for the Vitest integration suite (falls back to `DATABASE_URL`; integration suites are skipped when neither is set). |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public, browser-safe). |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key — **server only**, never exposed to the browser. |
| `OPENAI_API_KEY` | OpenAI key for the concierge / agents. A mock provider is used automatically in tests / when no key is set. |
| `REFERRAL_IP_PEPPER` | HMAC pepper for hashing referral IP addresses (data minimization). |
| `COMPLIANCE_HASH_SALT` | Salt for compliance hashing (consent / PII), version-prefixed `v1:`. |

### 3. Local Postgres (Docker)

```bash
docker run --name tulay-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=tulay \
  -p 5432:5432 -d postgres:16
```

### 4. Migrate + seed

Migrations live in `supabase/migrations/` (0001–0011) and the idempotent seed
in `supabase/seed/`.

```bash
npm run db:migrate   # apply migrations
npm run db:seed      # apply the idempotent seed
npm run db:reset     # drop + re-apply migrations, then seed (destructive)
```

## Running

```bash
npm run dev          # dev server on http://localhost:3000
npm run build        # production build (compiles the Serwist service worker)
npm run start        # serve the production build
npm run typecheck    # tsc --noEmit
npm run lint         # next lint (zero warnings expected)
npm test             # vitest run (unit + integration; integration needs a DB)
```

## Architecture

### Data model (25+ tables)

Migrations 0001–0011 define the schema. Highlights:

- **Identity (0002):** `profiles` (role: `user`/`ambassador`/`admin`), `users`.
- **Compliance (0003):** `consent_records` (append-only), `unsubscribes`,
  `data_requests`, `license_verifications`, `audit_logs` (append-only).
- **Marketplace (0004):** `settlement_pillars`, `partners`, `partner_offers`,
  `partner_agreements`, `due_diligence_reviews`.
- **Revenue (0005):** `referral_clicks`, `commission_rules`,
  `referral_conversions`, `payouts` (paid rows immutable), and the append-only
  `revenue_attribution_events` ledger.
- **Ambassadors (0006):** `ambassadors`, `ambassador_referrals`.
- **Outreach (0007):** campaigns, contacts, `outreach_messages` (10-state
  machine), `outreach_approvals` (append-only approval ledger).
- **Agents (0008):** `agent_runs` and the agent work queue.
- **Triggers/RLS (0009–0010):** append-only + immutability guards, deny-by-
  default RLS (server uses the service role).
- **Saved resources (0011):** consumer bookmark list.

All money is stored as **integer cents** (BIGINT) and percentages as integer
basis points. `node-postgres` returns BIGINT columns as **strings**, so every
aggregate is coerced with `Number(...)`/`toInt(...)` before formatting.

### Consumer app + PWA

- Server-rendered pages under `src/app/` (landing, onboarding, dashboard,
  pillars, concierge, profile, saved, ambassadors) using the `AppShell`.
- **SEO/content surface:** `src/app/guides/[slug]`, `src/app/cities/[city]`,
  `src/app/faqs` sourced from `src/content/{guides,cities,faqs}`. Each page
  emits JSON-LD (`Article` / `FAQPage`); every monetized offer block renders the
  partner-disclosure component (and, for regulated pillars, the licensing
  disclaimer). Content is informational only and links to official sources.
- **PWA (Serwist):** `public/manifest.json` (`display: standalone`, brand
  teal/cream, 192/512 + maskable icons, apple-touch-icon), a service worker
  compiled from `src/sw.ts` (precache app shell, cache-first static assets,
  network-first for read-only `/api/*` GETs, `/offline.html` fallback), and the
  client components `ServiceWorkerRegister` + `InstallPrompt` mounted in the
  root layout. The SW is disabled in development. Generated `public/sw.js*` is
  gitignored (produced on build).

### Admin dashboard

Under `src/app/admin/` behind a server-side role guard (`AdminLayout` +
`requireAdmin`). Includes overview, **product analytics** (`/admin/analytics`
→ `GET /api/admin/analytics`), revenue analytics, partners/offers/applications/
ambassadors/payouts, the outreach approval queue, due diligence, agreements,
audit & consent. Anyone who is not an admin is redirected to `/login`.

### Agent runtime

`src/lib/agents/` — a registry (`registry.ts`) of 14 agents (6 built, 8 stubs),
each implementing the `Agent` contract and returning a structured
`AgentResult`. Agents **emit drafts only**; they never approve or send. The LLM
adapter (`getLLMProvider()`) uses a mock in test / when no key is present. The
**Compliance/Privacy agent** runs `runLaunchReadiness()` and emits the launch
report as a draft for human review.

### Outreach engine

`src/lib/outreach/` + `src/lib/compliance/approvalGate.ts` — outbound partner
outreach is agent-drafted and gated by a **human approval** ledger. The MVP send
is **simulated** (no network). Lifecycle email uses
`src/lib/email/provider.ts`: an `EmailProvider` interface + a
`SimulatedEmailProvider` that logs (never sends), enforces the CASL consent gate
before each send, and embeds a one-click unsubscribe URL.

## Testing

Vitest (`vitest.config.ts`) runs unit tests (jsdom) and integration tests
(node, under `src/test/`). Integration tests bootstrap the test database
(migrations + seed) via `src/test/global-setup.ts`. When no DB env is present,
integration suites are skipped and unit tests still run.
