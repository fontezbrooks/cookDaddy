import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { FridgeGroup } from '@/lib/use-fridge';

import FridgeScreen from '../fridge';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

const mockUseFridge = jest.fn();
jest.mock('@/lib/use-fridge', () => ({
  useFridge: () => mockUseFridge(),
}));

const mockCapture = jest.fn();
jest.mock('@/lib/analytics', () => ({
  useAnalytics: () => ({
    capture: mockCapture,
    identify: jest.fn(),
    group: jest.fn(),
    reset: jest.fn(),
  }),
}));

const mockUseReducedMotion = jest.fn();
jest.mock('@/lib/use-reduced-motion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: jest.fn(),
}));

const groups: FridgeGroup[] = [
  {
    aisle: 'Dairy',
    items: [
      {
        id: 'milk-1',
        name: 'Milk',
        nameClean: 'milk',
        quantity: 1,
        unit: 'gallon',
        expiresAt: null,
        updatedByUserId: 'user_alice',
      },
    ],
  },
  {
    aisle: 'Other',
    items: [
      {
        id: 'rice-1',
        name: 'Rice',
        nameClean: 'rice',
        quantity: null,
        unit: null,
        expiresAt: null,
        updatedByUserId: 'user_bob',
      },
    ],
  },
];

describe('FridgeScreen', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCapture.mockReset();
    mockUseReducedMotion.mockReset().mockReturnValue(false);
    mockUseFridge.mockReset().mockReturnValue({ groups, isLoading: false, error: null });
  });

  it('renders the empty state', () => {
    mockUseFridge.mockReturnValue({ groups: [], isLoading: false, error: null });

    render(<FridgeScreen />);

    expect(screen.getByTestId('fridge-empty')).toBeOnTheScreen();
  });

  it('renders grouped fridge items', () => {
    render(<FridgeScreen />);

    expect(screen.getByTestId('fridge-aisle-Dairy')).toHaveTextContent('Dairy');
    expect(screen.getByTestId('fridge-item-milk-1')).toHaveTextContent(/Milk/);
    expect(screen.getByTestId('fridge-item-milk-1')).toHaveTextContent(/1 gallon/);
    expect(screen.getByTestId('fridge-aisle-Other')).toHaveTextContent('Other');
    expect(screen.getByTestId('fridge-item-rice-1')).toHaveTextContent(/On hand/);
  });

  it('routes Edit to the pantry screen', () => {
    render(<FridgeScreen />);

    fireEvent.press(screen.getByTestId('fridge-edit'));

    expect(mockPush).toHaveBeenCalledWith('/pantry');
  });

  it('renders the reduced-motion branch without throwing', () => {
    mockUseReducedMotion.mockReturnValue(true);

    render(<FridgeScreen />);

    expect(screen.getByTestId('fridge-item-milk-1')).toBeOnTheScreen();
  });

  it('captures fridge_viewed with item and aisle counts', async () => {
    render(<FridgeScreen />);

    await waitFor(() => {
      expect(mockCapture).toHaveBeenCalledWith('fridge_viewed', {
        item_count: 2,
        aisle_count: 2,
      });
    });
  });

  it('renders the loading state', () => {
    mockUseFridge.mockReturnValue({ groups: [], isLoading: true, error: null });

    render(<FridgeScreen />);

    expect(screen.getByTestId('fridge-loading')).toBeOnTheScreen();
  });
});
