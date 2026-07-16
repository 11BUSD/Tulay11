-- 0001_extensions_and_enums.sql
-- Extensions + all enum types. Applied first (everything else depends on these).
-- Raw SQL, applied in sorted order by scripts/db.mjs (no Supabase CLI).

-- pgcrypto: gen_random_uuid() for PKs, digest()/hmac() for hashing helpers.
create extension if not exists pgcrypto;

-- Partner lifecycle status.
do $$ begin
  create type partner_status as enum (
    'prospect', 'contacted', 'in_review', 'active', 'paused', 'rejected'
  );
exception when duplicate_object then null; end $$;

-- Offer surface type.
do $$ begin
  create type offer_type as enum (
    'referral', 'affiliate_link', 'coupon', 'manual_intro', 'lead_form', 'sponsored'
  );
exception when duplicate_object then null; end $$;

-- Commission calculation strategy.
do $$ begin
  create type commission_type as enum (
    'fixed', 'percentage', 'recurring', 'manual'
  );
exception when duplicate_object then null; end $$;

-- Payout lifecycle status. 'paid' is terminal + immutable (see 0009 trigger).
do $$ begin
  create type payout_status as enum (
    'pending', 'approved', 'paid', 'rejected'
  );
exception when duplicate_object then null; end $$;

-- Referral conversion validation state.
do $$ begin
  create type conversion_status as enum (
    'pending', 'validated', 'rejected'
  );
exception when duplicate_object then null; end $$;

-- Partner agreement lifecycle.
do $$ begin
  create type agreement_status as enum (
    'draft', 'sent', 'signed', 'expired', 'terminated'
  );
exception when duplicate_object then null; end $$;

-- 10-state outreach message state machine (see src/lib/outreach/state-machine.ts).
do $$ begin
  create type outreach_message_state as enum (
    'not_started', 'drafted', 'approved', 'sent', 'follow_up_due',
    'replied', 'meeting_booked', 'rejected', 'agreement_pending', 'active_partner'
  );
exception when duplicate_object then null; end $$;
