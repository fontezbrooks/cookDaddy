// Deno entry point for the Clerk → Supabase user-sync webhook.
//
// Reads env vars, verifies the Svix signature, executes the planned DB action with
// the service-role Supabase client. All non-IO logic lives in ../_shared/clerk-webhook.ts
// so it can be unit-tested under Jest.
//
// Source spec: docs/DESIGN/README.md §4 + docs/WORKFLOW/README.md §5.
// Local invocation: `supabase functions serve clerk-user-webhook`
// then POST to http://localhost:64321/functions/v1/clerk-user-webhook with Svix headers.
//
// @ts-nocheck — Deno-only imports; this file is not compiled by the app's tsc run.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  planAction,
  verifyClerkSignature,
  WebhookPayloadError,
  WebhookSignatureError,
} from '../_shared/clerk-webhook.ts';

const CLERK_WEBHOOK_SECRET = Deno.env.get('CLERK_WEBHOOK_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!CLERK_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('clerk-user-webhook: missing required env vars');
}

const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  if (!CLERK_WEBHOOK_SECRET) {
    return new Response('webhook secret not configured', { status: 500 });
  }

  const rawBody = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? undefined,
    'svix-timestamp': req.headers.get('svix-timestamp') ?? undefined,
    'svix-signature': req.headers.get('svix-signature') ?? undefined,
  };

  let payload: unknown;
  try {
    payload = verifyClerkSignature(rawBody, headers, CLERK_WEBHOOK_SECRET);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return new Response(`unauthorized: ${err.message}`, { status: 401 });
    }
    throw err;
  }

  let action;
  try {
    action = planAction(payload);
  } catch (err) {
    if (err instanceof WebhookPayloadError) {
      return new Response(`bad payload: ${err.message}`, { status: 400 });
    }
    throw err;
  }

  switch (action.kind) {
    case 'user.upserted': {
      const { error } = await supabase
        .from('users')
        .upsert(action.user, { onConflict: 'id' });
      if (error) {
        console.error('upsert failed', error);
        return new Response('upsert failed', { status: 500 });
      }
      return new Response('ok', { status: 200 });
    }
    case 'user.deleted': {
      // Archive any active pod the user is in so their partner gets routed to the
      // "partner-removed-me" screen (FR-P6). Then delete the user row; FK cascades
      // wipe their swipes/ratings/etc. but leave the pod row archived for 30d.
      const { error: archErr } = await supabase
        .from('pods')
        .update({ archived_at: new Date().toISOString() })
        .in(
          'id',
          // subquery: pods this user belongs to that are still active
          (
            await supabase
              .from('pod_members')
              .select('pod_id')
              .eq('user_id', action.user_id)
          ).data?.map((r) => r.pod_id) ?? [],
        );
      if (archErr) {
        console.error('archive pods failed', archErr);
        return new Response('archive failed', { status: 500 });
      }

      const { error: delErr } = await supabase.from('users').delete().eq('id', action.user_id);
      if (delErr) {
        console.error('delete user failed', delErr);
        return new Response('delete failed', { status: 500 });
      }
      return new Response('ok', { status: 200 });
    }
    case 'ignored':
      return new Response('ignored', { status: 200 });
  }
});
