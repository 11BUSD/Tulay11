-- 0004_partners_offers.sql
-- DATA-MODEL-OWNED: settlement pillars, partners, offers, agreements, DD reviews.
-- Money = BIGINT cents with CHECK (>= 0). Exact fields per data-partneros.md.

-- settlement_pillars: the 10 newcomer settlement categories.
create table if not exists settlement_pillars (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  sort_order int not null default 0,
  icon text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- partners: partner/affiliate records. Licensing columns are written via the
-- compliance layer (license_verifications) but declared here.
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  website text,
  contact_email text,
  phone text,
  location text,
  languages_supported text[] not null default '{}',
  newcomer_focus boolean not null default false,
  filipino_focus boolean not null default false,
  ontario_focus boolean not null default false,
  licensed_required boolean not null default false,
  license_type text,
  license_number text,
  license_verified_at timestamptz,
  regulator text, -- e.g. FSRA
  status partner_status not null default 'prospect',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_partners_status on partners (status);
create index if not exists idx_partners_category on partners (category);
create index if not exists idx_partners_filipino_focus on partners (filipino_focus);
create index if not exists idx_partners_languages_supported on partners using gin (languages_supported);

-- Now that partners exists, wire the compliance license_verifications FK.
alter table license_verifications
  drop constraint if exists fk_license_verifications_partner;
alter table license_verifications
  add constraint fk_license_verifications_partner
  foreign key (partner_id) references partners (id) on delete cascade;

-- partner_offers: monetizable offers surfaced per pillar.
-- source_agreement_id FK added in 0004b-style ALTER below (partner_agreements
-- is created later in this same file, so we ALTER after it exists).
create table if not exists partner_offers (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners (id) on delete cascade,
  title text not null,
  description text,
  settlement_pillar text references settlement_pillars (slug),
  offer_type offer_type not null default 'referral',
  destination_url text,
  tracking_code text unique,
  commission_type commission_type not null default 'fixed',
  commission_value_cents bigint not null default 0 check (commission_value_cents >= 0),
  user_reward_value_cents bigint not null default 0 check (user_reward_value_cents >= 0),
  eligibility_rules jsonb not null default '{}',
  city_targets text[] not null default '{}',
  language_targets text[] not null default '{}',
  active boolean not null default true,
  priority_score int not null default 0,
  compliance_notes text,
  status text not null default 'live', -- 'pending' | 'live' | 'paused'
  source_agreement_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_partner_offers_pillar_active_priority
  on partner_offers (settlement_pillar, active, priority_score desc);
create index if not exists idx_partner_offers_partner_id on partner_offers (partner_id);
create index if not exists idx_partner_offers_city_targets on partner_offers using gin (city_targets);
create index if not exists idx_partner_offers_language_targets on partner_offers using gin (language_targets);

-- partner_agreements: negotiated terms per partner.
create table if not exists partner_agreements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners (id) on delete cascade,
  status agreement_status not null default 'draft',
  terms_summary text,
  document_url text,
  effective_at timestamptz,
  expires_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_partner_agreements_partner_id on partner_agreements (partner_id);

-- Wire partner_offers.source_agreement_id -> partner_agreements now that it exists.
alter table partner_offers
  drop constraint if exists fk_partner_offers_source_agreement;
alter table partner_offers
  add constraint fk_partner_offers_source_agreement
  foreign key (source_agreement_id) references partner_agreements (id) on delete set null;

-- due_diligence_reviews: vetting records per partner.
create table if not exists due_diligence_reviews (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners (id) on delete cascade,
  reviewer_id uuid,
  outcome text, -- 'pass' | 'fail' | 'needs_info'
  checklist jsonb,
  notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_due_diligence_reviews_partner_id on due_diligence_reviews (partner_id);
