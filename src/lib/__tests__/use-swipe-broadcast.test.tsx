/**
 * Partner-mirroring hook for P6c. Subscribes to a Supabase Realtime
 * channel `session:<id>` and:
 *   • broadcasts `swipe.commit` / `swipe.progress` for self,
 *   • exposes the most recent PARTNER event so the UI can render a
 *     "swipe whisper" (light haptic + opacity pulse) per MATCH-UX §2.
 * Echoes (events whose userId matches the caller) are ignored so we
 * don't pulse against our own swipes.
 */

import { useAuth } from '@clerk/clerk-expo';
import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useSwipeBroadcast } from '@/lib/use-swipe-broadcast';

type BroadcastHandler = (payload: { event: string; payload: unknown }) => void;

// jest.mock hoists above let/const; out-of-scope refs are only legal when
// prefixed with `mock`. State is grouped under `mockState` so the factory
// and the tests share the same instances.
const mockState = {
  lastChannelName: '',
  handlers: new Map<string, BroadcastHandler>(),
  send: jest.fn(),
  subscribe: jest.fn(),
  removeChannel: jest.fn(),
};

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => ({
    channel: (name: string) => {
      mockState.lastChannelName = name;
      mockState.handlers = new Map();
      const channel = {
        on: (_kind: 'broadcast', opts: { event: string }, cb: BroadcastHandler) => {
          mockState.handlers.set(opts.event, cb);
          return channel;
        },
        subscribe: (...args: unknown[]) => mockState.subscribe(...args),
        send: (...args: unknown[]) => mockState.send(...args),
      };
      return channel;
    },
    removeChannel: (...args: unknown[]) => mockState.removeChannel(...args),
  }),
}));

function setSignedIn(userId = 'user_alice') {
  jest.mocked(useAuth).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId,
    getToken: jest.fn().mockResolvedValue('jwt'),
    signOut: jest.fn(),
  } as never);
}

type Captured = ReturnType<typeof useSwipeBroadcast> | null;
function Harness({ captureRef }: { captureRef: { current: Captured } }) {
  const bcast = useSwipeBroadcast('sess-1');
  captureRef.current = bcast;
  return <Text testID="bcast">{bcast.partnerCommit?.direction ?? 'none'}</Text>;
}

function makeRef(): { current: Captured } {
  return { current: null };
}

describe('useSwipeBroadcast', () => {
  beforeEach(() => {
    mockState.send.mockReset().mockResolvedValue('ok');
    mockState.subscribe.mockReset().mockReturnThis();
    mockState.removeChannel.mockReset();
    mockState.lastChannelName = '';
    mockState.handlers = new Map();
    setSignedIn();
  });

  it('subscribes to channel session:<id> on mount and cleans up on unmount', () => {
    const ref = makeRef();
    const view = render(<Harness captureRef={ref} />);
    expect(mockState.lastChannelName).toBe('session:sess-1');
    expect(mockState.subscribe).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(mockState.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('broadcastCommit sends {type:broadcast, event:swipe.commit, payload}', async () => {
    const ref = makeRef();
    render(<Harness captureRef={ref} />);
    await act(async () => {
      await ref.current!.broadcastCommit({ recipeId: 'r-1', direction: 'right' });
    });
    expect(mockState.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'swipe.commit',
      payload: { recipeId: 'r-1', direction: 'right', userId: 'user_alice' },
    });
  });

  it('broadcastProgress sends a progress event with fraction + recipeId', async () => {
    const ref = makeRef();
    render(<Harness captureRef={ref} />);
    await act(async () => {
      await ref.current!.broadcastProgress({ recipeId: 'r-1', fraction: 0.42 });
    });
    expect(mockState.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'swipe.progress',
      payload: { recipeId: 'r-1', fraction: 0.42, userId: 'user_alice' },
    });
  });

  it('exposes the partner commit when a foreign userId publishes', () => {
    const ref = makeRef();
    render(<Harness captureRef={ref} />);
    act(() => {
      mockState.handlers.get('swipe.commit')!({
        event: 'swipe.commit',
        payload: { recipeId: 'r-1', direction: 'right', userId: 'user_bob' },
      });
    });
    expect(ref.current!.partnerCommit).toEqual({
      recipeId: 'r-1',
      direction: 'right',
    });
  });

  it('ignores echoes — events whose userId matches the caller', () => {
    const ref = makeRef();
    render(<Harness captureRef={ref} />);
    act(() => {
      mockState.handlers.get('swipe.commit')!({
        event: 'swipe.commit',
        payload: { recipeId: 'r-1', direction: 'right', userId: 'user_alice' },
      });
    });
    expect(ref.current!.partnerCommit).toBeNull();
  });

  it('exposes partner progress fraction', () => {
    const ref = makeRef();
    render(<Harness captureRef={ref} />);
    act(() => {
      mockState.handlers.get('swipe.progress')!({
        event: 'swipe.progress',
        payload: { recipeId: 'r-1', fraction: 0.7, userId: 'user_bob' },
      });
    });
    expect(ref.current!.partnerProgress).toEqual({
      recipeId: 'r-1',
      fraction: 0.7,
    });
  });

  it('broadcastMatch sends a match.created event with the enriched payload', async () => {
    const ref = makeRef();
    render(<Harness captureRef={ref} />);
    await act(async () => {
      await ref.current!.broadcastMatch({
        matchId: 'm-1',
        recipeId: 'r-1',
        recipeTitle: 'Cacio e Pepe',
        recipeImageUrl: 'https://example/img.jpg',
      });
    });
    expect(mockState.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'match.created',
      payload: {
        matchId: 'm-1',
        recipeId: 'r-1',
        recipeTitle: 'Cacio e Pepe',
        recipeImageUrl: 'https://example/img.jpg',
        userId: 'user_alice',
      },
    });
  });

  it('exposes partnerMatch when a foreign userId publishes match.created', () => {
    const ref = makeRef();
    render(<Harness captureRef={ref} />);
    act(() => {
      mockState.handlers.get('match.created')!({
        event: 'match.created',
        payload: {
          matchId: 'm-1',
          recipeId: 'r-1',
          recipeTitle: 'Cacio e Pepe',
          recipeImageUrl: null,
          userId: 'user_bob',
        },
      });
    });
    expect(ref.current!.partnerMatch).toEqual({
      matchId: 'm-1',
      recipeId: 'r-1',
      recipeTitle: 'Cacio e Pepe',
      recipeImageUrl: null,
    });
  });

  it('ignores match.created echoes from the caller themselves', () => {
    const ref = makeRef();
    render(<Harness captureRef={ref} />);
    act(() => {
      mockState.handlers.get('match.created')!({
        event: 'match.created',
        payload: {
          matchId: 'm-1',
          recipeId: 'r-1',
          recipeTitle: 'Cacio e Pepe',
          recipeImageUrl: null,
          userId: 'user_alice',
        },
      });
    });
    expect(ref.current!.partnerMatch).toBeNull();
  });
});
