-- 0003_compliance.sql
-- COMPLIANCE-OWNED append-only tables.
--
-- Append-only enforcement: RLS deny-by-default (0010) is NOT enough because the
-- server uses the service-role key which BYPASSES RLS. So these tables are made
-- append-only with BEFORE UPDATE OR DELETE triggers that RAISE (see 0009).
-- `data_requests` is intentionally excluded from the append-only guard because
-- its `status` legitimately transitions (received -> ... -> completed).
--
-- Columns follow /code/.plans/subplans/compliance.md exactly.

-- consent_records: append-only consent ledger. Withdrawal = new row granted=false.
create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid, -- account user if known (null for pre-account leads)
  subject_email_hash text, -- hashed email for pre-account leads
  purpose text not null, -- lead_referral|concierge|account|partner_data_sharing|marketing
  data_categories text[] not null default '{}',
  shared_with text, -- partner id / category / 'none'
  consequences_text text,
  consent_text_version text,
  basis text, -- 'express' | 'implied' (CASL)
  granted boolean not null,
  ip_hash text, -- hashed, never raw
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_consent_records_subject_id on consent_records (subject_id);
create index if not exists idx_consent_records_subject_email_hash on consent_records (subject_email_hash);
create index if not exists idx_consent_records_purpose on consent_records (purpose);

-- audit_logs: append-only audit trail. Agent-sourced rows require reasoning
-- (enforced in src/lib/audit.ts). agent_run_id links to agent_runs (0008).
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_type text not null, -- 'human' | 'agent' | 'system'
  action text not null, -- e.g. money.referral_recorded, outreach.sent, consent.granted
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reasoning text, -- required when actor_type='agent'
  source_meta jsonb,
  agent_run_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on audit_logs (created_at);
create index if not exists idx_audit_logs_agent_run_id on audit_logs (agent_run_id);

-- outreach_approvals: approval gate. A message only reaches 'sent' if
-- status='approved' AND approved_by references a human actor.
create table if not exists outreach_approvals (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null, -- the queued message
  channel text, -- 'email' | 'sms' | 'partner_portal'
  recipient_type text, -- 'user' | 'counterparty'
  recipient_ref text, -- hashed / id
  body_preview text,
  status text not null default 'pending', -- pending|approved|rejected|sent|expired
  requested_by uuid, -- agent/system actor
  approved_by uuid, -- must be human
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_outreach_approvals_draft_id on outreach_approvals (draft_id);
create index if not exists idx_outreach_approvals_status on outreach_approvals (status);

-- license_verifications: append-only record of partner license checks.
-- partner_id FK added in 0004 (partners does not exist yet).
create table if not exists license_verifications (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null,
  license_type text,
  license_number text,
  verified_by uuid, -- human actor
  method text, -- e.g. manual_registry_check
  result text, -- 'verified' | 'failed' | 'expired'
  evidence_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_license_verifications_partner_id on license_verifications (partner_id);

-- data_requests: export/delete intake. NOT append-only (status transitions).
create table if not exists data_requests (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid,
  subject_email_hash text,
  kind text not null, -- 'export' | 'delete'
  status text not null default 'received', -- received|verifying|processing|completed|rejected
  export_artifact_url text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_data_requests_subject_email_hash on data_requests (subject_email_hash);

-- unsubscribes: append-only opt-out ledger.
create table if not exists unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  channel text not null default 'all', -- 'email' | 'sms' | 'all'
  created_at timestamptz not null default now()
);
create index if not exists idx_unsubscribes_email_hash on unsubscribes (email_hash);
