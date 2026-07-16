-- 0011_saved_resources.sql
-- Consumer "saved" list (Task 17). A lightweight table letting a user (or an
-- anonymous visitor keyed by a client ref) bookmark an offer or resource for
-- later. Kept minimal: no PII beyond the subject ref the client supplies.
--
-- RLS is enabled deny-by-default like every other table (0010 pattern); server
-- routes use the service role which bypasses RLS.

create table if not exists saved_resources (
  id uuid primary key default gen_random_uuid(),
  -- Opaque subject reference: a profile id, anonymous id, or client token.
  subject_ref text not null,
  offer_id uuid references partner_offers (id) on delete set null,
  pillar text,
  title text not null,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_saved_resources_subject_ref
  on saved_resources (subject_ref);

-- Prevent duplicate saves of the same offer for the same subject.
create unique index if not exists uq_saved_resources_subject_offer
  on saved_resources (subject_ref, offer_id)
  where offer_id is not null;

alter table saved_resources enable row level security;
alter table saved_resources force row level security;
