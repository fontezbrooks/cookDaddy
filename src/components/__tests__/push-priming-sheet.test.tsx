import { useAuth } from '@clerk/clerk-expo';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import {
  getPushPermissionStatus,
  registerPushToken,
  requestPushPermission,
  type PushPermissionStatus,
} from '@/lib/push-registration';
import { __resetPodStoreForTests, usePodStore } from '@/state/usePodStore';
import { __resetPushPrimingStoreForTests, usePushPrimingStore } from '@/state/usePushPrimingStore';

import { PushPrimingSheet } from '../push-priming-sheet';

const mockClient = { from: jest.fn() };
const mockCapture = jest.fn();

jest.mock('@/lib/push-registration', () => ({
  getPushPermissionStatus: jest.fn(),
  requestPushPermission: jest.fn(),
  registerPushToken: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

jest.mock('@/lib/analytics', () => ({
  useAnalytics: () => ({
    capture: mockCapture,
    identify: jest.fn(),
    group: jest.fn(),
    reset: jest.fn(),
  }),
}));

function setSignedIn(): void {
  jest.mocked(useAuth).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_alice',
    getToken: jest.fn().mockResolvedValue('jwt'),
    signOut: jest.fn(),
  } as never);
}

function setActivePod(): void {
  usePodStore.getState().setActivePod({
    podId: 'pod-1',
    partnerId: 'user_bob',
    partnerDisplayName: 'Bob',
  });
}

function mockStatus(status: PushPermissionStatus): void {
  jest.mocked(getPushPermissionStatus).mockResolvedValue(status);
}

describe('PushPrimingSheet', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    __resetPodStoreForTests();
    await __resetPushPrimingStoreForTests();
    setSignedIn();
    mockStatus('undetermined');
    jest.mocked(requestPushPermission).mockResolvedValue(true);
    jest.mocked(registerPushToken).mockResolvedValue('ExponentPushToken[test]');
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stays hidden when there is no active pod', async () => {
    render(<PushPrimingSheet />);

    await waitFor(() => expect(getPushPermissionStatus).not.toHaveBeenCalled());

    expect(screen.queryByTestId('push-priming-sheet')).toBeNull();
  });

  it.each(['granted', 'denied'] as PushPermissionStatus[])(
    'stays hidden when permission status is %s',
    async (status) => {
      setActivePod();
      mockStatus(status);

      render(<PushPrimingSheet />);

      await waitFor(() => expect(getPushPermissionStatus).toHaveBeenCalled());

      expect(screen.queryByTestId('push-priming-sheet')).toBeNull();
    },
  );

  it('stays hidden when promptedAt is recent', async () => {
    setActivePod();
    usePushPrimingStore.getState().setPromptedAt(Date.now() - 24 * 60 * 60 * 1000);

    render(<PushPrimingSheet />);

    await waitFor(() => expect(getPushPermissionStatus).toHaveBeenCalled());

    expect(screen.queryByTestId('push-priming-sheet')).toBeNull();
  });

  it('shows for a paired user with undetermined status and captures first_pod_created', async () => {
    setActivePod();

    render(<PushPrimingSheet />);

    await waitFor(() => expect(screen.getByTestId('push-priming-sheet')).toBeOnTheScreen());

    expect(screen.getByTestId('push-priming-sheet')).toHaveTextContent(/Bob wants to swipe/);
    expect(mockCapture).toHaveBeenCalledWith('push_permission_prompted', {
      trigger: 'first_pod_created',
    });
  });

  it('captures reprompt when promptedAt is older than 14 days', async () => {
    setActivePod();
    usePushPrimingStore.getState().setPromptedAt(Date.now() - 15 * 24 * 60 * 60 * 1000);

    render(<PushPrimingSheet />);

    await waitFor(() => expect(screen.getByTestId('push-priming-sheet')).toBeOnTheScreen());

    expect(mockCapture).toHaveBeenCalledWith('push_permission_prompted', {
      trigger: 'reprompt',
    });
  });

  it('continues, registers the token when permission is granted, captures granted, and hides', async () => {
    setActivePod();
    jest.mocked(requestPushPermission).mockResolvedValue(true);

    render(<PushPrimingSheet />);

    await waitFor(() => expect(screen.getByTestId('push-priming-sheet')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('push-priming-continue'));

    await waitFor(() => expect(requestPushPermission).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(registerPushToken).toHaveBeenCalledWith(mockClient, 'user_alice'));

    expect(mockCapture).toHaveBeenCalledWith('push_permission_granted', {
      platform: expect.any(String),
    });
    expect(usePushPrimingStore.getState().promptedAt).toBe(Date.now());
    await waitFor(() => expect(screen.queryByTestId('push-priming-sheet')).toBeNull());
  });

  it('continues without registering when permission is denied and hides', async () => {
    setActivePod();
    jest.mocked(requestPushPermission).mockResolvedValue(false);

    render(<PushPrimingSheet />);

    await waitFor(() => expect(screen.getByTestId('push-priming-sheet')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('push-priming-continue'));

    await waitFor(() => expect(requestPushPermission).toHaveBeenCalledTimes(1));

    expect(registerPushToken).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalledWith('push_permission_granted', expect.anything());
    expect(usePushPrimingStore.getState().promptedAt).toBe(Date.now());
    await waitFor(() => expect(screen.queryByTestId('push-priming-sheet')).toBeNull());
  });

  it('skips, records promptedAt, and hides without requesting permission', async () => {
    setActivePod();

    render(<PushPrimingSheet />);

    await waitFor(() => expect(screen.getByTestId('push-priming-sheet')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('push-priming-skip'));

    expect(requestPushPermission).not.toHaveBeenCalled();
    expect(usePushPrimingStore.getState().promptedAt).toBe(Date.now());
    await waitFor(() => expect(screen.queryByTestId('push-priming-sheet')).toBeNull());
  });
});
