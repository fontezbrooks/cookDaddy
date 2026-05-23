import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CookbookEntry, CookbookFilter } from '@/lib/use-pod-matches';
import { usePodMatches } from '@/lib/use-pod-matches';

import CookbookIndexScreen from '../index';

const mockPush = jest.fn();

jest.mock('@/lib/use-pod-matches', () => ({
  usePodMatches: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-image', () => ({
  Image: (props: { testID?: string }) => {
    const { View } = require('react-native');
    return <View {...props} />;
  },
}));

type PodMatchesReturn = ReturnType<typeof usePodMatches>;

const baseEntry: CookbookEntry = {
  matchId: 'match-1',
  recipeId: 'recipe-1',
  title: 'Cacio e Pepe',
  imageUrl: 'https://example.com/cacio.jpg',
  readyInMinutes: 20,
  servings: 2,
  matchedAt: '2026-05-23T12:00:00.000Z',
  cookedAt: null,
  removedAt: null,
};

function setPodMatchesReturn(value: PodMatchesReturn) {
  jest.mocked(usePodMatches).mockReturnValue(value);
}

function entry(overrides: Partial<CookbookEntry> = {}): CookbookEntry {
  return { ...baseEntry, ...overrides };
}

describe('CookbookIndexScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    jest.mocked(usePodMatches).mockReset();
    setPodMatchesReturn({ data: [], isLoading: false, error: null });
  });

  it('renders the loading state', () => {
    setPodMatchesReturn({ data: undefined, isLoading: true, error: null });

    render(<CookbookIndexScreen />);

    expect(screen.getByTestId('cookbook-loading')).toBeOnTheScreen();
  });

  it('renders a tile per entry with title', () => {
    setPodMatchesReturn({
      data: [entry(), entry({ matchId: 'match-2', title: 'Roast Squash' })],
      isLoading: false,
      error: null,
    });

    render(<CookbookIndexScreen />);

    expect(screen.getByTestId('cookbook-tile-match-1')).toHaveTextContent('Cacio e Pepe');
    expect(screen.getByTestId('cookbook-tile-match-2')).toHaveTextContent('Roast Squash');
  });

  it('opens the cookbook detail route when a tile is pressed', () => {
    setPodMatchesReturn({ data: [entry()], isLoading: false, error: null });

    render(<CookbookIndexScreen />);
    fireEvent.press(screen.getByTestId('cookbook-tile-match-1'));

    expect(mockPush).toHaveBeenCalledWith('/cookbook/match-1');
  });

  it('selecting the Cooked tab calls usePodMatches with cooked', () => {
    render(<CookbookIndexScreen />);

    fireEvent.press(screen.getByTestId('cookbook-filter-cooked'));

    expect(usePodMatches).toHaveBeenLastCalledWith('cooked' satisfies CookbookFilter);
  });

  it('selecting the To cook tab calls usePodMatches with unattempted', () => {
    render(<CookbookIndexScreen />);

    fireEvent.press(screen.getByTestId('cookbook-filter-unattempted'));

    expect(usePodMatches).toHaveBeenLastCalledWith('unattempted' satisfies CookbookFilter);
  });

  it('shows the all-list empty state copy', () => {
    render(<CookbookIndexScreen />);

    expect(screen.getByTestId('cookbook-empty')).toHaveTextContent(
      'No recipes here yet — go swipe with your partner!',
    );
  });

  it('shows the error state', () => {
    setPodMatchesReturn({
      data: undefined,
      isLoading: false,
      error: new Error('failed'),
    });

    render(<CookbookIndexScreen />);

    expect(screen.getByTestId('cookbook-error')).toHaveTextContent(
      'Couldn’t load your cookbook. Pull to retry.',
    );
  });

  it('shows a Cooked badge for cooked entries', () => {
    setPodMatchesReturn({
      data: [entry({ cookedAt: '2026-05-23T13:00:00.000Z' })],
      isLoading: false,
      error: null,
    });

    render(<CookbookIndexScreen />);

    expect(screen.getByTestId('cookbook-tile-match-1')).toHaveTextContent(/Cooked/);
  });
});
