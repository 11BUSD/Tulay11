-- 0006_ambassadors.sql
-- Ambassadors + their attributed referrals. Created after referrals/payouts so
-- we can back-fill the ambassador_id FKs via ALTER (breaking the create-order
-- cycle between referral_clicks/payouts and ambassadors).

create table if not exists ambassadors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  name text not null,
  email text unique,
  phone text,
  referral_code text unique not null,
  languages text[] not null default '{}',
  city text,
  filipino_focus boolean not null default false,
  split_percentage_bps int not null default 0, -- their cut of commission (bps)
  status text not null default 'active', -- 'active' | 'paused' | 'inactive'
  payout_method jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ambassador_referrals (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references ambassadors (id) on delete cascade,
  referral_click_id uuid references referral_clicks (id) on delete set null,
  conversion_id uuid references referral_conversions (id) on delete set null,
  attributed_amount_cents bigint not null default 0 check (attributed_amount_cents >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_ambassador_referrals_ambassador_id on ambassador_referrals (ambassador_id);

-- Back-fill the ambassador_id FKs deferred from 0005.
alter table referral_clicks
  drop constraint if exists fk_referral_clicks_ambassador;
alter table referral_clicks
  add constraint fk_referral_clicks_ambassador
  foreign key (ambassador_id) references ambassadors (id) on delete set null;

alter table payouts
  drop constraint if exists fk_payouts_ambassador;
alter table payouts
  add constraint fk_payouts_ambassador
  foreign key (ambassador_id) references ambassadors (id) on delete set null;

alter table revenue_attribution_events
  drop constraint if exists fk_revenue_events_ambassador;
alter table revenue_attribution_events
  add constraint fk_revenue_events_ambassador
  foreign key (ambassador_id) references ambassadors (id) on delete set null;
