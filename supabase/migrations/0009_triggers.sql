-- 0009_triggers.sql
-- Generic updated_at bump, paid-payout immutability, and append-only guards.
-- Append-only enforcement lives HERE (not RLS) because the service role bypasses
-- RLS; only a trigger can block UPDATE/DELETE for every role including service.

-- Generic BEFORE UPDATE trigger: bump updated_at on every mutable table.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'users', 'settlement_pillars', 'partners', 'partner_offers',
    'partner_agreements', 'due_diligence_reviews', 'commission_rules',
    'referral_conversions', 'payouts', 'ambassadors', 'outreach_contacts',
    'outreach_campaigns', 'outreach_messages', 'agent_runs', 'agent_tasks'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_set_updated_at on %I;', t);
    execute format(
      'create trigger trg_set_updated_at before update on %I
         for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- Paid payouts are immutable: block UPDATE and DELETE once status='paid'.
create or replace function enforce_payout_paid_immutable() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then
      raise exception 'payout % is paid and cannot be deleted', old.id
        using errcode = 'check_violation';
    end if;
    return old;
  end if;
  -- UPDATE
  if old.status = 'paid' then
    raise exception 'payout % is paid and is immutable', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_payout_paid_immutable on payouts;
create trigger trg_payout_paid_immutable
  before update or delete on payouts
  for each row execute function enforce_payout_paid_immutable();

-- Append-only guard: RAISE on any UPDATE or DELETE. Used on ledger tables that
-- must never be mutated (regulatory retention). data_requests is excluded on
-- purpose because its status legitimately transitions.
create or replace function enforce_append_only() returns trigger as $$
begin
  raise exception 'table % is append-only; % is not permitted',
    tg_table_name, tg_op
    using errcode = 'check_violation';
  return null;
end;
$$ language plpgsql;

do $$
declare
  t text;
  tables text[] := array[
    'consent_records', 'audit_logs', 'outreach_approvals',
    'license_verifications', 'unsubscribes'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_append_only on %I;', t);
    execute format(
      'create trigger trg_append_only before update or delete on %I
         for each row execute function enforce_append_only();', t);
  end loop;
end $$;
