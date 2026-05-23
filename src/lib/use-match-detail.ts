import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createSupabaseClient } from '@/lib/supabase';

export type MatchDetail = {
  matchId: string;
  recipeId: string;
  title: string;
  imageUrl: string | null;
  readyInMinutes: number | null;
  servings: number | null;
  sourceUrl: string | null;
  sourceName: string | null;
  cookedAt: string | null;
  removedAt: string | null;
  ingredients: {
    id: string;
    name: string;
    originalText: string | null;
    amount: number | null;
    unit: string | null;
  }[];
};

type IngredientJoinRow = {
  id: string;
  name: string;
  original_text: string | null;
  amount: number | null;
  unit: string | null;
  position: number | null;
};

type RecipeJoinRow = {
  title: string;
  image_url: string | null;
  ready_in_minutes: number | null;
  servings: number | null;
  source_url: string | null;
  source_name: string | null;
  recipe_ingredients: IngredientJoinRow[] | null;
};

type MatchDetailRow = {
  id: string;
  recipe_id: string;
  cooked_at: string | null;
  removed_at: string | null;
  recipes: RecipeJoinRow | RecipeJoinRow[] | null;
};

function recipeFromJoin(row: MatchDetailRow): RecipeJoinRow | undefined {
  const recipe = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
  return recipe ?? undefined;
}

function mapMatchDetail(row: MatchDetailRow): MatchDetail | undefined {
  const recipe = recipeFromJoin(row);
  if (!recipe) return undefined;
  const ingredients = [...(recipe.recipe_ingredients ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );

  return {
    matchId: row.id,
    recipeId: row.recipe_id,
    title: recipe.title,
    imageUrl: recipe.image_url,
    readyInMinutes: recipe.ready_in_minutes,
    servings: recipe.servings,
    sourceUrl: recipe.source_url,
    sourceName: recipe.source_name,
    cookedAt: row.cooked_at,
    removedAt: row.removed_at,
    ingredients: ingredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      originalText: ingredient.original_text,
      amount: ingredient.amount,
      unit: ingredient.unit,
    })),
  };
}

export function useMatchDetail(matchId: string): {
  data: MatchDetail | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const query = useQuery({
    queryKey: ['match-detail', matchId],
    enabled: Boolean(matchId),
    queryFn: async (): Promise<MatchDetail | null> => {
      const { data, error } = await supabase
        .from('matches')
        .select(
          'id, recipe_id, cooked_at, removed_at, recipes(title, image_url, ready_in_minutes, servings, source_url, source_name, recipe_ingredients(id, name, original_text, amount, unit, position))',
        )
        .eq('id', matchId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return mapMatchDetail(data as MatchDetailRow) ?? null;
    },
  });

  return { data: query.data ?? undefined, isLoading: query.isLoading, error: query.error };
}
