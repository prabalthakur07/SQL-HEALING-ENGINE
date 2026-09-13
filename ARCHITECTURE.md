# Architecture

## Request flow

```
Browser
  │  POST /api/query { question }
  ▼
Next.js API Route  (app/api/query/route.ts)
  │  1. Auth check (lib/auth.ts)
  │  2. Rate limit check (lib/rateLimit.ts)
  │  3. Input validation (length, type)
  ▼
Healing Loop  (lib/healingEngine.ts)
  │
  │  ┌─────────────────────────────────────────┐
  │  │  loop (max N attempts):                  │
  │  │   a. generateSql() -> Claude tool call   │
  │  │   b. checkGuardrails() -> static rules   │
  │  │   c. adapter.runSandboxed() -> execute   │
  │  │   d. on error: capture message, retry    │
  │  └─────────────────────────────────────────┘
  ▼
DbAdapter  (lib/db/*)
  │  SqliteAdapter   -> local file, demo/dev
  │  PostgresAdapter -> real DB, read-only txn, statement timeout
  ▼
Structured logs (lib/logger.ts) -> stdout -> your log aggregator
```

## Trust boundaries

There are three independent layers between "the LLM generated some SQL" and
"that SQL touched real data." Each one assumes the previous layer might fail:

1. **Prompt-level constraints** (`lib/anthropic.ts`) - the system prompt tells
   the model the schema, the write policy, and unit conventions. This is the
   weakest layer (a prompt is not a security boundary) but it's what keeps
   the *common case* correct and reduces how often the other layers get
   exercised.
2. **Static guardrails** (`lib/guardrails.ts`) - regex/keyword checks that run
   on every generated statement before it touches a connection. Blocks
   schema-altering keywords outright, rejects multi-statement payloads,
   rejects unscoped UPDATE/DELETE.
3. **Database-level enforcement** (`lib/db/postgresAdapter.ts`) - the actual
   floor. Every statement runs inside `BEGIN TRANSACTION READ ONLY` and is
   rolled back unconditionally. Pair this with a Postgres role that has only
   `SELECT` grants (see `data/roles-init.sql`) so that even a bug in layers
   1 and 2 cannot cause a write to persist - the database itself refuses.

**The rule of thumb:** guardrails and prompts reduce how often you hit the
database-level floor; they are not a substitute for it. If you only do #1
and #2, a sufficiently adversarial or buggy prompt eventually gets through.

## Why the healing loop is capped, not infinite

An LLM given a stack trace does not always converge to a fix - sometimes it
misdiagnoses the error and repeats a variant of the same mistake. Uncapped
retries in that scenario means unbounded API spend and a hung request. The
loop caps at `MAX_HEALING_ATTEMPTS` (default 4) and reports failure
transparently, with the full attempt trail, rather than looping forever or
fabricating a result.

## Where this would need to change for a multi-tenant SaaS product

This project is built as a single-tenant tool (one database, one API key).
To serve multiple customers safely you would need, at minimum:

- Per-tenant database credentials, never a single shared connection string
- Real session auth (not the shared-secret `APP_API_KEY` gate) so you know
  *which* tenant is asking
- A shared rate-limit store (Redis) instead of the in-memory bucket, since
  multiple tenants across multiple server instances need coordinated limits
- Per-tenant token/cost accounting, since one tenant's runaway healing loop
  shouldn't be invisible in an aggregate bill
- Schema descriptions scoped per-tenant, so one tenant's prompt context never
  contains another tenant's table/column names

None of that is implemented here - it's flagged so it's a deliberate choice,
not an oversight, if you take this further.
