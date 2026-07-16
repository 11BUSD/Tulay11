-- 0010_rls.sql
-- Enable Row Level Security on every table, deny-by-default.
--
-- Deny-by-default = RLS enabled with NO policies, so anon/authenticated clients
-- can read/write nothing. Server route handlers use the Supabase SERVICE-ROLE
-- key, which BYPASSES RLS, so all app traffic goes through the API. This is
-- defense-in-depth; if direct anon reads of active offers are ever needed, add a
-- scoped SELECT policy on partner_offers WHERE active (see data-partneros BQ1).

do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'users',
    'consent_records', 'audit_logs', 'outreach_approvals',
    'license_verifications', 'data_requests', 'unsubscribes',
    'settlement_pillars', 'partners', 'partner_offers', 'partner_agreements',
    'due_diligence_reviews',
    'referral_clicks', 'commission_rules', 'referral_conversions', 'payouts',
    'revenue_attribution_events',
    'ambassadors', 'ambassador_referrals',
    'outreach_contacts', 'outreach_campaigns', 'outreach_messages',
    'agent_runs', 'agent_tasks'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security;', t);
    -- FORCE so even the table owner is subject to RLS (service role still bypasses).
    execute format('alter table %I force row level security;', t);
  end loop;
end $$;
