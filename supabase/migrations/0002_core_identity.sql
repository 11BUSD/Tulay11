-- 0002_core_identity.sql
-- Core identity tables.
--
-- Relationship note:
--   `profiles` is the app's user-profile source of truth, keyed by the auth
--   user id (Supabase Auth `auth.users.id`). `profiles.role` ('admin' etc.) is
--   what requireAdmin()/requireRole('admin') check server-side (the plan uses
--   profiles.role='admin').
--   `users` is the app-domain user record used for foreign-key references from
--   domain tables (consent, referrals, conversions, ...). It carries its own
--   `role`/`is_admin` for convenience, but authorization derives from `profiles`.
--   For a real auth user, profiles.id == users.id (both == auth.users.id); the
--   split keeps auth-profile concerns separate from domain references.

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(), -- == auth.users.id for real users
  role text not null default 'user', -- 'user' | 'ambassador' | 'admin'
  display_name text,
  preferred_language text not null default 'en',
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique, -- stored lower-cased (see trigger below)
  anonymous_id text, -- links pre-auth activity
  display_name text,
  preferred_language text not null default 'en',
  city text,
  role text not null default 'user', -- 'user' | 'ambassador' | 'admin'
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_email on users (email);
create index if not exists idx_users_anonymous_id on users (anonymous_id);

-- Lower-case emails on write so uniqueness is case-insensitive.
create or replace function lower_user_email() returns trigger as $$
begin
  if new.email is not null then
    new.email := lower(new.email);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_lower_email on users;
create trigger trg_users_lower_email
  before insert or update of email on users
  for each row execute function lower_user_email();
