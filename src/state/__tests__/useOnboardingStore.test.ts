import { __resetOnboardingStoreForTests, useOnboardingStore } from '../useOnboardingStore';

describe('useOnboardingStore', () => {
  beforeEach(async () => {
    await __resetOnboardingStoreForTests();
  });

  it('stores resumable progress per Clerk user id', () => {
    useOnboardingStore.getState().setStep('user_a', 1);
    useOnboardingStore.getState().setStep('user_b', 2);

    expect(useOnboardingStore.getState().completedByUser).toEqual({
      user_a: { completed: false, step: 1 },
      user_b: { completed: false, step: 2 },
    });
  });

  it('marks one user complete without changing other users', () => {
    useOnboardingStore.getState().setStep('user_a', 1);
    useOnboardingStore.getState().setStep('user_b', 2);
    useOnboardingStore.getState().complete('user_a');

    expect(useOnboardingStore.getState().completedByUser).toEqual({
      user_a: { completed: true, step: 1 },
      user_b: { completed: false, step: 2 },
    });
  });
});
