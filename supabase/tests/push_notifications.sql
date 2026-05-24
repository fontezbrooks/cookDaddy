-- Source: docs/DESIGN/README.md §9.4 + §16.2, docs/WORKFLOW/README.md §14 (P11).
-- pgTAP coverage for push notification preferences and stale-token pruning.

begin;
select plan(9);

select tests.seed_three_users();

-- notification_prefs is strict self-only.
select tests.as_user('user_alice');
insert into public.notification_prefs(user_id, match_enabled)
  values ('user_alice', false);

select is(
  (select count(*)::int from public.notification_prefs),
  1,
  'alice sees exactly her own notification_prefs row'
);
select is(
  (select match_enabled from public.notification_prefs where user_id = 'user_alice'),
  false,
  'alice can write her own opt-out'
);

select tests.as_user('user_bob');
select is(
  (select count(*)::int from public.notification_prefs where user_id = 'user_alice'),
  0,
  'bob cannot see alice notification_prefs'
);

select tests.as_user('user_alice');
select throws_ok(
  $$ insert into public.notification_prefs(user_id) values ('user_bob') $$,
  '42501',
  NULL,
  'alice cannot insert notification_prefs for bob'
);

-- prune_stale_push_tokens removes only tokens unseen for >30 days.
select tests.as_service();
insert into public.push_tokens(user_id, expo_token, platform, last_seen)
  values
    ('user_alice', 'ExponentPushToken[stale]', 'ios', now() - interval '40 days'),
    ('user_alice', 'ExponentPushToken[fresh]', 'ios', now());

select is(
  (select public.prune_stale_push_tokens()),
  1,
  'prune_stale_push_tokens returns deleted row count'
);
select is(
  (select count(*)::int from public.push_tokens where expo_token = 'ExponentPushToken[stale]'),
  0,
  'stale token is deleted'
);
select is(
  (select count(*)::int from public.push_tokens where expo_token = 'ExponentPushToken[fresh]'),
  1,
  'fresh token remains'
);

-- Function is service_role only.
select tests.as_anon();
select throws_ok(
  $$ select public.prune_stale_push_tokens() $$,
  '42501',
  NULL,
  'anon cannot prune stale push tokens'
);

select tests.as_user('user_alice');
select throws_ok(
  $$ select public.prune_stale_push_tokens() $$,
  '42501',
  NULL,
  'authenticated user cannot prune stale push tokens'
);

select * from finish();
rollback;
