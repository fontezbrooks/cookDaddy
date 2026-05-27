import { __resetOnboardingStoreForTests, useOnboardingStore } from '../useOnboardingStore';

describe('useOnboardingStore', () => {
  beforeEach(async () => {
    await __resetOnboardingStoreForTests();
  });

  it('stores resumable progress per Clerk user id', () => {
    useOnboardingStore.getState().setStep('user_a', 1);
    useOnboardingStore.getState().setStep('user_b', 2);

    expect(useOnboardingStore.getState().completedByUser).toEqual({
      user_a: { completed: false, skipped: 0, step: 1 },
      user_b: { completed: false, skipped: 0, step: 2 },
    });
  });

  it('marks one user complete without changing other users', () => {
    useOnboardingStore.getState().setStep('user_a', 1);
    useOnboardingStore.getState().setStep('user_b', 2);
    useOnboardingStore.getState().complete('user_a');

    expect(useOnboardingStore.getState().completedByUser).toEqual({
      user_a: { completed: true, skipped: 0, step: 1 },
      user_b: { completed: false, skipped: 0, step: 2 },
    });
  });

  it('increments and preserves skipped steps per user', () => {
    useOnboardingStore.getState().setStep('user_a', 1);
    useOnboardingStore.getState().setStep('user_b', 2);

    expect(useOnboardingStore.getState().recordSkip('user_a')).toBe(1);
    expect(useOnboardingStore.getState().recordSkip('user_a')).toBe(2);
    expect(useOnboardingStore.getState().recordSkip('user_b')).toBe(1);
    useOnboardingStore.getState().setStep('user_a', 2);
    useOnboardingStore.getState().complete('user_a');

    expect(useOnboardingStore.getState().completedByUser).toEqual({
      user_a: { completed: true, skipped: 2, step: 2 },
      user_b: { completed: false, skipped: 1, step: 2 },
    });
  });

  it('records a skip for a new user with default progress', () => {
    expect(useOnboardingStore.getState().recordSkip('user_a')).toBe(1);

    expect(useOnboardingStore.getState().completedByUser.user_a).toEqual({
      completed: false,
      skipped: 1,
      step: 0,
    });
  });
});
