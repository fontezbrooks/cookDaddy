# Push Ops

Manual operator steps for the push fan-out path.

1. Deploy the Edge Function without JWT verification. Webhook auth is the shared secret, not a Clerk JWT:

   ```sh
   supabase functions deploy fan-out-push --no-verify-jwt
   ```

2. Set function secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase:

   ```sh
   supabase secrets set FANOUT_WEBHOOK_SECRET=<random> EXPO_ACCESS_TOKEN=<optional>
   ```

3. Create three Database Webhooks in Dashboard -> Database -> Webhooks. Each sends HTTP POST to the function URL with header `x-fanout-secret: <FANOUT_WEBHOOK_SECRET>`:

   | Table | Events |
   | --- | --- |
   | `matches` | `INSERT` |
   | `pod_invites` | `UPDATE` |
   | `sessions` | `INSERT` |

4. Schedule the prune as service role:

   ```sql
   select prune_stale_push_tokens();
   ```

   If `pg_cron` is enabled, use:

   ```sql
   select cron.schedule(
     'prune-push-tokens',
     '0 4 * * *',
     $$ select prune_stale_push_tokens(); $$
   );
   ```

   Otherwise use the existing system-crontab approach used by the Spoonacular ingester.

5. Configure APNs for iOS and FCM for Android in the Expo project through EAS credentials. Real-device delivery is verified manually for the DESIGN §9 exit criteria.

6. The legacy `pg_notify` triggers from migrations 017/018 remain in place but are unused by this path. They are harmless and may feed a future in-app channel.
