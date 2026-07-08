-- 026_pod_invite_short_code.sql
-- Replace the 256-bit base64url share token with a short, human-typeable
-- 8-char Crockford base32 code. The code IS the credential, delivered three
-- ways (typed / QR / link). create_pod_invite mints a code; consume_pod_invite
-- normalizes typed input before hashing; both reuse the existing HMAC
-- token_hash store (migrations 005/017/025). See docs/POD-PAIRING/README.md.
--
-- Deferred to a follow-up (documented in the design): brute-force rate limiting
-- (needs a non-raising consume contract) and the in-app QR camera scanner.
-- The 8-char Crockford code is ~2^40 with 24h single-use expiry, so online
-- guessing is already impractical.

create extension if not exists pgcrypto with schema extensions;

create or replace function normalize_invite_code(p_code text)
returns text
language sql
immutable
as $$
  select translate(
    regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'),
    'ILOU',
    '110V'
  );
$$;

create or replace function generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes  bytea := extensions.gen_random_bytes(8);
  v_code   text := '';
  i        int;
begin
  for i in 0..7 loop
    v_code := v_code || substr(alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

create or replace function create_pod_invite()
returns table(token text, expires_at timestamptz, pod_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user         text;
  v_pod          uuid;
  v_member_count int;
  v_token        text;
  v_expires      timestamptz;
  v_ttl          interval;
  v_attempt      int;
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  select pm.pod_id
    into v_pod
    from pod_members pm
    join pods p on p.id = pm.pod_id
   where pm.user_id = v_user
     and p.archived_at is null
   limit 1;

  if v_pod is not null then
    perform 1
      from pods
     where pods.id = v_pod
       and pods.archived_at is null
       for update;

    if not found then
      v_pod := null;
    else
      select count(*)::int
        into v_member_count
        from pod_members
       where pod_members.pod_id = v_pod;

      if v_member_count >= 2 then
        raise exception 'already_in_a_pod' using errcode = 'P0001';
      end if;

      update pod_invites
         set expires_at = now()
       where pod_invites.pod_id = v_pod
         and pod_invites.consumed_at is null
         and pod_invites.expires_at > now();
    end if;
  end if;

  if v_pod is null then
    insert into pods default values returning id into v_pod;
    insert into pod_members(pod_id, user_id) values (v_pod, v_user);
  end if;

  v_ttl     := interval '24 hours';
  v_expires := now() + v_ttl;

  for v_attempt in 1..6 loop
    v_token := generate_invite_code();
    begin
      insert into pod_invites(pod_id, inviter_user_id, token_hash, expires_at)
      values (v_pod, v_user, hash_invite_token(normalize_invite_code(v_token)), v_expires);
      exit;
    exception when unique_violation then
      if v_attempt >= 6 then
        raise exception 'unknown' using errcode = 'P0001';
      end if;
    end;
  end loop;

  token       := v_token;
  expires_at  := v_expires;
  pod_id      := v_pod;
  return next;
end;
$$;

revoke all on function create_pod_invite() from public;
grant execute on function create_pod_invite() to authenticated;

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

  v_hash := hash_invite_token(normalize_invite_code(p_token));

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

  perform 1 from pods where pods.id = v_invite.pod_id for update;

  if exists (
    select 1 from pods
    where pods.id = v_invite.pod_id and pods.archived_at is not null
  ) then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

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

  if exists (
    select 1 from pod_members pm join pods p on p.id = pm.pod_id
    where pm.user_id = v_user and p.archived_at is null and pm.pod_id <> v_invite.pod_id
  ) then
    raise exception 'consumer_already_in_a_pod' using errcode = 'P0001';
  end if;

  if (select count(*) from pod_members where pod_members.pod_id = v_invite.pod_id) >= 2 then
    raise exception 'pod_full' using errcode = 'P0001';
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
