import { useAuth } from '@clerk/clerk-expo';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { __resetOnboardingStoreForTests, useOnboardingStore } from '@/state/useOnboardingStore';

import OnboardingScreen from '../index';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockCapture = jest.fn();
jest.mock('@/lib/analytics', () => ({
  useAnalytics: () => ({ capture: mockCapture }),
}));

jest.mock('@/lib/use-create-pod-invite', () => ({
  useCreatePodInvite: () => ({
    createInvite: jest.fn(),
    hint: null,
    isPending: false,
    isError: false,
  }),
}));

jest.mock('@/components/dietary-chips', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    DietaryChips: () => React.createElement(View, { testID: 'dietary-chips' }),
  };
});

describe('OnboardingScreen', () => {
  beforeEach(async () => {
    await __resetOnboardingStoreForTests();
    mockReplace.mockReset();
    mockCapture.mockReset();
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_clerk_xyz',
      getToken: jest.fn().mockResolvedValue('jwt-fixture'),
      signOut: jest.fn(),
    } as never);
  });

  it('starts at the intro step, tracks progress, and advances through the pod step', async () => {
    render(<OnboardingScreen />);

    expect(screen.getByTestId('onboarding-intro')).toBeOnTheScreen();
    expect(mockCapture).toHaveBeenCalledWith('onboarding_started', {});

    fireEvent.press(screen.getByTestId('onboarding-next'));

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-pod')).toBeOnTheScreen();
    });
    expect(useOnboardingStore.getState().completedByUser.user_clerk_xyz).toEqual({
      completed: false,
      step: 1,
    });
    expect(mockCapture).toHaveBeenCalledWith('onboarding_step_completed', {
      step: 0,
      skipped: false,
    });

    fireEvent.press(screen.getByTestId('onboarding-skip'));

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-dietary')).toBeOnTheScreen();
    });
    expect(useOnboardingStore.getState().completedByUser.user_clerk_xyz).toEqual({
      completed: false,
      step: 2,
    });
    expect(mockCapture).toHaveBeenCalledWith('onboarding_step_completed', {
      step: 1,
      skipped: true,
    });
  });

  it('resumes from the stored step and completes with skipped step count', async () => {
    useOnboardingStore.getState().setStep('user_clerk_xyz', 2);

    render(<OnboardingScreen />);

    expect(screen.getByTestId('onboarding-dietary')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('onboarding-skip'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
    expect(useOnboardingStore.getState().completedByUser.user_clerk_xyz?.completed).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith('onboarding_completed', { skipped_steps: 1 });
  });

  it('completes without adding skipped steps when the dietary step is done', async () => {
    useOnboardingStore.getState().setStep('user_clerk_xyz', 2);

    render(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId('onboarding-finish'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
    expect(mockCapture).toHaveBeenCalledWith('onboarding_step_completed', {
      step: 2,
      skipped: false,
    });
    expect(mockCapture).toHaveBeenCalledWith('onboarding_completed', { skipped_steps: 0 });
  });
});
