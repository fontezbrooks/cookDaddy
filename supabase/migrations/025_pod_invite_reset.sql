-- 025_pod_invite_reset.sql
-- Production fix: make solo invite creation idempotent, reject archived-pod
-- invites, and expire outstanding links when a pod is dissolved.
--
-- Concurrency: every function that reads-then-mutates pod membership or
-- archival state first locks the pods row with SELECT ... FOR UPDATE. Because
-- all three RPCs acquire that same lock before touching pod_members / invites,
-- their member-count and archived_at checks are race-free (and deadlock-free,
-- since the pods row is always the first lock taken).

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
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  -- Find the caller's current active pod (if any).
  select pm.pod_id
    into v_pod
    from pod_members pm
    join pods p on p.id = pm.pod_id
   where pm.user_id = v_user
     and p.archived_at is null
   limit 1;

  if v_pod is not null then
    -- Lock the pod row BEFORE reading the member count so a concurrent
    -- consume_pod_invite()/dissolve_pod() cannot mutate membership between the
    -- count and our decision. If the pod was archived (dissolved) between the
    -- lookup and the lock, FOUND is false here and we fall through to create a
    -- fresh solo pod below.
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

  -- base64url of 32 random bytes -> 43-char URL-safe token, 256-bit entropy.
  v_token := translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );
  -- 24h default lifetime per DESIGN section 8.2. Long enough for "send link, go
  -- to work, partner taps after dinner"; short enough that lost links die fast.
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

  -- Lock the invite's pod so the archival re-check, the consumer-in-another-pod
  -- guard, the member-count cap, and the member insert below all evaluate
  -- against a stable row -- serialized with concurrent create_pod_invite()/
  -- consume_pod_invite()/dissolve_pod() on the same pod.
  perform 1 from pods where pods.id = v_invite.pod_id for update;

  if exists (
    select 1
    from pods
    where pods.id = v_invite.pod_id
      and pods.archived_at is not null
  ) then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  -- Same-user re-tap -> idempotent success (only after confirming the pod is
  -- still active above, so a re-tap on a dissolved pod reports invite_expired).
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

  -- Lock the pod first so a concurrent create/consume cannot interleave a new
  -- member or invite between our checks and the archive+delete below.
  perform 1 from pods where pods.id = p_pod_id for update;

  if not exists (
    select 1 from pod_members
    where pod_id = p_pod_id and user_id = v_user
  ) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  update pod_invites
     set expires_at = now()
   where pod_id = p_pod_id
     and consumed_at is null
     and expires_at > now();

  update pods set archived_at = now()
   where id = p_pod_id and archived_at is null;

  delete from pod_members where pod_id = p_pod_id;
end;
$$;

revoke all on function dissolve_pod(uuid) from public;
grant execute on function dissolve_pod(uuid) to authenticated;
