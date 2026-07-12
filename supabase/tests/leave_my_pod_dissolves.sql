-- Source: docs/POD-READ-PATH/README.md FR-4 — unconditional escape hatch.
-- Guarantee: leave_my_pod() resolves the caller's membership server-side and
-- dissolves the pod (archive + member deletion via dissolve_pod). Returns
-- false as an idempotent no-op when the caller has no active pod, so the
-- client can always offer "Leave pod" without knowing a pod id.
-- NOTE: privilege checks use has_function_privilege, never an anon throws_ok
-- 42501 probe (that PANICs the local pgTAP runner).

begin;
select plan(7);

select tests.seed_paired_pod() as pod \gset

-- A user with no pod gets false, not an error.
select tests.as_user('user_carol');
select is(
  (select public.leave_my_pod()),
  false,
  'no active pod → false (idempotent no-op)'
);

-- A member leaves without passing a pod id.
select tests.as_user('user_alice');
select is(
  (select public.leave_my_pod()),
  true,
  'member leave resolves the pod server-side and returns true'
);

select tests.as_service();
select isnt(
  (select archived_at from public.pods where id = (:'pod')::uuid),
  NULL,
  'pods.archived_at is set after leave_my_pod'
);
select is(
  (select count(*)::int from public.pod_members where pod_id = (:'pod')::uuid),
  0,
  'all pod_members rows deleted (partner-removed detection works)'
);

-- Second call after leaving is a no-op.
select tests.as_user('user_alice');
select is(
  (select public.leave_my_pod()),
  false,
  'second call after leaving → false'
);

-- Privileges.
select ok(
  has_function_privilege('authenticated', 'public.leave_my_pod()', 'execute'),
  'authenticated can execute leave_my_pod'
);
select ok(
  not has_function_privilege('anon', 'public.leave_my_pod()', 'execute'),
  'anon cannot execute leave_my_pod'
);

select * from finish();
rollback;
