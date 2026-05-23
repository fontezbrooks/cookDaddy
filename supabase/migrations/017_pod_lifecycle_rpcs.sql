-- 017_pod_lifecycle_rpcs.sql
-- Source: docs/DESIGN/README.md §8 + docs/WORKFLOW/README.md §8
-- P5 server side: create / consume / dissolve pod invites + notify trigger
-- (the push fan-out worker that listens for the notification ships in P11).
--
-- Why SECURITY DEFINER everywhere: pod_members inserts/deletes have no RLS
-- policy for the `authenticated` role on purpose — clients must go through
-- these RPCs so we can enforce one-pod-per-user, token validation, and the
-- notify trigger atomically. SECURITY DEFINER also lets us cross-read
-- pod_members for the partner without tripping is_pod_member()'s RLS.

create extension if not exists pgcrypto with schema extensions;

-- The HMAC secret used to hash invite tokens is read from the
-- `app.pod_invite_secret` GUC if set, otherwise falls back to the dev value
-- baked into hash_invite_token(). For prod, set it once via Supabase Vault
-- (or have ops run `alter database "postgres" set app.pod_invite_secret = ...`
-- under a privileged role) and the function picks it up on the next session.
-- We deliberately do NOT issue an `alter database ... set` here because the
-- managed `postgres` role on Supabase cloud lacks the privilege.

-- ─────────────────────────────────────────────────────────────────────────────
-- hash_invite_token(raw): HMAC-SHA256 with the server-side secret. The raw
-- token only exists in flight (returned once by create_pod_invite, consumed
-- once by consume_pod_invite); the column stores hex of the HMAC.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function hash_invite_token(p_token text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(
    extensions.hmac(
      p_token::bytea,
      coalesce(
        current_setting('app.pod_invite_secret', true),
        'cookdaddy-local-dev-invite-secret-rotate-in-prod'
      )::bytea,
      'sha256'
    ),
    'hex'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- create_pod_invite(): caller must be authenticated and not already in an
-- active pod. Creates the pod with the caller as the sole member, generates a
-- 256-bit random token, persists only its HMAC, and returns the raw token
-- (plus expiry + pod_id) so the client can build the share link.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function create_pod_invite()
returns table(token text, expires_at timestamptz, pod_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user    text;
  v_pod     uuid;
  v_token   text;
  v_expires timestamptz;
  v_ttl     interval;
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from pod_members pm
    join pods p on p.id = pm.pod_id
    where pm.user_id = v_user
      and p.archived_at is null
  ) then
    raise exception 'already_in_a_pod' using errcode = 'P0001';
  end if;

  insert into pods default values returning id into v_pod;
  insert into pod_members(pod_id, user_id) values (v_pod, v_user);

  -- base64url of 32 random bytes → 43-char URL-safe token, 256-bit entropy.
  v_token := translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );
  -- 24h default lifetime per DESIGN §8.2. Long enough for "send link, go to
  -- work, partner taps after dinner"; short enough that lost links die quickly.
  v_ttl     := interval '24 hours';
  v_expires := now() + v_ttl;

  insert into pod_invites(pod_id, inviter_user_id, token_hash, expires_at)
  values (v_pod, v_user, hash_invite_token(v_token), v_expires);

  token       := v_token;
  expires_at  := v_expires;
  pod_id      := v_pod;
  return next;
end;
$$;

revoke all on function create_pod_invite() from public;
grant execute on function create_pod_invite() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- consume_pod_invite(raw_token): authenticated user trades a raw token for
-- pod membership. Re-tap by the same consumer is idempotent
-- (already_member=true); the inviter cannot consume their own; a third party
-- cannot consume an already-used invite; expired tokens reject.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function consume_pod_invite(p_token text)
returns table(pod_id uuid, already_member boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user   text;
  v_hash   text;
  v_invite record;
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  v_hash := hash_invite_token(p_token);

  select pi.id, pi.pod_id, pi.inviter_user_id, pi.expires_at,
         pi.consumed_at, pi.consumed_by
    into v_invite
    from pod_invites pi
   where pi.token_hash = v_hash;

  if v_invite.id is null then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  if v_invite.inviter_user_id = v_user then
    raise exception 'cannot_consume_own_invite' using errcode = 'P0001';
  end if;

  -- Same-user re-tap → idempotent success.
  if v_invite.consumed_at is not null and v_invite.consumed_by = v_user then
    pod_id          := v_invite.pod_id;
    already_member  := true;
    return next;
    return;
  end if;

  if v_invite.consumed_at is not null then
    raise exception 'invite_already_consumed' using errcode = 'P0001';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  -- Consumer must not already be in a different active pod.
  if exists (
    select 1
    from pod_members pm
    join pods p on p.id = pm.pod_id
    where pm.user_id = v_user
      and p.archived_at is null
      and pm.pod_id <> v_invite.pod_id
  ) then
    raise exception 'consumer_already_in_a_pod' using errcode = 'P0001';
  end if;

  insert into pod_members(pod_id, user_id) values (v_invite.pod_id, v_user);

  update pod_invites
     set consumed_at = now(),
         consumed_by = v_user
   where id = v_invite.id;

  pod_id          := v_invite.pod_id;
  already_member  := false;
  return next;
end;
$$;

revoke all on function consume_pod_invite(text) from public;
grant execute on function consume_pod_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- dissolve_pod(pod_id): either partner ends the pod. Soft-deletes via
-- archived_at and removes pod_members rows so the partner's app, on
-- foreground, detects "missing from pod_members" → partner-removed-me UX
-- (DESIGN §16.1).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function dissolve_pod(p_pod_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user text;
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from pod_members
    where pod_id = p_pod_id and user_id = v_user
  ) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  update pods set archived_at = now()
   where id = p_pod_id and archived_at is null;

  delete from pod_members where pod_id = p_pod_id;
end;
$$;

revoke all on function dissolve_pod(uuid) from public;
grant execute on function dissolve_pod(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- notify_pod_invite_consumed: fires on the consumed_at write inside the
-- consume RPC. Payload is enough for the P11 push fan-out worker to find
-- both members without re-querying.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function notify_pod_invite_consumed_fn() returns trigger
language plpgsql as $$
begin
  if new.consumed_at is not null
     and (old.consumed_at is null or old.consumed_at is distinct from new.consumed_at) then
    perform pg_notify(
      'pod_invite.consumed',
      jsonb_build_object(
        'invite_id',        new.id,
        'pod_id',           new.pod_id,
        'inviter_user_id',  new.inviter_user_id,
        'consumer_user_id', new.consumed_by,
        'consumed_at',      new.consumed_at
      )::text
    );
  end if;
  return new;
end;
$$;

create trigger trg_notify_pod_invite_consumed
  after update on pod_invites
  for each row execute function notify_pod_invite_consumed_fn();
