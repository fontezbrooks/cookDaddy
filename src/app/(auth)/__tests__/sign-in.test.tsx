/**
 * Sign-in screen contract per DESIGN §4 + WORKFLOW §7:
 *   • Apple, Google, Email sign-in options are visible.
 *   • Tapping the Apple button starts Clerk's oauth_apple flow.
 *   • A successful OAuth flow activates the session and redirects to /home.
 */

import { useOAuth, useSignIn } from '@clerk/clerk-expo';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SignInScreen from '../sign-in';

const mockReplace = jest.fn();
const mockCapture = jest.fn();
const mockSearchParams: { redirect?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));
jest.mock('@/lib/analytics', () => ({
  useAnalytics: () => ({
    capture: mockCapture,
    identify: jest.fn(),
    group: jest.fn(),
    reset: jest.fn(),
  }),
}));

describe('SignInScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockCapture.mockClear();
    Object.keys(mockSearchParams).forEach(
      (k) => delete (mockSearchParams as Record<string, unknown>)[k],
    );
    jest.mocked(useOAuth).mockReset();
  });

  it('renders Apple, Google, and Email sign-in options', () => {
    jest.mocked(useOAuth).mockReturnValue({
      startOAuthFlow: jest.fn().mockResolvedValue({}),
    } as never);

    render(<SignInScreen />);
    expect(screen.getByTestId('sign-in-apple')).toBeOnTheScreen();
    expect(screen.getByTestId('sign-in-google')).toBeOnTheScreen();
    expect(screen.getByTestId('sign-in-email-input')).toBeOnTheScreen();
  });

  it('starts Clerk oauth_apple flow when Apple button is pressed', async () => {
    const startApple = jest.fn().mockResolvedValue({ createdSessionId: null });
    jest.mocked(useOAuth).mockImplementation(
      ({ strategy }: { strategy: string }) =>
        ({
          startOAuthFlow: strategy === 'oauth_apple' ? startApple : jest.fn(),
        }) as never,
    );

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('sign-in-apple'));

    await waitFor(() => expect(startApple).toHaveBeenCalledTimes(1));
  });

  it('routes to /home on successful Apple OAuth', async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    const startApple = jest.fn().mockResolvedValue({
      createdSessionId: 'sess_123',
      setActive,
    });
    jest.mocked(useOAuth).mockImplementation(
      ({ strategy }: { strategy: string }) =>
        ({
          startOAuthFlow: strategy === 'oauth_apple' ? startApple : jest.fn(),
        }) as never,
    );

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('sign-in-apple'));

    await waitFor(() => {
      expect(setActive).toHaveBeenCalledWith({ session: 'sess_123' });
      expect(mockCapture).toHaveBeenCalledWith('signed_in', { provider: 'apple' });
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('routes to ?redirect= target after Apple OAuth when an in-app path is supplied', async () => {
    mockSearchParams.redirect = '/invite/abc123';
    const setActive = jest.fn().mockResolvedValue(undefined);
    const startApple = jest.fn().mockResolvedValue({ createdSessionId: 'sess_abc', setActive });
    jest.mocked(useOAuth).mockImplementation(
      ({ strategy }: { strategy: string }) =>
        ({
          startOAuthFlow: strategy === 'oauth_apple' ? startApple : jest.fn(),
        }) as never,
    );

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('sign-in-apple'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/invite/abc123');
    });
  });

  it('falls back to /home when ?redirect= points outside the app (protocol-relative)', async () => {
    mockSearchParams.redirect = '//evil.example.com/steal';
    const setActive = jest.fn().mockResolvedValue(undefined);
    const startApple = jest.fn().mockResolvedValue({ createdSessionId: 'sess_evil', setActive });
    jest.mocked(useOAuth).mockImplementation(
      ({ strategy }: { strategy: string }) =>
        ({
          startOAuthFlow: strategy === 'oauth_apple' ? startApple : jest.fn(),
        }) as never,
    );

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('sign-in-apple'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
      expect(mockReplace).not.toHaveBeenCalledWith('//evil.example.com/steal');
    });
  });

  it('surfaces an error message if Apple OAuth throws', async () => {
    const startApple = jest.fn().mockRejectedValue(new Error('user cancelled'));
    jest.mocked(useOAuth).mockImplementation(
      ({ strategy }: { strategy: string }) =>
        ({
          startOAuthFlow: strategy === 'oauth_apple' ? startApple : jest.fn(),
        }) as never,
    );

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('sign-in-apple'));

    await waitFor(() => {
      expect(screen.getByTestId('sign-in-error')).toHaveTextContent(/user cancelled/);
    });
  });

  it('email submit calls Clerk signIn.create with the email + code strategy', async () => {
    jest.mocked(useOAuth).mockReturnValue({
      startOAuthFlow: jest.fn().mockResolvedValue({}),
    } as never);
    const create = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useSignIn).mockReturnValue({
      isLoaded: true,
      signIn: { create, authenticateWithRedirect: jest.fn() },
      setActive: jest.fn(),
    } as never);

    render(<SignInScreen />);
    fireEvent.changeText(screen.getByTestId('sign-in-email-input'), 'me@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-in-email-submit'));
    });

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'me@example.com', strategy: 'email_code' }),
      );
      expect(screen.getByTestId('sign-in-error')).toHaveTextContent(/Check your email/);
    });
  });
});
