import { useAuth } from '@clerk/clerk-expo';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { MatchDetail } from '@/lib/use-match-detail';
import { __resetPodStoreForTests, usePodStore } from '@/state/usePodStore';

import CookbookDetailScreen from '../[matchId]';

const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  useMutation: (config: {
    mutationFn: () => Promise<unknown>;
    onSuccess?: (data: unknown) => void;
  }) => ({
    isPending: false,
    mutate: () => {
      void config.mutationFn().then((data) => config.onSuccess?.(data));
    },
  }),
}));

const mockUseMatchDetail = jest.fn();
jest.mock('@/lib/use-match-detail', () => ({
  useMatchDetail: (...args: unknown[]) => mockUseMatchDetail(...args),
}));

const mockMarkCooked = jest.fn();
const mockRemoveFromCookbook = jest.fn();
jest.mock('@/lib/use-pod-matches', () => ({
  markCooked: (...args: unknown[]) => mockMarkCooked(...args),
  removeFromCookbook: (...args: unknown[]) => mockRemoveFromCookbook(...args),
}));

const mockAddShopping = jest.fn();
jest.mock('@/lib/use-shopping-list', () => ({
  addShoppingItemsFromRecipe: (...args: unknown[]) => mockAddShopping(...args),
}));

const mockNotificationSuccess = jest.fn();
jest.mock('@/lib/haptics', () => ({
  haptics: { notificationSuccess: () => mockNotificationSuccess() },
}));

const mockClient = { from: jest.fn() };
jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ matchId: 'm1' }),
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: unknown) => React.createElement(View, props),
  };
});

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

const detail: MatchDetail = {
  matchId: 'm1',
  recipeId: 'r1',
  title: 'Lemony Pasta',
  imageUrl: 'https://example.test/pasta.jpg',
  readyInMinutes: 25,
  servings: 3,
  sourceUrl: 'https://example.test/recipe',
  sourceName: 'Example Kitchen',
  cookedAt: null,
  removedAt: null,
  ingredients: [
    {
      id: 'ing-1',
      name: 'spaghetti',
      originalText: '8 oz spaghetti',
      amount: 8,
      unit: 'oz',
    },
    {
      id: 'ing-2',
      name: 'lemon',
      originalText: null,
      amount: 1,
      unit: null,
    },
  ],
  nutrients: [
    { name: 'Calories', amount: 330.4, unit: 'kcal', percentOfDailyNeeds: 16.5 },
    { name: 'Protein', amount: 24, unit: 'g', percentOfDailyNeeds: 48 },
    { name: 'Sodium', amount: 410, unit: 'mg', percentOfDailyNeeds: null },
  ],
  instructionSteps: [
    { stepNumber: 1, text: 'Boil the pasta.', lengthNumber: 10, lengthUnit: 'minutes' },
    { stepNumber: 2, text: 'Zest the lemon.', lengthNumber: null, lengthUnit: null },
  ],
};

describe('CookbookDetailScreen', () => {
  beforeEach(() => {
    __resetPodStoreForTests();
    mockUseMatchDetail.mockReset();
    mockMarkCooked.mockReset().mockResolvedValue(undefined);
    mockRemoveFromCookbook.mockReset().mockResolvedValue(undefined);
    mockAddShopping.mockReset().mockResolvedValue({ insertedCount: 2, pantryConflicts: [] });
    mockNotificationSuccess.mockReset();
    mockInvalidateQueries.mockReset();
    mockBack.mockClear();
    mockReplace.mockClear();
    setSignedIn();
  });

  it('renders the loading state', () => {
    mockUseMatchDetail.mockReturnValue({ data: undefined, isLoading: true, error: null });

    render(<CookbookDetailScreen />);

    expect(screen.getByTestId('cookbook-detail-loading')).toBeOnTheScreen();
  });

  it('renders the error state', () => {
    mockUseMatchDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('failed'),
    });

    render(<CookbookDetailScreen />);

    expect(screen.getByTestId('cookbook-detail-error')).toBeOnTheScreen();
  });

  it('renders the not-found state with a back-home CTA', () => {
    mockUseMatchDetail.mockReturnValue({ data: undefined, isLoading: false, error: null });

    render(<CookbookDetailScreen />);
    fireEvent.press(screen.getByTestId('cookbook-detail-back-home'));

    expect(screen.getByTestId('cookbook-detail-not-found')).toBeOnTheScreen();
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('renders recipe title, meta, and ingredients', () => {
    mockUseMatchDetail.mockReturnValue({ data: detail, isLoading: false, error: null });

    render(<CookbookDetailScreen />);

    expect(screen.getByText('Lemony Pasta')).toBeOnTheScreen();
    expect(screen.getByText('25 min · 3 servings')).toBeOnTheScreen();
    expect(screen.getByTestId('ingredient-ing-1')).toHaveTextContent('8 oz spaghetti');
    expect(screen.getByTestId('ingredient-ing-2')).toHaveTextContent('lemon');
  });

  it('renders the nutrition panel', () => {
    mockUseMatchDetail.mockReturnValue({ data: detail, isLoading: false, error: null });

    render(<CookbookDetailScreen />);

    expect(screen.getByTestId('nutrition-panel')).toBeOnTheScreen();
    expect(screen.getByText('Calories')).toBeOnTheScreen();
    expect(screen.getByTestId('nutrient-0')).toHaveTextContent(/330\.4 kcal/);
    expect(screen.getByTestId('nutrient-0')).toHaveTextContent(/17%/);
    expect(screen.getByTestId('nutrient-2')).not.toHaveTextContent('%');
  });

  it('renders ordered numbered steps', () => {
    mockUseMatchDetail.mockReturnValue({ data: detail, isLoading: false, error: null });

    render(<CookbookDetailScreen />);

    const stepRows = screen.getAllByTestId(/^step-/);
    expect(screen.getByTestId('cooking-steps')).toBeOnTheScreen();
    expect(stepRows).toHaveLength(2);
    expect(stepRows[0]).toHaveTextContent('1. Boil the pasta. (10 minutes)');
    expect(stepRows[1]).toHaveTextContent('2. Zest the lemon.');
    expect(stepRows[1]).not.toHaveTextContent('(');
  });

  it('hides steps and nutrition when absent', () => {
    mockUseMatchDetail.mockReturnValue({
      data: { ...detail, nutrients: [], instructionSteps: [] },
      isLoading: false,
      error: null,
    });

    const { rerender } = render(<CookbookDetailScreen />);

    expect(screen.queryByTestId('nutrition-panel')).toBeNull();
    expect(screen.queryByTestId('cooking-steps')).toBeNull();

    mockUseMatchDetail.mockReturnValue({
      data: { ...detail, nutrients: undefined, instructionSteps: undefined },
      isLoading: false,
      error: null,
    });

    expect(() => rerender(<CookbookDetailScreen />)).not.toThrow();
    expect(screen.queryByTestId('nutrition-panel')).toBeNull();
    expect(screen.queryByTestId('cooking-steps')).toBeNull();
  });

  it('marks a recipe cooked and fires success haptics', async () => {
    mockUseMatchDetail.mockReturnValue({ data: detail, isLoading: false, error: null });

    render(<CookbookDetailScreen />);
    fireEvent.press(screen.getByTestId('cookbook-mark-cooked'));

    await waitFor(() => {
      expect(mockMarkCooked).toHaveBeenCalledWith(mockClient, 'm1');
      expect(mockNotificationSuccess).toHaveBeenCalled();
    });
  });

  it('renders cooked entries as disabled', () => {
    mockUseMatchDetail.mockReturnValue({
      data: { ...detail, cookedAt: '2026-05-23T12:00:00.000Z' },
      isLoading: false,
      error: null,
    });

    render(<CookbookDetailScreen />);

    expect(screen.getByTestId('cookbook-mark-cooked')).toHaveTextContent('Cooked ✓');
    expect(screen.getByTestId('cookbook-mark-cooked').props.accessibilityState.disabled).toBe(true);
  });

  it('removes a recipe from the cookbook and navigates back', async () => {
    mockUseMatchDetail.mockReturnValue({ data: detail, isLoading: false, error: null });

    render(<CookbookDetailScreen />);
    fireEvent.press(screen.getByTestId('cookbook-remove'));

    await waitFor(() => {
      expect(mockRemoveFromCookbook).toHaveBeenCalledWith(mockClient, 'm1');
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('enables the shopping list button when a pod is active', () => {
    setActivePod();
    mockUseMatchDetail.mockReturnValue({ data: detail, isLoading: false, error: null });

    render(<CookbookDetailScreen />);

    expect(screen.getByTestId('cookbook-add-shopping').props.accessibilityState.disabled).toBe(
      false,
    );
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  it('adds recipe ingredients to the shopping list', async () => {
    setActivePod();
    mockUseMatchDetail.mockReturnValue({ data: detail, isLoading: false, error: null });

    render(<CookbookDetailScreen />);
    fireEvent.press(screen.getByTestId('cookbook-add-shopping'));

    await waitFor(() => {
      expect(mockAddShopping).toHaveBeenCalledWith(mockClient, {
        podId: 'pod-1',
        recipeId: 'r1',
        ingredientIds: ['ing-1', 'ing-2'],
      });
      expect(mockNotificationSuccess).toHaveBeenCalled();
      expect(screen.getByTestId('cookbook-shopping-status')).toHaveTextContent(/Added 2/);
    });
  });

  it('surfaces pantry conflicts', async () => {
    setActivePod();
    mockAddShopping.mockResolvedValue({ insertedCount: 2, pantryConflicts: ['Yellow Onion'] });
    mockUseMatchDetail.mockReturnValue({ data: detail, isLoading: false, error: null });

    render(<CookbookDetailScreen />);
    fireEvent.press(screen.getByTestId('cookbook-add-shopping'));

    await waitFor(() => {
      expect(screen.getByTestId('cookbook-shopping-status')).toHaveTextContent(
        /already in pantry: Yellow Onion/,
      );
    });
  });
});
