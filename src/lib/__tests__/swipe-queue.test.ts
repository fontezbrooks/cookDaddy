/**
 * In-memory swipe retry queue (NFR-R1).
 *
 * Contract:
 *   • enqueueSwipe appends (recipeId, direction) under key `swipe-queue:<sid>`
 *   • peekSwipeQueue reads the array back
 *   • removeFromSwipeQueue removes one (recipeId, direction) tuple
 *   • clearSwipeQueue empties the queue for a session
 *   • duplicate enqueue (same recipeId, direction) is collapsed — one entry
 *   • queue is bounded at QUEUE_CAP — overflow drops oldest entries first
 *   • per-session isolation — sessions don't see each other's queues
 */

import {
  __SWIPE_QUEUE_INTERNAL__,
  __resetSwipeQueueForTests,
  clearSwipeQueue,
  enqueueSwipe,
  peekSwipeQueue,
  removeFromSwipeQueue,
} from '@/lib/swipe-queue';

describe('swipe-queue', () => {
  beforeEach(() => {
    __resetSwipeQueueForTests();
  });

  it('returns [] for an empty session queue', () => {
    expect(peekSwipeQueue('sess-1')).toEqual([]);
  });

  it('enqueueSwipe persists one item under the sessionId', () => {
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'right' });
    const queue = peekSwipeQueue('sess-1');
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ recipeId: 'r-1', direction: 'right' });
    expect(typeof queue[0]?.enqueuedAt).toBe('number');
  });

  it('collapses a duplicate enqueue of the same (recipeId, direction)', () => {
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'right' });
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'right' });
    expect(peekSwipeQueue('sess-1')).toHaveLength(1);
  });

  it('treats different directions on the same recipeId as separate entries', () => {
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'right' });
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'left' });
    expect(peekSwipeQueue('sess-1')).toHaveLength(2);
  });

  it('isolates queues per sessionId', () => {
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'right' });
    enqueueSwipe('sess-2', { recipeId: 'r-2', direction: 'left' });
    expect(peekSwipeQueue('sess-1')).toHaveLength(1);
    expect(peekSwipeQueue('sess-2')).toHaveLength(1);
    expect(peekSwipeQueue('sess-1')[0]?.recipeId).toBe('r-1');
    expect(peekSwipeQueue('sess-2')[0]?.recipeId).toBe('r-2');
  });

  it('removeFromSwipeQueue drops a single entry by (recipeId, direction)', () => {
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'right' });
    enqueueSwipe('sess-1', { recipeId: 'r-2', direction: 'left' });
    removeFromSwipeQueue('sess-1', { recipeId: 'r-1', direction: 'right' });

    const queue = peekSwipeQueue('sess-1');
    expect(queue).toHaveLength(1);
    expect(queue[0]?.recipeId).toBe('r-2');
  });

  it('removeFromSwipeQueue is a no-op when the entry is absent', () => {
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'right' });
    removeFromSwipeQueue('sess-1', { recipeId: 'r-9', direction: 'left' });
    expect(peekSwipeQueue('sess-1')).toHaveLength(1);
  });

  it('clearSwipeQueue empties the session', () => {
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'right' });
    enqueueSwipe('sess-1', { recipeId: 'r-2', direction: 'left' });
    clearSwipeQueue('sess-1');
    expect(peekSwipeQueue('sess-1')).toEqual([]);
  });

  it('removing the last entry empties the queue', () => {
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'right' });
    removeFromSwipeQueue('sess-1', { recipeId: 'r-1', direction: 'right' });
    expect(peekSwipeQueue('sess-1')).toEqual([]);
  });

  it('caps the queue at QUEUE_CAP entries, dropping oldest first', () => {
    const cap = __SWIPE_QUEUE_INTERNAL__.QUEUE_CAP;
    for (let i = 0; i < cap + 5; i += 1) {
      enqueueSwipe('sess-1', { recipeId: `r-${i}`, direction: 'right' });
    }
    const queue = peekSwipeQueue('sess-1');
    expect(queue).toHaveLength(cap);
    // Oldest 5 dropped — first entry should be r-5.
    expect(queue[0]?.recipeId).toBe('r-5');
    expect(queue[queue.length - 1]?.recipeId).toBe(`r-${cap + 4}`);
  });

  it('returns a defensive copy so callers cannot mutate the queue', () => {
    enqueueSwipe('sess-1', { recipeId: 'r-1', direction: 'right' });
    const queue = peekSwipeQueue('sess-1');
    queue.push({ recipeId: 'r-mutated', direction: 'left', enqueuedAt: Date.now() });
    expect(peekSwipeQueue('sess-1')).toHaveLength(1);
  });
});
