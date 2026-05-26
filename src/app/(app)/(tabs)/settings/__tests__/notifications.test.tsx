import { fireEvent, render, screen } from '@testing-library/react-native';

import { useNotificationPrefs } from '@/lib/use-notification-prefs';

import NotificationsScreen from '../notifications';

const mockSetPref = jest.fn();

jest.mock('@/lib/use-notification-prefs', () => ({
  useNotificationPrefs: jest.fn(),
}));

function mockPrefs(options?: { isLoading?: boolean }) {
  jest.mocked(useNotificationPrefs).mockReturnValue({
    prefs: {
      matchEnabled: true,
      sessionInviteEnabled: false,
      podJoinedEnabled: true,
    },
    isLoading: options?.isLoading ?? false,
    setPref: mockSetPref,
  });
}

describe('NotificationsScreen', () => {
  beforeEach(() => {
    mockSetPref.mockClear();
    mockPrefs();
  });

  it('renders three notification toggle rows', () => {
    render(<NotificationsScreen />);

    expect(screen.getByTestId('notifications-match')).toBeOnTheScreen();
    expect(screen.getByTestId('notifications-session')).toBeOnTheScreen();
    expect(screen.getByTestId('notifications-pod')).toBeOnTheScreen();
  });

  it('renders the loading state', () => {
    mockPrefs({ isLoading: true });

    render(<NotificationsScreen />);

    expect(screen.getByTestId('notifications-loading')).toBeOnTheScreen();
  });

  it('toggling a row calls setPref with the right key and value', () => {
    render(<NotificationsScreen />);

    fireEvent.press(screen.getByTestId('notifications-session'));

    expect(mockSetPref).toHaveBeenCalledWith('sessionInviteEnabled', true);
  });
});
