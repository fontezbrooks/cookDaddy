// MMKV-backed retry queue for failed submit_swipe calls (NFR-R1).
//
// When a swipe RPC fails for a transient reason (network blip, timeout, or
// any error mapped to 'unknown'), the SwipeDeck enqueues the swipe here and
// surfaces a "retrying" banner instead of dropping it. The queue drains on:
//   • the next successful commit, AND
//   • component mount (in case the screen unmounted between fail + retry).
//
// Policy rejections (session_not_active, forbidden, etc.) are NOT enqueued —
// retrying won't change the server's answer.
//
// Storage layout per session:
//   key:   swipe-queue:<sessionId>
//   value: JSON-encoded SwipeQueueItem[]
//
// Bounded at QUEUE_CAP entries per session so a long offline streak doesn't
// fill local storage. Oldest entries are dropped first (drop-from-head).

import { createMMKV, type MMKV } from 'react-native-mmkv';

import type { SwipeDirection } from '@/lib/session-rpcs';

const QUEUE_CAP = 50;
const STORAGE_ID = 'cookdaddy-swipe-queue';

export type SwipeQueueItem = {
  recipeId: string;
  direction: SwipeDirection;
  enqueuedAt: number;
};

let instance: MMKV | null = null;
function storage(): MMKV {
  if (!instance) instance = createMMKV({ id: STORAGE_ID });
  return instance;
}

function key(sessionId: string): string {
  return `swipe-queue:${sessionId}`;
}

function readQueue(sessionId: string): SwipeQueueItem[] {
  const raw = storage().getString(key(sessionId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SwipeQueueItem[]) : [];
  } catch {
    // Corrupted entry — drop it; the only loss is a swipe the user can
    // re-do, vs. wedging the deck.
    storage().remove(key(sessionId));
    return [];
  }
}

function writeQueue(sessionId: string, items: SwipeQueueItem[]): void {
  if (items.length === 0) {
    storage().remove(key(sessionId));
    return;
  }
  storage().set(key(sessionId), JSON.stringify(items));
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
  storage().remove(key(sessionId));
}

export const __SWIPE_QUEUE_INTERNAL__ = { QUEUE_CAP, STORAGE_ID };
