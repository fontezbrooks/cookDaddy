// In-memory retry buffer for failed submit_swipe calls (NFR-R1).
//
// When a swipe RPC fails for a transient reason (network blip, timeout, or
// any error mapped to 'unknown'), the SwipeDeck enqueues the swipe here and
// surfaces a "retrying" banner instead of dropping it. The queue drains on:
//   • the next successful commit, AND
//   • component mount (in case the screen unmounted between fail + retry).
// The buffer survives component remount within the JS runtime. A full app
// termination clears it, which is acceptable because submit_swipe is
// idempotent server-side.
//
// Policy rejections (session_not_active, forbidden, etc.) are NOT enqueued —
// retrying won't change the server's answer.
//
// Bounded at QUEUE_CAP entries per session so a long offline streak doesn't
// grow the runtime buffer without limit. Oldest entries are dropped first
// (drop-from-head).

import type { SwipeDirection } from '@/lib/session-rpcs';

const QUEUE_CAP = 50;

export type SwipeQueueItem = {
  recipeId: string;
  direction: SwipeDirection;
  enqueuedAt: number;
};

const queues = new Map<string, SwipeQueueItem[]>();

function key(sessionId: string): string {
  return `swipe-queue:${sessionId}`;
}

function readQueue(sessionId: string): SwipeQueueItem[] {
  return [...(queues.get(key(sessionId)) ?? [])];
}

function writeQueue(sessionId: string, items: SwipeQueueItem[]): void {
  if (items.length === 0) {
    queues.delete(key(sessionId));
    return;
  }
  queues.set(key(sessionId), items);
}

export function enqueueSwipe(
  sessionId: string,
  payload: { recipeId: string; direction: SwipeDirection },
): void {
  const items = readQueue(sessionId);
  // De-dupe on (recipeId, direction). If the user retries the same card,
  // we don't want two pending entries — submit_swipe is idempotent on the
  // server's UNIQUE (session_id, recipe_id) constraint, but at the client
  // we save a roundtrip.
  const filtered = items.filter(
    (i) => !(i.recipeId === payload.recipeId && i.direction === payload.direction),
  );
  filtered.push({
    recipeId: payload.recipeId,
    direction: payload.direction,
    enqueuedAt: Date.now(),
  });
  // Bound the queue. Drop oldest first.
  const capped =
    filtered.length > QUEUE_CAP ? filtered.slice(filtered.length - QUEUE_CAP) : filtered;
  writeQueue(sessionId, capped);
}

export function peekSwipeQueue(sessionId: string): SwipeQueueItem[] {
  return readQueue(sessionId);
}

export function removeFromSwipeQueue(
  sessionId: string,
  payload: { recipeId: string; direction: SwipeDirection },
): void {
  const items = readQueue(sessionId);
  const filtered = items.filter(
    (i) => !(i.recipeId === payload.recipeId && i.direction === payload.direction),
  );
  if (filtered.length !== items.length) writeQueue(sessionId, filtered);
}

export function clearSwipeQueue(sessionId: string): void {
  queues.delete(key(sessionId));
}

export function __resetSwipeQueueForTests(): void {
  queues.clear();
}

export const __SWIPE_QUEUE_INTERNAL__ = { QUEUE_CAP };
