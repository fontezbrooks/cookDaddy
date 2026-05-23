-- supabase/seed.sql
-- Loaded automatically by `supabase db reset` after migrations.
-- ONLY runs on the local Supabase stack — never deployed to prod.
-- Use this file for: pgTAP, test-only helper functions, fixture data for manual dev.

-- ─────────────────────────────────────────────────────────────────────────────
-- pgTAP — testing framework. Local-only; prod migrations never reference this.
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pgtap with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- `tests` schema: utility functions for impersonating Clerk users in pgTAP tests.
-- Tests call e.g. `select tests.as_user('user_alice')` before exercising RLS.
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists tests;

-- Make helpers usable from every Postgres role pg_prove may connect as
-- (authenticated / anon / service_role / postgres). The functions internally
-- do `set local role` for impersonation; the schema itself stays open.
grant usage on schema tests to public;

-- Impersonate a Clerk user: set the JWT claims AND switch to the authenticated role.
-- Both are required for RLS to behave like a real PostgREST request.
create or replace function tests.as_user(p_user_id text)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
end;
$$;

-- Switch to anon: empty claims, anon role. Models a logged-out PostgREST request.
create or replace function tests.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end;
$$;

-- Switch back to the service role (no RLS). Used to set up fixtures before testing.
create or replace function tests.as_service()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role service_role;
end;
$$;

-- Seed two test users (Alice + Bob + Carol) at known Clerk ids. Idempotent.
create or replace function tests.seed_three_users()
returns void
language plpgsql
as $$
begin
  perform tests.as_service();
  insert into public.users(id, display_name) values
    ('user_alice', 'Alice'),
    ('user_bob', 'Bob'),
    ('user_carol', 'Carol')
  on conflict (id) do nothing;
end;
$$;

-- Seed a pod with Alice + Bob as the two members. Returns the pod id.
create or replace function tests.seed_paired_pod()
returns uuid
language plpgsql
as $$
declare
  v_pod uuid;
begin
  perform tests.seed_three_users();
  perform tests.as_service();
  insert into public.pods default values returning id into v_pod;
  insert into public.pod_members(pod_id, user_id) values
    (v_pod, 'user_alice'),
    (v_pod, 'user_bob');
  return v_pod;
end;
$$;

-- Seed a single recipe and return its id. Useful for swipe/match tests.
create or replace function tests.seed_recipe(p_title text default 'Test Recipe')
returns uuid
language plpgsql
as $$
declare
  v_recipe uuid;
  v_ext bigint := (extract(epoch from clock_timestamp()) * 1000000)::bigint;
begin
  perform tests.as_service();
  insert into public.recipes(external_id, title, raw_payload)
  values (v_ext, p_title, '{}'::jsonb)
  returning id into v_recipe;
  return v_recipe;
end;
$$;

grant execute on all functions in schema tests to public;
