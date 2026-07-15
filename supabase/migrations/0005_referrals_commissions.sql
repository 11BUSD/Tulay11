-- 0005_referrals_commissions.sql
-- Referral tracking, commission rules, payouts, revenue attribution.
-- Money = BIGINT cents, percentages = integer basis points, CHECK (>= 0).
-- ambassador_id FKs are added in 0006 (ambassadors created there).

-- referral_clicks: externally-visible referral token -> click record.
create table if not exists referral_clicks (
  id uuid primary key default gen_random_uuid(),
  referral_id text unique not null, -- externally-visible token
  user_id uuid references users (id) on delete set null,
  anonymous_id text,
  ambassador_id uuid, -- FK -> ambassadors added in 0006
  partner_offer_id uuid not null references partner_offers (id) on delete cascade,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  ip_hash text, -- hashed, never raw
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_referral_clicks_partner_offer_id on referral_clicks (partner_offer_id);
create index if not exists idx_referral_clicks_ambassador_id on referral_clicks (ambassador_id);
create index if not exists idx_referral_clicks_created_at on referral_clicks (created_at);

-- commission_rules: how a conversion's commission is computed.
-- percentage stored as basis points (int) so all math stays integer.
create table if not exists commission_rules (
  id uuid primary key default gen_random_uuid(),
  partner_offer_id uuid references partner_offers (id) on delete cascade, -- null = global/default
  commission_type commission_type not null,
  value_cents bigint check (value_cents is null or value_cents >= 0),
  percentage_bps int check (percentage_bps is null or percentage_bps >= 0),
  recurring_interval text, -- 'monthly' etc.
  recurring_max_periods int,
  min_value_cents bigint check (min_value_cents is null or min_value_cents >= 0),
  max_value_cents bigint check (max_value_cents is null or max_value_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_commission_rules_partner_offer_id on commission_rules (partner_offer_id);

-- referral_conversions: a validated/attributed conversion from a click.
create table if not exists referral_conversions (
  id uuid primary key default gen_random_uuid(),
  referral_click_id uuid references referral_clicks (id) on delete set null,
  partner_offer_id uuid not null references partner_offers (id) on delete cascade,
  user_id uuid references users (id) on delete set null,
  anonymous_id text,
  status conversion_status not null default 'pending',
  gross_value_cents bigint check (gross_value_cents is null or gross_value_cents >= 0),
  commission_amount_cents bigint check (commission_amount_cents is null or commission_amount_cents >= 0),
  commission_rule_id uuid references commission_rules (id) on delete set null,
  external_conversion_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_referral_conversions_referral_click_id on referral_conversions (referral_click_id);
-- Idempotency: unique external_conversion_id where present.
create unique index if not exists uq_referral_conversions_external_id
  on referral_conversions (external_conversion_id)
  where external_conversion_id is not null;

-- payouts: money owed to ambassador/user/partner. 'paid' is immutable (0009).
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  conversion_id uuid references referral_conversions (id) on delete set null,
  ambassador_id uuid, -- FK -> ambassadors added in 0006
  partner_id uuid references partners (id) on delete set null,
  payee_type text not null, -- 'ambassador' | 'user' | 'partner'
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'CAD',
  status payout_status not null default 'pending',
  parent_payout_id uuid references payouts (id) on delete set null, -- for splits
  paid_at timestamptz,
  external_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_payouts_status on payouts (status);
create index if not exists idx_payouts_ambassador_id on payouts (ambassador_id);
create index if not exists idx_payouts_conversion_id on payouts (conversion_id);

-- revenue_attribution_events: append-only-ish ledger of revenue events.
create table if not exists revenue_attribution_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null, -- 'click' | 'conversion' | 'payout' | 'manual'
  partner_id uuid references partners (id) on delete set null,
  partner_offer_id uuid references partner_offers (id) on delete set null,
  conversion_id uuid references referral_conversions (id) on delete set null,
  ambassador_id uuid, -- FK -> ambassadors added in 0006
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  currency text not null default 'CAD',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_revenue_events_type_occurred on revenue_attribution_events (event_type, occurred_at);
create index if not exists idx_revenue_events_partner_offer_id on revenue_attribution_events (partner_offer_id);
