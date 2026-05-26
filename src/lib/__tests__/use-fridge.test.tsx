import { renderHook } from '@testing-library/react-native';

import { useFridge } from '@/lib/use-fridge';
import type { PantryItem } from '@/lib/use-pantry';

const mockUsePantry = jest.fn();
const mockUseIngredientAisleMap = jest.fn();

jest.mock('@/lib/use-pantry', () => ({
  usePantry: () => mockUsePantry(),
}));

jest.mock('@/lib/use-ingredient-aisle-map', () => ({
  useIngredientAisleMap: () => mockUseIngredientAisleMap(),
}));

function pantryItem(overrides: Partial<PantryItem>): PantryItem {
  return {
    id: 'item',
    name: 'Item',
    nameClean: 'item',
    quantity: null,
    unit: null,
    expiresAt: null,
    updatedByUserId: 'user_alice',
    ...overrides,
  };
}

describe('useFridge', () => {
  beforeEach(() => {
    mockUsePantry.mockReset();
    mockUseIngredientAisleMap.mockReset();
  });

  it('groups by derived aisle, sorts groups and items, and puts Other last', () => {
    mockUsePantry.mockReturnValue({
      data: [
        pantryItem({ id: '2', name: 'Yogurt', nameClean: 'yogurt' }),
        pantryItem({ id: '1', name: 'Apples', nameClean: 'apple' }),
        pantryItem({ id: '3', name: 'Rice', nameClean: 'rice' }),
        pantryItem({ id: '4', name: 'Butter', nameClean: 'butter' }),
      ],
      isLoading: false,
      error: null,
    });
    mockUseIngredientAisleMap.mockReturnValue({
      data: new Map([
        ['yogurt', 'Dairy'],
        ['butter', 'Dairy'],
        ['apple', 'Produce'],
      ]),
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useFridge());

    expect(result.current.groups.map((group) => group.aisle)).toEqual([
      'Dairy',
      'Produce',
      'Other',
    ]);
    expect(result.current.groups.at(0)?.items.map((item) => item.name)).toEqual([
      'Butter',
      'Yogurt',
    ]);
    expect(result.current.groups.at(2)?.items.map((item) => item.name)).toEqual(['Rice']);
  });

  it('returns an empty group list for an empty pantry', () => {
    mockUsePantry.mockReturnValue({ data: [], isLoading: false, error: null });
    mockUseIngredientAisleMap.mockReturnValue({ data: new Map(), isLoading: false, error: null });

    const { result } = renderHook(() => useFridge());

    expect(result.current.groups).toEqual([]);
  });

  it('propagates loading from either source', () => {
    mockUsePantry.mockReturnValue({ data: [], isLoading: true, error: null });
    mockUseIngredientAisleMap.mockReturnValue({ data: new Map(), isLoading: false, error: null });

    const { result } = renderHook(() => useFridge());

    expect(result.current.isLoading).toBe(true);
  });

  it('surfaces the first error', () => {
    const pantryError = new Error('pantry failed');
    const aisleError = new Error('aisles failed');
    mockUsePantry.mockReturnValue({ data: [], isLoading: false, error: pantryError });
    mockUseIngredientAisleMap.mockReturnValue({
      data: new Map(),
      isLoading: false,
      error: aisleError,
    });

    const { result } = renderHook(() => useFridge());

    expect(result.current.error).toBe(pantryError);
  });
});
