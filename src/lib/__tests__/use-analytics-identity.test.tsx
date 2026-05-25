import { act, renderHook } from '@testing-library/react-native';

import { useAnalyticsIdentity } from '@/lib/use-analytics-identity';
import { __resetPodStoreForTests, usePodStore } from '@/state/usePodStore';

const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockGroup = jest.fn();
const mockReset = jest.fn();

let mockAuthState: {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
};
let mockUserState: {
  user: {
    fullName?: string | null;
    username?: string | null;
    createdAt?: Date | string | null;
    emailAddresses?: unknown[];
  } | null;
};

jest.mock('@/lib/analytics', () => ({
  useAnalytics: () => ({
    capture: mockCapture,
    identify: mockIdentify,
    group: mockGroup,
    reset: mockReset,
  }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: jest.fn(() => mockAuthState),
  useUser: jest.fn(() => mockUserState),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.2.3',
    },
  },
}));

describe('useAnalyticsIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = { isLoaded: true, isSignedIn: false, userId: null };
    mockUserState = { user: null };
    __resetPodStoreForTests();
  });

  it('captures app_opened exactly once on mount', () => {
    const { rerender } = renderHook(() => useAnalyticsIdentity());

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith(
      'app_opened',
      expect.objectContaining({
        app_version: '1.2.3',
        cold_start: true,
        locale: expect.any(String),
        platform: expect.any(String),
      }),
    );

    rerender({});

    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('identifies signed-in users without email properties', () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    mockAuthState = { isLoaded: true, isSignedIn: true, userId: 'user_123' };
    mockUserState = {
      user: {
        fullName: 'Alex Cook',
        username: 'alex',
        createdAt,
        emailAddresses: [{ emailAddress: 'alex@example.com' }],
      },
    };

    renderHook(() => useAnalyticsIdentity());

    expect(mockIdentify).toHaveBeenCalledWith(
      'user_123',
      expect.objectContaining({
        created_at: '2026-01-02T03:04:05.000Z',
        display_name: 'Alex Cook',
        platform: expect.any(String),
        pod_id: null,
      }),
    );
    const identifyProps = mockIdentify.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(identifyProps).not.toHaveProperty('email');
  });

  it('re-identifies and groups on pod join', () => {
    mockAuthState = { isLoaded: true, isSignedIn: true, userId: 'user_123' };
    mockUserState = { user: { fullName: 'Alex Cook', createdAt: null } };
    const { rerender } = renderHook(() => useAnalyticsIdentity());

    expect(mockIdentify).toHaveBeenLastCalledWith(
      'user_123',
      expect.objectContaining({ pod_id: null }),
    );

    act(() => {
      usePodStore.getState().setActivePod({
        podId: 'pod_123',
        partnerId: 'partner_123',
        partnerDisplayName: 'Sam Cook',
      });
    });
    rerender({});

    expect(mockIdentify).toHaveBeenLastCalledWith(
      'user_123',
      expect.objectContaining({ pod_id: 'pod_123' }),
    );
    expect(mockGroup).toHaveBeenLastCalledWith('pod', 'pod_123', { member_count: 2 });

    act(() => {
      usePodStore.getState().setActivePod({
        podId: 'pod_456',
        partnerId: '',
        partnerDisplayName: '',
      });
    });
    rerender({});

    expect(mockGroup).toHaveBeenLastCalledWith('pod', 'pod_456', { member_count: 1 });
  });

  it('resets analytics on sign-out transition', () => {
    mockAuthState = { isLoaded: true, isSignedIn: true, userId: 'user_123' };
    mockUserState = { user: { fullName: 'Alex Cook', createdAt: null } };
    const { rerender } = renderHook(() => useAnalyticsIdentity());

    expect(mockReset).not.toHaveBeenCalled();

    mockAuthState = { isLoaded: true, isSignedIn: false, userId: null };
    rerender({});

    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});
