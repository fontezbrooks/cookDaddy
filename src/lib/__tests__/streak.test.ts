import { computeStreakLength, isStreakActive } from '@/lib/streak';

const ids = ['r-1', 'r-2', 'r-3', 'r-4', 'r-5', 'r-6'];

describe('streak logic', () => {
  it('returns 0 for an empty deck', () => {
    expect(computeStreakLength([], 0, new Set(), new Set())).toBe(0);
  });

  it('returns 0 at index 0', () => {
    const bothRight = new Set(['r-1', 'r-2', 'r-3']);
    expect(computeStreakLength(ids, 0, bothRight, bothRight)).toBe(0);
  });

  it('activates for a run of exactly 3 both-right cards before index', () => {
    const bothRight = new Set(['r-1', 'r-2', 'r-3']);
    expect(computeStreakLength(ids, 3, bothRight, bothRight)).toBe(3);
    expect(isStreakActive(ids, 3, bothRight, bothRight)).toBe(true);
  });

  it('stays inactive for a run of 2', () => {
    const bothRight = new Set(['r-1', 'r-2']);
    expect(computeStreakLength(ids, 2, bothRight, bothRight)).toBe(2);
    expect(isStreakActive(ids, 2, bothRight, bothRight)).toBe(false);
  });

  it('counts only the trailing consecutive both-right run after a one-sided swipe', () => {
    const localRight = new Set(['r-1', 'r-2', 'r-3', 'r-4']);
    const partnerRight = new Set(['r-1', 'r-3', 'r-4']);
    expect(computeStreakLength(ids, 4, localRight, partnerRight)).toBe(2);
  });

  it('only counts positions before index', () => {
    const bothRight = new Set(['r-1', 'r-2', 'r-3']);
    expect(computeStreakLength(ids, 2, bothRight, bothRight)).toBe(2);
  });

  it('does not count a both-right card after index', () => {
    const localRight = new Set(['r-1', 'r-2', 'r-4']);
    const partnerRight = new Set(['r-1', 'r-2', 'r-4']);
    expect(computeStreakLength(ids, 3, localRight, partnerRight)).toBe(0);
  });

  it('counts a long run of 5', () => {
    const bothRight = new Set(['r-1', 'r-2', 'r-3', 'r-4', 'r-5']);
    expect(computeStreakLength(ids, 5, bothRight, bothRight)).toBe(5);
    expect(isStreakActive(ids, 5, bothRight, bothRight)).toBe(true);
  });

  it('breaks the run when partnerRight is missing the latest card', () => {
    const localRight = new Set(['r-1', 'r-2', 'r-3']);
    const partnerRight = new Set(['r-1', 'r-2']);
    expect(computeStreakLength(ids, 3, localRight, partnerRight)).toBe(0);
    expect(isStreakActive(ids, 3, localRight, partnerRight)).toBe(false);
  });
});
