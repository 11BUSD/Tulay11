-- seed.sql
-- Idempotent seed (ON CONFLICT DO NOTHING). All partner/offer/ambassador data is
-- clearly marked [SAMPLE] and is NOT a real partner deal or affiliate term.

-- ---------------------------------------------------------------------------
-- 10 settlement pillars (sort_order 1..10)
-- ---------------------------------------------------------------------------
insert into settlement_pillars (slug, name, description, sort_order, icon) values
  ('banking',          'Banking',            'Open a bank account and build credit.',        1,  'bank'),
  ('phone_internet',   'Phone & Internet',   'Get connected with a phone and internet plan.', 2,  'wifi'),
  ('housing',          'Housing',            'Find a place to live.',                         3,  'home'),
  ('tenant_insurance', 'Tenant Insurance',   'Protect your home and belongings.',             4,  'shield'),
  ('jobs',             'Jobs',               'Find work and grow your career.',               5,  'briefcase'),
  ('healthcare',       'Healthcare',         'Register for health coverage and find care.',   6,  'heart'),
  ('tax_benefits',     'Tax & Benefits',     'File taxes and access benefits.',               7,  'receipt'),
  ('transportation',   'Transportation',     'Get around: transit, driving, and more.',       8,  'bus'),
  ('remittance',       'Remittance',         'Send money home safely and affordably.',        9,  'globe'),
  ('community_life',   'Community Life',      'Connect with community and settle in.',         10, 'users')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Sample partners (all [SAMPLE], not real deals). Two are licensed/regulated
-- with license_verified_at set (tenant insurance broker + remittance provider).
-- Stable ids so offers/agreements can reference them idempotently.
-- ---------------------------------------------------------------------------
insert into partners (
  id, name, category, website, contact_email, phone, location,
  languages_supported, newcomer_focus, filipino_focus, ontario_focus,
  licensed_required, license_type, license_number, license_verified_at, regulator,
  status, notes
) values
  ('11111111-1111-1111-1111-111111111101',
   '[SAMPLE] Maple Newcomer Bank', 'banking', 'https://example.com/sample-bank',
   'partners@example.com', '+1-416-555-0101', 'Toronto, ON',
   '{en,tl}', true, true, true,
   false, null, null, null, null,
   'active', 'seed/sample data — not a real partner deal'),

  ('11111111-1111-1111-1111-111111111102',
   '[SAMPLE] ConnectMobile Canada', 'phone_internet', 'https://example.com/sample-mobile',
   'partners@example.com', '+1-416-555-0102', 'Mississauga, ON',
   '{en,tl,fil}', true, true, true,
   false, null, null, null, null,
   'active', 'seed/sample data — not a real partner deal'),

  ('11111111-1111-1111-1111-111111111103',
   '[SAMPLE] SafeHome Insurance Brokers', 'tenant_insurance', 'https://example.com/sample-insurance',
   'partners@example.com', '+1-416-555-0103', 'Toronto, ON',
   '{en}', true, false, true,
   true, 'insurance_broker', 'FSRA-SAMPLE-0001', now(), 'FSRA',
   'active', 'seed/sample data — not a real partner deal'),

  ('11111111-1111-1111-1111-111111111104',
   '[SAMPLE] PadreLink Remittance', 'remittance', 'https://example.com/sample-remittance',
   'partners@example.com', '+1-416-555-0104', 'Scarborough, ON',
   '{en,tl,fil}', true, true, true,
   true, 'money_services_business', 'FINTRAC-SAMPLE-0002', now(), 'FINTRAC',
   'active', 'seed/sample data — not a real partner deal'),

  ('11111111-1111-1111-1111-111111111105',
   '[SAMPLE] BridgeWork Jobs Board', 'jobs', 'https://example.com/sample-jobs',
   'partners@example.com', '+1-416-555-0105', 'Toronto, ON',
   '{en,tl}', true, true, true,
   false, null, null, null, null,
   'active', 'seed/sample data — not a real partner deal')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- One sample offer per partner. tracking_code = SEED-<pillar>-01, placeholder
-- destination_url, realistic-but-clearly-seed cents. Varied offer_type.
-- ---------------------------------------------------------------------------
insert into partner_offers (
  partner_id, title, description, settlement_pillar, offer_type, destination_url,
  tracking_code, commission_type, commission_value_cents, user_reward_value_cents,
  city_targets, language_targets, active, priority_score, compliance_notes, status
) values
  ('11111111-1111-1111-1111-111111111101',
   '[SAMPLE] Newcomer chequing account', 'Sample offer — no real terms.',
   'banking', 'referral', 'https://example.com/sample',
   'SEED-banking-01', 'fixed', 5000, 2500,
   '{Toronto}', '{en,tl}', true, 100, 'seed/sample offer', 'live'),

  ('11111111-1111-1111-1111-111111111102',
   '[SAMPLE] Prepaid mobile plan', 'Sample offer — no real terms.',
   'phone_internet', 'affiliate_link', 'https://example.com/sample',
   'SEED-phone_internet-01', 'percentage', 0, 1000,
   '{Mississauga}', '{en,tl,fil}', true, 90, 'seed/sample offer', 'live'),

  ('11111111-1111-1111-1111-111111111103',
   '[SAMPLE] Tenant insurance quote', 'Sample offer — regulated; licensed partner only.',
   'tenant_insurance', 'lead_form', 'https://example.com/sample',
   'SEED-tenant_insurance-01', 'fixed', 3000, 0,
   '{Toronto}', '{en}', true, 80, 'seed/sample offer — regulated (FSRA)', 'live'),

  ('11111111-1111-1111-1111-111111111104',
   '[SAMPLE] First remittance transfer', 'Sample offer — regulated; licensed partner only.',
   'remittance', 'referral', 'https://example.com/sample',
   'SEED-remittance-01', 'recurring', 1500, 1000,
   '{Scarborough}', '{en,tl,fil}', true, 95, 'seed/sample offer — regulated (FINTRAC)', 'live'),

  ('11111111-1111-1111-1111-111111111105',
   '[SAMPLE] Job board premium listing', 'Sample offer — no real terms.',
   'jobs', 'sponsored', 'https://example.com/sample',
   'SEED-jobs-01', 'manual', 0, 0,
   '{Toronto}', '{en,tl}', true, 70, 'seed/sample offer', 'live')
on conflict (tracking_code) do nothing;

-- ---------------------------------------------------------------------------
-- One commission rule per commission_type (global defaults, partner_offer_id null).
-- Idempotent via a stable id per rule.
-- ---------------------------------------------------------------------------
insert into commission_rules (
  id, partner_offer_id, commission_type, value_cents, percentage_bps,
  recurring_interval, recurring_max_periods, min_value_cents, max_value_cents, active
) values
  ('22222222-2222-2222-2222-222222222201', null, 'fixed',      5000, null, null,      null, null, null, true),
  ('22222222-2222-2222-2222-222222222202', null, 'percentage', null, 1000, null,      null, null, null, true),
  ('22222222-2222-2222-2222-222222222203', null, 'recurring',  1500, null, 'monthly', 12,   null, null, true),
  ('22222222-2222-2222-2222-222222222204', null, 'manual',     null, null, null,      null, null, null, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1 [SAMPLE] ambassador, 20% split, filipino_focus.
-- ---------------------------------------------------------------------------
insert into ambassadors (
  id, name, email, phone, referral_code, languages, city,
  filipino_focus, split_percentage_bps, status
) values
  ('33333333-3333-3333-3333-333333333301',
   '[SAMPLE] Ambassador Reyes', 'ambassador.sample@example.com', '+1-416-555-0201',
   'SEED-AMB-01', '{en,tl,fil}', 'Toronto', true, 2000, 'active')
on conflict (referral_code) do nothing;

-- ---------------------------------------------------------------------------
-- A couple of consent records (append-only ledger). purpose lead_referral,
-- granted true, keyed by subject_email_hash (v1: prefixed sample hashes).
-- Guarded so re-running the seed does not append duplicate rows.
-- ---------------------------------------------------------------------------
insert into consent_records (
  subject_email_hash, purpose, data_categories, shared_with,
  consequences_text, consent_text_version, basis, granted
)
select
  'v1:sample-hash-lead-0001', 'lead_referral', '{name,email}', 'none',
  'Sample consent record for seed data.', '1.0.0', 'express', true
where not exists (
  select 1 from consent_records
  where subject_email_hash = 'v1:sample-hash-lead-0001' and purpose = 'lead_referral'
);

insert into consent_records (
  subject_email_hash, purpose, data_categories, shared_with,
  consequences_text, consent_text_version, basis, granted
)
select
  'v1:sample-hash-lead-0002', 'lead_referral', '{name,email,phone}',
  '[SAMPLE] SafeHome Insurance Brokers',
  'Sample consent record for seed data.', '1.0.0', 'express', true
where not exists (
  select 1 from consent_records
  where subject_email_hash = 'v1:sample-hash-lead-0002' and purpose = 'lead_referral'
);

-- ---------------------------------------------------------------------------
-- Demo profiles + users for tests: one admin, one regular user.
-- profiles.role='admin' is the authorization source of truth.
-- ---------------------------------------------------------------------------
insert into profiles (id, role, display_name, preferred_language, city) values
  ('44444444-4444-4444-4444-444444444401', 'admin', '[SAMPLE] Admin Demo',  'en', 'Toronto'),
  ('44444444-4444-4444-4444-444444444402', 'user',  '[SAMPLE] Newcomer Demo', 'tl', 'Toronto')
on conflict (id) do nothing;

insert into users (id, email, display_name, preferred_language, city, role, is_admin) values
  ('44444444-4444-4444-4444-444444444401', 'admin.demo@example.com', '[SAMPLE] Admin Demo', 'en', 'Toronto', 'admin', true),
  ('44444444-4444-4444-4444-444444444402', 'newcomer.demo@example.com', '[SAMPLE] Newcomer Demo', 'tl', 'Toronto', 'user', false)
on conflict (id) do nothing;
