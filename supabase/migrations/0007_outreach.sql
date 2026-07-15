-- 0007_outreach.sql
-- CRM / outreach tables. Includes the agent-authored draft/approval/dispatch
-- columns and the 10-state outreach_message_state enum used by the state machine.

create table if not exists outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references partners (id) on delete set null,
  name text,
  email text,
  phone text,
  role text,
  source text,
  status text,
  tags text[] not null default '{}',
  consent_status text not null default 'unknown', -- unknown|opted_in|opted_out|bounced
  consent_basis text,
  enrichment jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_outreach_contacts_partner_id on outreach_contacts (partner_id);
create index if not exists idx_outreach_contacts_email on outreach_contacts (email);

create table if not exists outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal text,
  channel text, -- 'email' | 'manual' etc.
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists outreach_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references outreach_campaigns (id) on delete cascade,
  contact_id uuid references outreach_contacts (id) on delete cascade,
  direction text, -- 'outbound' | 'inbound'
  subject text,
  body text,
  state outreach_message_state not null default 'not_started',
  draft_subject text,
  draft_body text,
  draft_reasoning text,
  draft_confidence numeric,
  draft_risk_flags jsonb,
  generated_by_run_id uuid,
  sequence_step int,
  dedupe_hash text,
  follow_up_due_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  sent_at timestamptz,
  provider_message_id text,
  simulated boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_outreach_messages_campaign_id on outreach_messages (campaign_id);
create index if not exists idx_outreach_messages_contact_id on outreach_messages (contact_id);
create index if not exists idx_outreach_messages_state on outreach_messages (state);
-- Dedupe: a second draft with the same hash is rejected.
create unique index if not exists uq_outreach_messages_dedupe_hash
  on outreach_messages (dedupe_hash)
  where dedupe_hash is not null;
