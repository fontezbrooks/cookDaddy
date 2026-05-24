-- 022_add_shopping_items_from_recipe.sql
-- Source: docs/WORKFLOW/README.md §13 (P10-S4).
-- Fan a cookbook recipe's selected ingredients onto the shared shopping list in
-- one authenticated, pod-scoped call, reporting which ingredients the pod may
-- already have in its pantry (matched by name_clean).
--
-- Why SECURITY DEFINER: the function inserts shopping_list_items on the caller's
-- behalf after verifying pod membership, and cross-reads pantry_items to surface
-- conflicts independent of the caller's RLS visibility. Plain CRUD still goes
-- through RLS; this RPC is only the recipe→list fan-out + conflict report.

create or replace function add_shopping_items_from_recipe(
  p_pod_id uuid,
  p_recipe_id uuid,
  p_ingredient_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      text;
  v_inserted  int;
  v_conflicts text[];
begin
  v_user := auth_user_id();
  if v_user = '' then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  if not is_pod_member(p_pod_id, v_user) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  with picked as (
    select ri.id, ri.name, ri.amount, ri.unit, ri.aisle
    from recipe_ingredients ri
    where ri.recipe_id = p_recipe_id
      and ri.id = any(coalesce(p_ingredient_ids, array[]::uuid[]))
  ),
  ins as (
    insert into shopping_list_items
      (pod_id, name, quantity, unit, category, source_recipe_id, added_by_user_id)
    select p_pod_id, p.name, p.amount, p.unit, p.aisle, p_recipe_id, v_user
    from picked p
    returning 1
  )
  select count(*)::int into v_inserted from ins;

  select coalesce(array_agg(distinct ri.name order by ri.name), array[]::text[])
    into v_conflicts
  from recipe_ingredients ri
  join pantry_items pi
    on pi.pod_id = p_pod_id
   and pi.name_clean = ri.name_clean
  where ri.recipe_id = p_recipe_id
    and ri.id = any(coalesce(p_ingredient_ids, array[]::uuid[]))
    and ri.name_clean is not null;

  return jsonb_build_object(
    'inserted_count', v_inserted,
    'pantry_conflicts', to_jsonb(v_conflicts)
  );
end;
$$;

-- Lockdown: Supabase auto-grants EXECUTE to anon+authenticated on new public
-- functions, so revoke from public+anon explicitly, then keep authenticated.
revoke all on function add_shopping_items_from_recipe(uuid, uuid, uuid[]) from public, anon;
grant execute on function add_shopping_items_from_recipe(uuid, uuid, uuid[]) to authenticated;
