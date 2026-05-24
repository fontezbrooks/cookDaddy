import { useAuth } from '@clerk/clerk-expo';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { PantryItem } from '@/lib/use-pantry';

import PantryScreen from '../pantry';

const mockInvalidateQueries = jest.fn();
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

const mockUsePantry = jest.fn();
const mockAddOrUpdatePantryItem = jest.fn();
const mockDeletePantryItem = jest.fn();
jest.mock('@/lib/use-pantry', () => ({
  usePantry: () => mockUsePantry(),
  addOrUpdatePantryItem: (...args: unknown[]) => mockAddOrUpdatePantryItem(...args),
  deletePantryItem: (...args: unknown[]) => mockDeletePantryItem(...args),
}));

const mockClient = { from: jest.fn() };
jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

let mockActivePodId: string | null = 'pod-1';
jest.mock('@/state/usePodStore', () => ({
  usePodStore: (selector: (state: { activePodId: string | null }) => string | null) =>
    selector({ activePodId: mockActivePodId }),
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

const items: PantryItem[] = [
  {
    id: 'pantry-1',
    name: 'Olive Oil',
    nameClean: 'olive oil',
    quantity: 1,
    unit: 'bottle',
    expiresAt: null,
    updatedByUserId: 'user_alice',
  },
  {
    id: 'pantry-2',
    name: 'Tomatoes',
    nameClean: 'tomato',
    quantity: 4,
    unit: null,
    expiresAt: '2026-06-01',
    updatedByUserId: 'user_bob',
  },
];

describe('PantryScreen', () => {
  beforeEach(() => {
    mockActivePodId = 'pod-1';
    mockUsePantry.mockReset().mockReturnValue({ data: items, isLoading: false, error: null });
    mockAddOrUpdatePantryItem.mockReset().mockResolvedValue(undefined);
    mockDeletePantryItem.mockReset().mockResolvedValue(undefined);
    mockInvalidateQueries.mockReset();
    setSignedIn();
  });

  it('renders pantry rows with quantity and expiration details', () => {
    render(<PantryScreen />);

    expect(screen.getByTestId('pantry-item-pantry-1')).toHaveTextContent(/Olive Oil/);
    expect(screen.getByTestId('pantry-item-pantry-1')).toHaveTextContent(/1 bottle/);
    expect(screen.getByTestId('pantry-item-pantry-2')).toHaveTextContent(/Tomatoes/);
    expect(screen.getByTestId('pantry-item-pantry-2')).toHaveTextContent(/Expires/);
  });

  it('adds a manual pantry item with the typed name', async () => {
    render(<PantryScreen />);

    fireEvent.changeText(screen.getByTestId('pantry-name-input'), 'Rice');
    fireEvent.press(screen.getByTestId('pantry-add'));

    await waitFor(() => {
      expect(mockAddOrUpdatePantryItem).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ podId: 'pod-1', updatedByUserId: 'user_alice', name: 'Rice' }),
      );
    });
  });

  it('deletes a pantry item', async () => {
    render(<PantryScreen />);

    fireEvent.press(screen.getByTestId('pantry-delete-pantry-1'));

    await waitFor(() => {
      expect(mockDeletePantryItem).toHaveBeenCalledWith(mockClient, 'pantry-1');
    });
  });

  it('renders the empty state', () => {
    mockUsePantry.mockReturnValue({ data: [], isLoading: false, error: null });

    render(<PantryScreen />);

    expect(screen.getByTestId('pantry-empty')).toBeOnTheScreen();
  });

  it('renders the no-pod state', () => {
    mockActivePodId = null;

    render(<PantryScreen />);

    expect(screen.getByTestId('pantry-empty')).toHaveTextContent(/Pair into a pod/);
  });

  it('renders the loading state', () => {
    mockUsePantry.mockReturnValue({ data: undefined, isLoading: true, error: null });

    render(<PantryScreen />);

    expect(screen.getByTestId('pantry-loading')).toBeOnTheScreen();
  });
});
