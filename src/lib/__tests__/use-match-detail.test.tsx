import { useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useMatchDetail } from '@/lib/use-match-detail';

type IngredientRow = {
  id: string;
  name: string;
  original: string | null;
  amount: number | null;
  unit: string | null;
  sort_order: number | null;
};

type NutrientRow = {
  name: string;
  amount: number | null;
  unit: string | null;
  percent_of_daily_needs: number | null;
};

type InstructionStepRow = {
  step_number: number;
  step_text: string;
  length_number: number | null;
  length_unit: string | null;
  sort_order: number | null;
};

type InstructionGroupRow = {
  sort_order: number | null;
  recipe_instruction_steps: InstructionStepRow[] | null;
};

type RecipeRow = {
  title: string;
  image_url: string | null;
  ready_in_minutes: number | null;
  servings: number | null;
  source_url: string | null;
  source_name: string | null;
  recipe_ingredients: IngredientRow[] | null;
  recipe_nutrients: NutrientRow[] | null;
  recipe_instruction_groups: InstructionGroupRow[] | null;
};

type MatchRow = {
  id: string;
  recipe_id: string;
  created_at: string;
  cooked_at: string | null;
  removed_at: string | null;
  recipes: RecipeRow | RecipeRow[] | null;
};

const mockQueryState = {
  row: null as MatchRow | null,
  error: null as { message: string } | null,
};

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockClient = { from: mockFrom };

jest.mock('@/lib/supabase', () => ({
  createSupabaseClient: () => mockClient,
}));

function resetSupabaseMock(): void {
  mockQueryState.row = null;
  mockQueryState.error = null;
  mockMaybeSingle
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve({ data: mockQueryState.row, error: mockQueryState.error }),
    );
  mockEq.mockReset().mockImplementation(() => ({ maybeSingle: mockMaybeSingle }));
  mockSelect.mockReset().mockImplementation(() => ({ eq: mockEq }));
  mockFrom.mockReset().mockImplementation(() => ({ select: mockSelect }));
}

function setSignedIn(): void {
  jest.mocked(useAuth).mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_alice',
    getToken: jest.fn().mockResolvedValue('jwt'),
    signOut: jest.fn(),
  } as never);
}

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const recipe: RecipeRow = {
  title: 'Lemony Pasta',
  image_url: 'https://example.test/pasta.jpg',
  ready_in_minutes: 25,
  servings: 3,
  source_url: 'https://example.test/recipe',
  source_name: 'Example Kitchen',
  recipe_ingredients: [
    {
      id: 'ing-2',
      name: 'lemon',
      original: '1 lemon, zested',
      amount: 1,
      unit: null,
      sort_order: 2,
    },
    {
      id: 'ing-1',
      name: 'spaghetti',
      original: '8 oz spaghetti',
      amount: 8,
      unit: 'oz',
      sort_order: 1,
    },
  ],
  recipe_nutrients: [
    {
      name: 'Calories',
      amount: 410,
      unit: 'kcal',
      percent_of_daily_needs: 20.5,
    },
    {
      name: 'Protein',
      amount: 14,
      unit: 'g',
      percent_of_daily_needs: 28,
    },
  ],
  recipe_instruction_groups: [
    {
      sort_order: 1,
      recipe_instruction_steps: [
        {
          step_number: 4,
          step_text: 'Serve with lemon zest.',
          length_number: null,
          length_unit: null,
          sort_order: 1,
        },
        {
          step_number: 3,
          step_text: 'Toss pasta with sauce.',
          length_number: 2,
          length_unit: 'minutes',
          sort_order: 0,
        },
      ],
    },
    {
      sort_order: 0,
      recipe_instruction_steps: [
        {
          step_number: 2,
          step_text: 'Cook spaghetti until al dente.',
          length_number: 10,
          length_unit: 'minutes',
          sort_order: 1,
        },
        {
          step_number: 1,
          step_text: 'Bring salted water to a boil.',
          length_number: 5,
          length_unit: 'minutes',
          sort_order: 0,
        },
      ],
    },
  ],
};

function matchRow(recipes: RecipeRow | RecipeRow[] | null = recipe): MatchRow {
  return {
    id: 'match-1',
    recipe_id: 'recipe-1',
    created_at: '2026-05-23T12:00:00.000Z',
    cooked_at: null,
    removed_at: null,
    recipes,
  };
}

describe('useMatchDetail', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setSignedIn();
  });

  it('maps a nested recipe and sorts ingredients by sort order', async () => {
    mockQueryState.row = matchRow();

    const { result } = renderHook(() => useMatchDetail('match-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual({
      matchId: 'match-1',
      recipeId: 'recipe-1',
      matchedAt: '2026-05-23T12:00:00.000Z',
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
          originalText: '1 lemon, zested',
          amount: 1,
          unit: null,
        },
      ],
      nutrients: [
        {
          name: 'Calories',
          amount: 410,
          unit: 'kcal',
          percentOfDailyNeeds: 20.5,
        },
        {
          name: 'Protein',
          amount: 14,
          unit: 'g',
          percentOfDailyNeeds: 28,
        },
      ],
      instructionSteps: [
        {
          stepNumber: 1,
          text: 'Bring salted water to a boil.',
          lengthNumber: 5,
          lengthUnit: 'minutes',
        },
        {
          stepNumber: 2,
          text: 'Cook spaghetti until al dente.',
          lengthNumber: 10,
          lengthUnit: 'minutes',
        },
        {
          stepNumber: 3,
          text: 'Toss pasta with sauce.',
          lengthNumber: 2,
          lengthUnit: 'minutes',
        },
        {
          stepNumber: 4,
          text: 'Serve with lemon zest.',
          lengthNumber: null,
          lengthUnit: null,
        },
      ],
    });
    expect(result.current.data?.instructionSteps?.map((step) => step.text)).toEqual([
      'Bring salted water to a boil.',
      'Cook spaghetti until al dente.',
      'Toss pasta with sauce.',
      'Serve with lemon zest.',
    ]);
    expect(result.current.data?.nutrients?.map((nutrient) => nutrient.percentOfDailyNeeds)).toEqual(
      [20.5, 28],
    );
    expect(mockSelect).toHaveBeenCalledWith(
      'id, recipe_id, created_at, cooked_at, removed_at, recipes(title, image_url, ready_in_minutes, servings, source_url, source_name, recipe_ingredients(id, name, original, amount, unit, sort_order), recipe_nutrients(name, amount, unit, percent_of_daily_needs), recipe_instruction_groups(sort_order, recipe_instruction_steps(step_number, step_text, length_number, length_unit, sort_order)))',
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'match-1');
  });

  it('maps null nutrient and instruction embeds to empty arrays', async () => {
    mockQueryState.row = matchRow({
      ...recipe,
      recipe_nutrients: null,
      recipe_instruction_groups: null,
    });

    const { result } = renderHook(() => useMatchDetail('match-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.nutrients).toEqual([]);
    expect(result.current.data?.instructionSteps).toEqual([]);
  });

  it('maps recipe joins returned as either objects or single-element arrays', async () => {
    mockQueryState.row = matchRow([recipe]);

    const { result } = renderHook(() => useMatchDetail('match-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.data?.title).toBe('Lemony Pasta');
    });
  });

  it('returns undefined data without an error for a missing row', async () => {
    mockQueryState.row = null;

    const { result } = renderHook(() => useMatchDetail('missing-match'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('surfaces Supabase errors through the query result', async () => {
    mockQueryState.error = { message: 'detail failed' };

    const { result } = renderHook(() => useMatchDetail('match-1'), {
      wrapper: ({ children }) => wrap(children),
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe('detail failed');
    });
  });

  it('does not query when matchId is empty', () => {
    const { result } = renderHook(() => useMatchDetail(''), {
      wrapper: ({ children }) => wrap(children),
    });

    expect(result.current).toEqual({ data: undefined, isLoading: false, error: null });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
