/**
 * Sign-in screen contract per DESIGN §4 + WORKFLOW §7:
 *   • Apple, Google, Email sign-in options are visible.
 *   • Tapping the Apple button starts Clerk's oauth_apple flow.
 *   • A successful OAuth flow activates the session and redirects to /home.
 */

import { useOAuth, useSignIn, useSignUp } from '@clerk/clerk-expo';
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

function mockDefaultClerk() {
  jest.mocked(useOAuth).mockReturnValue({
    startOAuthFlow: jest.fn().mockResolvedValue({}),
  } as never);
  jest.mocked(useSignIn).mockReturnValue({
    isLoaded: true,
    signIn: {
      create: jest.fn().mockResolvedValue(undefined),
      attemptFirstFactor: jest.fn().mockResolvedValue({ status: 'needs_first_factor' }),
    },
    setActive: jest.fn(),
  } as never);
  jest.mocked(useSignUp).mockReturnValue({
    isLoaded: true,
    signUp: {
      create: jest.fn().mockResolvedValue(undefined),
      prepareEmailAddressVerification: jest.fn().mockResolvedValue(undefined),
      attemptEmailAddressVerification: jest
        .fn()
        .mockResolvedValue({ status: 'missing_requirements' }),
    },
    setActive: jest.fn(),
  } as never);
}

describe('SignInScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockCapture.mockClear();
    Object.keys(mockSearchParams).forEach(
      (k) => delete (mockSearchParams as Record<string, unknown>)[k],
    );
    jest.mocked(useOAuth).mockReset();
    jest.mocked(useSignIn).mockReset();
    jest.mocked(useSignUp).mockReset();
    mockDefaultClerk();
  });

  it('renders Apple, Google, and Email sign-in options', () => {
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
      expect(screen.getByTestId('sign-in-error')).toHaveTextContent(/Something went wrong/);
    });
  });

  it('email submit advances to the code step (sign in)', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useSignIn).mockReturnValue({
      isLoaded: true,
      signIn: { create, attemptFirstFactor: jest.fn() },
      setActive: jest.fn(),
    } as never);

    render(<SignInScreen />);
    fireEvent.changeText(screen.getByTestId('sign-in-email-input'), 'me@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-in-email-submit'));
    });

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({ identifier: 'me@example.com', strategy: 'email_code' });
      expect(screen.getByTestId('auth-code-input')).toBeOnTheScreen();
    });
  });

  it('sign-up happy path', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const prepareEmailAddressVerification = jest.fn().mockResolvedValue(undefined);
    const attemptEmailAddressVerification = jest.fn().mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_su',
    });
    const setActive = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useSignUp).mockReturnValue({
      isLoaded: true,
      signUp: { create, prepareEmailAddressVerification, attemptEmailAddressVerification },
      setActive,
    } as never);

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('auth-mode-signup'));
    fireEvent.changeText(screen.getByTestId('sign-in-email-input'), 'new@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-in-email-submit'));
    });

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({ emailAddress: 'new@example.com' });
      expect(prepareEmailAddressVerification).toHaveBeenCalledWith({ strategy: 'email_code' });
      expect(screen.getByTestId('auth-code-input')).toBeOnTheScreen();
    });

    fireEvent.changeText(screen.getByTestId('auth-code-input'), '123456');
    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-code-verify'));
    });

    await waitFor(() => {
      expect(attemptEmailAddressVerification).toHaveBeenCalledWith({ code: '123456' });
      expect(setActive).toHaveBeenCalledWith({ session: 'sess_su' });
      expect(mockCapture).toHaveBeenCalledWith('signed_in', { provider: 'email' });
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('sign-in verify completes', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const attemptFirstFactor = jest.fn().mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_si',
    });
    const setActive = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useSignIn).mockReturnValue({
      isLoaded: true,
      signIn: { create, attemptFirstFactor },
      setActive,
    } as never);

    render(<SignInScreen />);
    fireEvent.changeText(screen.getByTestId('sign-in-email-input'), 'me@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-in-email-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('auth-code-input')).toBeOnTheScreen());

    fireEvent.changeText(screen.getByTestId('auth-code-input'), '654321');
    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-code-verify'));
    });

    await waitFor(() => {
      expect(attemptFirstFactor).toHaveBeenCalledWith({ strategy: 'email_code', code: '654321' });
      expect(setActive).toHaveBeenCalledWith({ session: 'sess_si' });
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('does not redirect when the code attempt is not complete', async () => {
    const attemptFirstFactor = jest.fn().mockResolvedValue({ status: 'needs_second_factor' });
    const setActive = jest.fn();
    jest.mocked(useSignIn).mockReturnValue({
      isLoaded: true,
      signIn: { create: jest.fn().mockResolvedValue(undefined), attemptFirstFactor },
      setActive,
    } as never);
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByTestId('sign-in-email-input'), 'me@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-in-email-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('auth-code-input')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('auth-code-input'), '222222');
    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-code-verify'));
    });
    await waitFor(() => {
      expect(setActive).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockCapture).not.toHaveBeenCalledWith('signed_in', { provider: 'email' });
      expect(screen.getByTestId('sign-in-error')).toBeOnTheScreen();
      expect(screen.getByTestId('auth-code-input')).toBeOnTheScreen();
    });
  });

  it('wrong code shows error, stays on code step', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const attemptFirstFactor = jest.fn().mockRejectedValue({
      errors: [{ code: 'form_code_incorrect' }],
    });
    jest.mocked(useSignIn).mockReturnValue({
      isLoaded: true,
      signIn: { create, attemptFirstFactor },
      setActive: jest.fn(),
    } as never);

    render(<SignInScreen />);
    fireEvent.changeText(screen.getByTestId('sign-in-email-input'), 'me@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-in-email-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('auth-code-input')).toBeOnTheScreen());

    fireEvent.changeText(screen.getByTestId('auth-code-input'), '111111');
    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-code-verify'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('sign-in-error')).toHaveTextContent(/code isn't right/);
      expect(screen.getByTestId('auth-code-input')).toBeOnTheScreen();
    });
  });

  it('toggle preserves email', () => {
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByTestId('sign-in-email-input'), 'me@example.com');
    fireEvent.press(screen.getByTestId('auth-mode-signup'));

    expect(screen.getByTestId('sign-in-email-input')).toHaveProp('value', 'me@example.com');
  });

  it('existing-account error offers switch', async () => {
    const create = jest.fn().mockRejectedValue({
      errors: [{ code: 'form_identifier_exists' }],
    });
    const prepareEmailAddressVerification = jest.fn();
    jest.mocked(useSignUp).mockReturnValue({
      isLoaded: true,
      signUp: {
        create,
        prepareEmailAddressVerification,
        attemptEmailAddressVerification: jest.fn(),
      },
      setActive: jest.fn(),
    } as never);

    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId('auth-mode-signup'));
    fireEvent.changeText(screen.getByTestId('sign-in-email-input'), 'existing@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-in-email-submit'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-switch-mode')).toBeOnTheScreen();
      expect(screen.getByTestId('sign-in-error')).toHaveTextContent(
        'That email already has an account.',
      );
    });

    fireEvent.press(screen.getByTestId('auth-switch-mode'));

    await waitFor(() => {
      expect(screen.queryByTestId('auth-switch-mode')).toBeNull();
      expect(screen.getByTestId('sign-in-email-input')).toBeOnTheScreen();
      expect(screen.queryByTestId('auth-code-input')).toBeNull();
    });
  });

  it('change email returns to method step', async () => {
    jest.mocked(useSignIn).mockReturnValue({
      isLoaded: true,
      signIn: { create: jest.fn().mockResolvedValue(undefined), attemptFirstFactor: jest.fn() },
      setActive: jest.fn(),
    } as never);

    render(<SignInScreen />);
    fireEvent.changeText(screen.getByTestId('sign-in-email-input'), 'me@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-in-email-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('auth-code-input')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('auth-code-change-email'));

    expect(screen.getByTestId('auth-mode-toggle')).toBeOnTheScreen();
    expect(screen.queryByTestId('auth-code-input')).toBeNull();
  });

  it('resend re-sends the code after the cooldown elapses', async () => {
    jest.useFakeTimers();
    try {
      const create = jest.fn().mockResolvedValue(undefined);
      jest.mocked(useSignIn).mockReturnValue({
        isLoaded: true,
        signIn: { create, attemptFirstFactor: jest.fn() },
        setActive: jest.fn(),
      } as never);

      render(<SignInScreen />);
      fireEvent.changeText(screen.getByTestId('sign-in-email-input'), 'me@example.com');
      await act(async () => {
        fireEvent.press(screen.getByTestId('sign-in-email-submit'));
      });

      expect(create).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('auth-code-input')).toBeOnTheScreen();
      expect(screen.getByTestId('auth-code-resend')).toHaveTextContent(/Resend in/);

      act(() => {
        jest.advanceTimersByTime(30000);
      });

      expect(screen.getByTestId('auth-code-resend')).toHaveTextContent(/Resend code/);

      await act(async () => {
        fireEvent.press(screen.getByTestId('auth-code-resend'));
      });

      expect(create).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
