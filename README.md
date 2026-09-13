# 🩹 Self-Healing SQL Engine

A natural-language-to-SQL engine that **autonomously debugs its own output**. When a generated
query fails against the live database, the backend catches the exact error, feeds it back to
the model as structured context, and retries — refactoring the query until it executes
successfully or a safety cap is hit.

This isn't just NL→SQL. The interesting part is the **feedback loop**: plan → execute →
observe the real error → refine → retry, capped and transparent about failure.

## Why this exists

Legacy database migrations translate queries constantly, and those translations fail silently
in production more often than teams admit. This project simulates that problem on purpose —
the seed schema uses inconsistent, legacy-style naming (`cust_id`, prices stored in cents,
dates as text) specifically so the healing loop has real errors to recover from, not a toy
schema that never breaks.

## How the self-healing loop works

```
 User question
      │
      ▼
 ┌─────────────────────┐
 │ 1. Generate SQL      │◄──────────────┐
 │  (Claude tool call)  │                │
 └─────────┬────────────┘                │
           ▼                             │
 ┌─────────────────────┐                 │
 │ 2. Static guardrails │                 │  Exact error message
 │  (block DROP, no-    │                 │  fed back as context
 │   WHERE writes, etc) │                 │
 └─────────┬────────────┘                │
           ▼                             │
 ┌─────────────────────┐   error   ┌─────┴──────┐
 │ 3. Execute in        │──────────►│ Attempt++  │
 │  sandboxed SQLite    │           │ (max: 4)   │
 │  (write ops always   │           └────────────┘
 │   rolled back)       │
 └─────────┬────────────┘
           │ success
           ▼
 Return result + full attempt trail
```

Every attempt — successful or not — is logged with its SQL, the model's stated explanation,
and the exact error message. Nothing is hidden from the user; the UI shows the full trail so
you can watch it fail and self-correct in real time.

**Failure is reported honestly.** If the loop exhausts `MAX_HEALING_ATTEMPTS` (default 4)
without a working query, it returns `success: false` with the complete attempt history rather
than faking a result.

## Safety design (read before treating this as production-ready)

Two independent layers, because letting an LLM execute arbitrary SQL against a real database
is inherently risky:

1. **Static guardrails** (`lib/guardrails.ts`) — reject `DROP`/`TRUNCATE`/`ALTER`, block
   multi-statement injection, block writes unless explicitly enabled, block `UPDATE`/`DELETE`
   without a `WHERE` clause.
2. **Sandboxed execution** (`lib/db.ts`) — every non-`SELECT` statement runs inside a
   `SAVEPOINT` that is unconditionally rolled back. Even if a destructive statement somehow
   passed guardrails, it cannot persist.

This is a portfolio/demo pattern, not a production authorization model — there's no
per-user permissioning, and you should never point this at a real production database.

## Tech stack

- **Next.js 14** (App Router) + React — frontend + API routes in one deployable unit
- **better-sqlite3** — synchronous, zero-config SQL sandbox (swap for `pg` + a real
  Postgres connection if you want to demo against a "production-like" DB)
- **Anthropic SDK, tool calling** — forces structured `{ sql, explanation }` output instead
  of parsing free text out of a chat response
- **TypeScript** throughout

## Getting started

```bash
npm install
cp .env.example .env        # add your ANTHROPIC_API_KEY
npm run seed                # populates data/app.db
npm run dev                 # http://localhost:3000
```

## Measuring a real success rate (for your resume, don't guess a number)

```bash
npm run benchmark
```

This runs `data/benchmark-queries.json` (15 NL questions of increasing difficulty) through
the full healing loop and writes `benchmark-report.md` with:
- overall success rate
- how many succeeded first-try vs. only after healing
- average attempts per query

Re-run it any time you change the schema, prompt, or model, and use the actual output —
that's the number that belongs in a resume bullet or interview answer, and it's the number
you can defend when someone asks "measured how?"

## Project structure

```
app/
  page.tsx              UI: question box, attempt trail, results table
  api/query/route.ts    POST endpoint that runs the healing loop
lib/
  anthropic.ts          Claude tool-calling wrapper for SQL generation
  healingEngine.ts       The core retry/feedback loop
  guardrails.ts          Static SQL safety checks
  db.ts                  SQLite connection + sandboxed execution
data/
  seed.sql               Deliberately "legacy" schema + sample data
  benchmark-queries.json Test set for measuring success rate
scripts/
  seed.ts                 Populate the database
  benchmark.ts            Run the benchmark suite, write a report
.github/workflows/
  benchmark.yml           CI: runs the benchmark on every push to main
```

## Running tests

```bash
npm test
```

Covers guardrail edge cases (multi-statement injection, unscoped writes,
schema-altering keywords) and the healing loop itself with a mocked LLM
client — including a test that asserts the exact prior error is passed back
to the model on retry, which is the actual mechanism the whole project
depends on.

## Pointing this at a real database

By default this runs against a bundled SQLite file. To use a real Postgres
database:

```bash
DB_DRIVER=postgres
DATABASE_URL=postgres://sql_engine_readonly:yourpassword@your-host:5432/yourdb
```

**Before you do this**, create a database role that can only `SELECT` —
see `data/roles-init.sql` for the exact grants. The Postgres adapter also
runs every statement inside `BEGIN TRANSACTION READ ONLY` with a statement
timeout, but that's defense-in-depth, not a substitute for a properly scoped
role. Read `ARCHITECTURE.md` for the full trust-boundary breakdown.

## Deploying

**Docker (includes a real Postgres instance for testing):**
```bash
cp .env.example .env   # fill in ANTHROPIC_API_KEY
docker compose up --build
```

**Vercel (SQLite demo mode only — Vercel's filesystem is ephemeral, so this
only works for the bundled demo DB, not a persistent one):**
```bash
vercel deploy
# then add ANTHROPIC_API_KEY and APP_API_KEY as environment variables
# in the Vercel dashboard
```

**Any Docker-capable host (Fly.io, Railway, a VPS):** use the included
`Dockerfile` directly and point `DATABASE_URL` at your managed Postgres
instance.

## Security checklist before exposing this to the internet

- [ ] Set `APP_API_KEY` — without it, the API is open to anyone with the URL
- [ ] If using Postgres, confirm `DATABASE_URL` points at a `SELECT`-only role
- [ ] Set `RATE_LIMIT_PER_MINUTE` appropriately for your Anthropic API budget
- [ ] Set a billing/spend alert in the Anthropic console — a misbehaving
      healing loop retries up to `MAX_HEALING_ATTEMPTS` times per request
- [ ] If deploying with multiple instances, replace the in-memory rate
      limiter (`lib/rateLimit.ts`) with a shared store (Redis) — see the
      comment at the top of that file
- [ ] Never point this at a production database with a role that has write
      access, regardless of what `allowWrites` is set to in the request body

## Extending this project

- Swap SQLite for Postgres (`pg` client) to demo against more realistic error messages
  (constraint violations, type coercion errors, etc. read differently than SQLite's).
- Add a "diff" view showing exactly what changed between a failed attempt and the fix.
- Add per-question latency/cost tracking to the benchmark report.
- Extend guardrails with a query-cost estimator (`EXPLAIN QUERY PLAN`) to catch runaway
  full-table scans before execution, not just after.
