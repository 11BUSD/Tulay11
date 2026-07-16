-- 0008_agent_queue.sql
-- AGENTS-OWNED: DB-backed agent run/task queue. Exact columns per agents-crm.md.

-- agent_runs: one row per logical agent invocation.
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null,
  agent_version text,
  status text not null default 'queued', -- queued|running|succeeded|failed|cancelled|needs_review
  trigger_type text, -- manual|scheduled|chained
  triggered_by uuid, -- admin actor
  idempotency_key text unique,
  input_json jsonb,
  output_json jsonb,
  reasoning_summary text,
  data_sources jsonb,
  confidence numeric(4, 3),
  risk_flags jsonb,
  related_partner_id uuid,
  related_contact_id uuid,
  related_campaign_id uuid,
  attempt int not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_agent_runs_agent_key on agent_runs (agent_key);
create index if not exists idx_agent_runs_status on agent_runs (status);
create index if not exists idx_agent_runs_related_partner_id on agent_runs (related_partner_id);

-- agent_tasks: unit-of-work queue (SKIP LOCKED claim + lock expiry for restart).
create table if not exists agent_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs (id) on delete cascade,
  task_key text not null,
  status text not null default 'queued', -- queued|running|succeeded|failed|dead
  payload_json jsonb,
  result_json jsonb,
  idempotency_key text unique,
  attempt int not null default 0,
  max_attempts int not null default 3,
  scheduled_for timestamptz,
  locked_at timestamptz,
  locked_by text,
  lock_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_agent_tasks_run_id on agent_tasks (run_id);
-- Supports the claim query: status='queued' AND scheduled_for<=now() ORDER BY created_at.
create index if not exists idx_agent_tasks_claim on agent_tasks (status, scheduled_for, created_at);
create index if not exists idx_agent_tasks_lock_expires_at on agent_tasks (lock_expires_at);

-- Now wire the deferred agent_run_id FKs on audit_logs / outreach_messages.
alter table audit_logs
  drop constraint if exists fk_audit_logs_agent_run;
alter table audit_logs
  add constraint fk_audit_logs_agent_run
  foreign key (agent_run_id) references agent_runs (id) on delete set null;

alter table outreach_messages
  drop constraint if exists fk_outreach_messages_generated_by_run;
alter table outreach_messages
  add constraint fk_outreach_messages_generated_by_run
  foreign key (generated_by_run_id) references agent_runs (id) on delete set null;
