/**
 * Protected layout per WORKFLOW §7:
 *   • When Clerk reports no signed-in session, render a <Redirect /> to
 *     /(auth)/sign-in. The (app) tree must NOT render.
 *   • When signed in, render the children Stack.
 *   • Signed-in users who have not completed onboarding redirect to
 *     /onboarding, unless they are already inside that segment.
 *   • While Clerk is still loading, render a loading placeholder (not a
 *     redirect — would otherwise bounce the user mid-hydration).
 */

import { useAuth } from '@clerk/clerk-expo';
import { render } from '@testing-library/react-native';

import ProtectedLayout from '../_layout';

// usePodSync touches TanStack Query + Supabase; here we just need it to be a
// no-op so the layout's render contract stays the unit under test.
jest.mock('@/lib/use-pod-sync', () => ({
  usePodSync: jest.fn(),
}));

jest.mock('@/lib/use-push-foreground', () => ({
  usePushForeground: jest.fn(),
}));

jest.mock('@/lib/use-push-deep-link', () => ({
  usePushDeepLink: jest.fn(),
}));

jest.mock('@/components/push-priming-sheet', () => ({
  PushPrimingSheet: () => null,
}));

// Capture <Redirect /> targets so the test can assert the route.
const mockRedirect = jest.fn();
let mockSegments: string[] = [];
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    Redirect: (props: { href: string }) => {
      mockRedirect(props.href);
      return React.createElement('Redirect', { href: props.href });
    },
    Stack: (props: { children?: React.ReactNode }) =>
      React.createElement('Stack', null, props.children),
    useSegments: jest.fn(() => mockSegments),
  };
});

let mockCompletedByUser: Record<string, { completed: boolean; step: number }> = {};
jest.mock('@/state/useOnboardingStore', () => ({
  useOnboardingStore: (selector: (state: unknown) => unknown) =>
    selector({ completedByUser: mockCompletedByUser }),
}));

describe('(app)/_layout', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockSegments = [];
    mockCompletedByUser = {};
  });

  it('redirects to /sign-in when no Clerk session', () => {
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      getToken: jest.fn(),
      signOut: jest.fn(),
    } as never);

    const tree = render(<ProtectedLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/sign-in');
    expect(tree.UNSAFE_getByType('Redirect' as never)).toBeTruthy();
  });

  it('shows a loading placeholder while Clerk is still hydrating', () => {
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      userId: null,
      getToken: jest.fn(),
      signOut: jest.fn(),
    } as never);

    const tree = render(<ProtectedLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(tree.getByTestId('protected-loading')).toBeOnTheScreen();
  });

  it('renders the navigation stack when signed in and onboarding is completed', () => {
    mockCompletedByUser = { user_abc: { completed: true, step: 2 } };
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_abc',
      getToken: jest.fn().mockResolvedValue('jwt-fixture'),
      signOut: jest.fn(),
    } as never);

    const tree = render(<ProtectedLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(tree.UNSAFE_getByType('Stack' as never)).toBeTruthy();
  });

  it('redirects to onboarding when signed in and onboarding is not completed', () => {
    mockSegments = ['(app)', '(tabs)', 'home'];
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_abc',
      getToken: jest.fn().mockResolvedValue('jwt-fixture'),
      signOut: jest.fn(),
    } as never);

    const tree = render(<ProtectedLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
    expect(tree.UNSAFE_getByType('Redirect' as never)).toBeTruthy();
  });

  it('renders the navigation stack when already in onboarding to avoid a redirect loop', () => {
    mockSegments = ['(app)', 'onboarding'];
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_abc',
      getToken: jest.fn().mockResolvedValue('jwt-fixture'),
      signOut: jest.fn(),
    } as never);

    const tree = render(<ProtectedLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(tree.UNSAFE_getByType('Stack' as never)).toBeTruthy();
  });
});
