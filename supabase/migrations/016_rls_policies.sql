-- 016_rls_policies.sql
-- Source: docs/DESIGN/README.md §3.5
-- All RLS policies. Pod-scoped tables use is_pod_member(); user-scoped tables compare to
-- auth_user_id(); the catalog (recipes/recipe_ingredients) is readable to any authed user.
--
-- All policies are scoped to the `authenticated` role explicitly. The service_role bypasses
-- RLS entirely and is the only path for ingestion, pod-invite consumption, and push fan-out.

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS: read self + pod partner (so we can render their display name).
-- Write self only.
-- ─────────────────────────────────────────────────────────────────────────────
create policy users_self_or_partner_read on users
  for select to authenticated
  using (
    id = auth_user_id()
    or exists (
      select 1
      from pod_members pm1
      join pod_members pm2 on pm1.pod_id = pm2.pod_id
      where pm1.user_id = auth_user_id()
        and pm2.user_id = users.id
    )
  );

create policy users_self_insert on users
  for insert to authenticated
  with check (id = auth_user_id());

create policy users_self_update on users
  for update to authenticated
  using (id = auth_user_id())
  with check (id = auth_user_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- DIETARY_PROFILES: strict self-only. Never readable by partner (D4 / NFR-S3).
-- ─────────────────────────────────────────────────────────────────────────────
create policy dp_self on dietary_profiles
  for all to authenticated
  using (user_id = auth_user_id())
  with check (user_id = auth_user_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- PODS: members can read + update. Inserts happen via service_role only.
-- ─────────────────────────────────────────────────────────────────────────────
create policy pods_member_read on pods
  for select to authenticated
  using (is_pod_member(id, auth_user_id()));

create policy pods_member_update on pods
  for update to authenticated
  using (is_pod_member(id, auth_user_id()))
  with check (is_pod_member(id, auth_user_id()));

-- ─────────────────────────────────────────────────────────────────────────────
-- POD_MEMBERS: members can read (so each side can see who's in their pod).
-- Inserts/deletes happen via service_role only (invite-consume / dissolve RPCs).
-- ─────────────────────────────────────────────────────────────────────────────
create policy pm_read on pod_members
  for select to authenticated
  using (is_pod_member(pod_id, auth_user_id()));

-- ─────────────────────────────────────────────────────────────────────────────
-- POD_INVITES: only inviter can read their own invites (avoids token enumeration).
-- Consumption goes through a service_role RPC.
-- ─────────────────────────────────────────────────────────────────────────────
create policy invites_owner_read on pod_invites
  for select to authenticated
  using (inviter_user_id = auth_user_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- SESSIONS: pod-scoped. Insert happens via service_role RPC (start_session), but
-- members need read for lobby/active state.
-- ─────────────────────────────────────────────────────────────────────────────
create policy sessions_pod_read on sessions
  for select to authenticated
  using (is_pod_member(pod_id, auth_user_id()));

-- ─────────────────────────────────────────────────────────────────────────────
-- SWIPES: pod-scoped read; insert must match self + be pod-scoped.
-- ─────────────────────────────────────────────────────────────────────────────
create policy swipes_pod_read on swipes
  for select to authenticated
  using (is_pod_member(pod_id, auth_user_id()));

create policy swipes_self_insert on swipes
  for insert to authenticated
  with check (
    user_id = auth_user_id()
    and is_pod_member(pod_id, auth_user_id())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- MATCHES: pod-scoped read + update (mark cooked, soft-delete via removed_at).
-- Inserts happen inside submit_swipe (security definer); no client insert path.
-- ─────────────────────────────────────────────────────────────────────────────
create policy matches_pod_read on matches
  for select to authenticated
  using (is_pod_member(pod_id, auth_user_id()));

create policy matches_pod_update on matches
  for update to authenticated
  using (is_pod_member(pod_id, auth_user_id()))
  with check (is_pod_member(pod_id, auth_user_id()));

-- ─────────────────────────────────────────────────────────────────────────────
-- RECIPE_RATINGS: pod-scoped read; self-only write (your stars, not your partner's).
-- ─────────────────────────────────────────────────────────────────────────────
create policy rr_pod_read on recipe_ratings
  for select to authenticated
  using (is_pod_member(pod_id, auth_user_id()));

create policy rr_self_insert on recipe_ratings
  for insert to authenticated
  with check (
    user_id = auth_user_id()
    and is_pod_member(pod_id, auth_user_id())
  );

create policy rr_self_update on recipe_ratings
  for update to authenticated
  using (user_id = auth_user_id() and is_pod_member(pod_id, auth_user_id()))
  with check (user_id = auth_user_id() and is_pod_member(pod_id, auth_user_id()));

create policy rr_self_delete on recipe_ratings
  for delete to authenticated
  using (user_id = auth_user_id() and is_pod_member(pod_id, auth_user_id()));

-- ─────────────────────────────────────────────────────────────────────────────
-- RECIPE_NOTES: pod-scoped read + write (shared single body per match, D-10).
-- ─────────────────────────────────────────────────────────────────────────────
create policy rn_pod on recipe_notes
  for all to authenticated
  using (is_pod_member(pod_id, auth_user_id()))
  with check (
    is_pod_member(pod_id, auth_user_id())
    and last_edited_by = auth_user_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SHOPPING_LIST_ITEMS: pod-scoped CRUD.
-- ─────────────────────────────────────────────────────────────────────────────
create policy sli_pod on shopping_list_items
  for all to authenticated
  using (is_pod_member(pod_id, auth_user_id()))
  with check (is_pod_member(pod_id, auth_user_id()));

-- ─────────────────────────────────────────────────────────────────────────────
-- PANTRY_ITEMS: pod-scoped CRUD.
-- ─────────────────────────────────────────────────────────────────────────────
create policy pi_pod on pantry_items
  for all to authenticated
  using (is_pod_member(pod_id, auth_user_id()))
  with check (is_pod_member(pod_id, auth_user_id()));

-- ─────────────────────────────────────────────────────────────────────────────
-- PUSH_TOKENS: strict self-only.
-- ─────────────────────────────────────────────────────────────────────────────
create policy pt_self on push_tokens
  for all to authenticated
  using (user_id = auth_user_id())
  with check (user_id = auth_user_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- RECIPES / RECIPE_INGREDIENTS: public catalog, readable to any authed user.
-- Writes happen via service_role (ingestion).
-- ─────────────────────────────────────────────────────────────────────────────
create policy recipes_auth_read on recipes
  for select to authenticated
  using (auth_user_id() <> '');

create policy ri_auth_read on recipe_ingredients
  for select to authenticated
  using (auth_user_id() <> '');
