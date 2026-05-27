import { useAuth } from '@clerk/clerk-expo';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { ShoppingItem } from '@/lib/use-shopping-list';

import ShoppingScreen from '../shopping';

const mockInvalidateQueries = jest.fn();
const mockCapture = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  useMutation: (config: {
    mutationFn: (variables?: unknown) => Promise<void>;
    onSuccess?: () => void;
  }) => ({
    isPending: false,
    mutate: (variables?: unknown) => {
      void config.mutationFn(variables).then(() => config.onSuccess?.());
    },
  }),
}));

const mockUseShoppingList = jest.fn();
const mockAddShoppingItem = jest.fn();
const mockToggleChecked = jest.fn();
const mockClearChecked = jest.fn();
const mockMoveToPantry = jest.fn();
jest.mock('@/lib/use-shopping-list', () => ({
  useShoppingList: () => mockUseShoppingList(),
  addShoppingItem: (...args: unknown[]) => mockAddShoppingItem(...args),
  toggleChecked: (...args: unknown[]) => mockToggleChecked(...args),
  clearChecked: (...args: unknown[]) => mockClearChecked(...args),
  moveToPantry: (...args: unknown[]) => mockMoveToPantry(...args),
}));

const mockClient = { from: jest.fn() };
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

let mockActivePodId: string | null = 'pod-1';
jest.mock('@/state/usePodStore', () => ({
  usePodStore: (selector: (state: { activePodId: string | null }) => string | null) =>
    selector({ activePodId: mockActivePodId }),
}));

jest.mock('expo-router', () => ({
  Link: ({ children, href, testID }: { children: ReactNode; href: string; testID?: string }) => {
    const React = require('react');
    return React.createElement('Link', { href, testID }, children);
  },
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

const items: ShoppingItem[] = [
  {
    id: 'item-1',
    name: 'Olive Oil',
    quantity: 1,
    unit: 'bottle',
    category: 'Pantry',
    sourceRecipeId: null,
    addedByUserId: 'user_alice',
    checkedAt: null,
    createdAt: '2026-05-23T12:00:00.000Z',
  },
  {
    id: 'item-2',
    name: 'Tomatoes',
    quantity: 4,
    unit: null,
    category: null,
    sourceRecipeId: null,
    addedByUserId: 'user_bob',
    checkedAt: '2026-05-23T13:00:00.000Z',
    createdAt: '2026-05-23T12:05:00.000Z',
  },
];

describe('ShoppingScreen', () => {
  beforeEach(() => {
    mockActivePodId = 'pod-1';
    mockUseShoppingList.mockReset().mockReturnValue({ data: items, isLoading: false, error: null });
    mockAddShoppingItem.mockReset().mockResolvedValue(undefined);
    mockToggleChecked.mockReset().mockResolvedValue(undefined);
    mockClearChecked.mockReset().mockResolvedValue(undefined);
    mockMoveToPantry.mockReset().mockResolvedValue(undefined);
    mockInvalidateQueries.mockReset();
    mockCapture.mockReset();
    setSignedIn();
  });

  it('renders grouped shopping items and the pantry link', () => {
    render(<ShoppingScreen />);

    expect(screen.getByTestId('shopping-open-pantry')).toHaveTextContent('Pantry');
    expect(screen.getByText('Other')).toBeOnTheScreen();
    expect(screen.getByTestId('shopping-item-item-1')).toHaveTextContent(/Olive Oil/);
    expect(screen.getByTestId('shopping-item-item-2')).toHaveTextContent(/Tomatoes/);
    expect(screen.getByTestId('shopping-open-pantry')).toBeOnTheScreen();
  });

  it('toggles a row checked state', async () => {
    render(<ShoppingScreen />);

    fireEvent.press(screen.getByTestId('shopping-check-item-1'));

    await waitFor(() => {
      expect(mockToggleChecked).toHaveBeenCalledWith(mockClient, items[0]);
    });
  });

  it('shows clear checked only when checked items exist and clears them', async () => {
    const { rerender } = render(<ShoppingScreen />);

    fireEvent.press(screen.getByTestId('shopping-clear-checked'));

    await waitFor(() => {
      expect(mockClearChecked).toHaveBeenCalledWith(mockClient, 'pod-1');
    });

    mockUseShoppingList.mockReturnValue({
      data: [{ ...items[0], checkedAt: null }],
      isLoading: false,
      error: null,
    });
    rerender(<ShoppingScreen />);

    expect(screen.queryByTestId('shopping-clear-checked')).toBeNull();
  });

  it('adds a manual item with the typed name', async () => {
    render(<ShoppingScreen />);

    fireEvent.changeText(screen.getByTestId('shopping-name-input'), 'Milk');
    fireEvent.press(screen.getByTestId('shopping-add'));

    await waitFor(() => {
      expect(mockAddShoppingItem).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ podId: 'pod-1', addedByUserId: 'user_alice', name: 'Milk' }),
      );
      expect(mockCapture).toHaveBeenCalledWith('shopping_item_added', {
        source: 'manual',
        pantry_conflict: false,
      });
    });
  });

  it('moves a checked row to pantry', async () => {
    render(<ShoppingScreen />);

    fireEvent.press(screen.getByTestId('shopping-move-item-2'));

    await waitFor(() => {
      expect(mockMoveToPantry).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          podId: 'pod-1',
          name: 'Tomatoes',
          updatedByUserId: 'user_alice',
          shoppingItemId: 'item-2',
        }),
      );
      expect(mockCapture).toHaveBeenCalledWith('pantry_item_added', { source: 'shopping_move' });
    });
  });

  it('renders the empty state', () => {
    mockUseShoppingList.mockReturnValue({ data: [], isLoading: false, error: null });

    render(<ShoppingScreen />);

    expect(screen.getByTestId('shopping-empty')).toBeOnTheScreen();
  });

  it('renders the no-pod state', () => {
    mockActivePodId = null;

    render(<ShoppingScreen />);

    expect(screen.getByTestId('shopping-empty')).toHaveTextContent(/Pair into a pod/);
  });

  it('renders the loading state', () => {
    mockUseShoppingList.mockReturnValue({ data: undefined, isLoading: true, error: null });

    render(<ShoppingScreen />);

    expect(screen.getByTestId('shopping-loading')).toBeOnTheScreen();
  });
});
