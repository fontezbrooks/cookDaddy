/* eslint-disable import/first */
import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

const mockPush = jest.fn();
const mockRemove = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));

import { resolveDeepLinkPath, usePushDeepLink } from '@/lib/use-push-deep-link';

function responseWithData(
  data: Record<string, unknown> | null | undefined,
): Notifications.NotificationResponse {
  return {
    notification: {
      request: {
        content: { data },
      },
    },
  } as Notifications.NotificationResponse;
}

describe('resolveDeepLinkPath', () => {
  it.each([
    [{ deep_link: 'cookdaddy://cookbook/m1' }, '/cookbook/m1'],
    [{ deep_link: 'cookdaddy://session/s1' }, '/session/s1'],
    [{ deep_link: 'cookdaddy://home' }, '/home'],
    [{ deep_link: 'cookdaddy://evil/x' }, null],
    [{ type: 'match', match_id: 'm2' }, '/cookbook/m2'],
    [{ type: 'session_invited', session_id: 's2' }, '/session/s2'],
    [{ type: 'pod_joined' }, '/home'],
    [null, null],
    [undefined, null],
    [{}, null],
  ])('maps %p to %p', (data, expected) => {
    expect(resolveDeepLinkPath(data)).toBe(expected);
  });
});

describe('usePushDeepLink', () => {
  beforeEach(() => {
    mockPush.mockReset();
    jest.mocked(Notifications.setNotificationHandler).mockClear();
    jest.mocked(Notifications.getLastNotificationResponseAsync).mockReset().mockResolvedValue(null);
    mockRemove.mockReset();
    jest
      .mocked(Notifications.addNotificationResponseReceivedListener)
      .mockReset()
      .mockReturnValue({ remove: mockRemove });
  });

  it('routes from the notification that cold-started the app', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(responseWithData({ deep_link: 'cookdaddy://cookbook/m1' }));

    renderHook(() => usePushDeepLink());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/cookbook/m1'));
  });

  it('routes from a warm notification tap', () => {
    let listener: ((response: Notifications.NotificationResponse) => void) | undefined;
    jest
      .mocked(Notifications.addNotificationResponseReceivedListener)
      .mockImplementation((receivedListener) => {
        listener = receivedListener;
        return { remove: mockRemove };
      });

    renderHook(() => usePushDeepLink());
    listener?.(responseWithData({ type: 'session_invited', session_id: 's9' }));

    expect(mockPush).toHaveBeenCalledWith('/session/s9');
  });

  it('does not route when the response has no recognized data', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(responseWithData({ type: 'unknown' }));

    renderHook(() => usePushDeepLink());

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('removes the notification response subscription on unmount', () => {
    const { unmount } = renderHook(() => usePushDeepLink());

    unmount();

    expect(mockRemove).toHaveBeenCalled();
  });
});
