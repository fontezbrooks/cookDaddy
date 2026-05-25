# Push Ops

Operator steps for the push fan-out path (Edge Function `fan-out-push`).

## Deployed state — project `tkizdngomjrgrmpancyz` (as of 2026-05-25)

| Step | Status |
| --- | --- |
| `fan-out-push` Edge Function deployed (`--no-verify-jwt`) | ✅ ACTIVE |
| `FANOUT_WEBHOOK_SECRET` set on the function | ✅ |
| 3 webhook triggers → function (via `pg_net`, see below) | ✅ |
| Daily prune via `pg_cron` (`prune-push-tokens`, 04:00 UTC) | ✅ |
| APNs / FCM credentials (EAS) | ⛔ pending — needs Expo account + build |
| `EXPO_ACCESS_TOKEN` (optional, for receipts/auth) | ⛔ not set |

The shared secret value is NOT stored in this repo. It lives in two places that
must match: the function env (`FANOUT_WEBHOOK_SECRET`) and the `x-fanout-secret`
header embedded in `public.fanout_push_webhook()`. To view/rotate, see below.

## 1. Deploy the Edge Function

Webhook auth is the shared secret, not a Clerk JWT:

```sh
supabase functions deploy fan-out-push --no-verify-jwt
```

The first deploy pulls the `supabase/edge-runtime` Docker image (bundling step) —
this can take a few minutes; let it finish.

## 2. Set the function secret

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase:

```sh
supabase secrets set FANOUT_WEBHOOK_SECRET=<random-hex> EXPO_ACCESS_TOKEN=<optional>
```

## 3. Wire the webhooks (done via `pg_net` SQL triggers, not the dashboard)

This project enables `pg_net` and uses a single `SECURITY DEFINER` trigger
function that POSTs the standard Supabase-webhook payload
(`{type, table, schema, record, old_record}`) to the function with the secret
header — functionally identical to dashboard Database Webhooks, but reproducible
via SQL. (Dashboard → Database → Webhooks is the alternative if you prefer.)

```sql
create extension if not exists pg_net;

create or replace function public.fanout_push_webhook() returns trigger
  language plpgsql security definer set search_path = public, net, extensions as $fn$
begin
  perform net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/fan-out-push',
    headers := jsonb_build_object('Content-Type','application/json','x-fanout-secret','<SECRET>'),
    body := jsonb_build_object(
      'type', tg_op, 'table', tg_table_name, 'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
    )
  );
  return new;
end;
$fn$;

create trigger trg_fanout_match      after insert on public.matches      for each row execute function public.fanout_push_webhook();
create trigger trg_fanout_pod_invite after update on public.pod_invites  for each row execute function public.fanout_push_webhook();
create trigger trg_fanout_session    after insert on public.sessions     for each row execute function public.fanout_push_webhook();
```

The function classifies + filters (only consumed pod_invites, only `lobby`
sessions, etc.), so firing on every row is fine. To **rotate the secret**, re-run
`supabase secrets set FANOUT_WEBHOOK_SECRET=<new>` AND `create or replace` the
trigger function with the new `<SECRET>`.

## 4. Schedule the prune (`pg_cron`)

```sql
create extension if not exists pg_cron;
select cron.schedule('prune-push-tokens', '0 4 * * *', $$ select public.prune_stale_push_tokens(); $$);
```

`prune_stale_push_tokens()` is `service_role`-only; the cron job runs as
`postgres` (the function owner), which has execute. Inspect/uninstall via
`select * from cron.job;` / `select cron.unschedule('prune-push-tokens');`.
(Fallback if `pg_cron` is unavailable: the system-crontab approach used by the
Spoonacular ingester.)

## 5. APNs / FCM (pending — manual)

Configure APNs (iOS) and FCM (Android) in the Expo project via EAS credentials
(`eas credentials`). Real-device delivery is verified manually for the
DESIGN §9 exit criteria, on a dev/EAS build that includes `expo-notifications`.

## Notes

- The legacy `pg_notify` triggers from migrations 017/018 remain in place but are
  unused by this path. They are harmless and may feed a future in-app channel.
