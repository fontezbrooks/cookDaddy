import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createSupabaseClient } from '@/lib/supabase';

export type MatchDetail = {
  matchId: string;
  recipeId: string;
  matchedAt: string;
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
  nutrients?: {
    name: string;
    amount: number | null;
    unit: string | null;
    percentOfDailyNeeds: number | null;
  }[];
  instructionSteps?: {
    stepNumber: number;
    text: string;
    lengthNumber: number | null;
    lengthUnit: string | null;
  }[];
};

type IngredientJoinRow = {
  id: string;
  name: string;
  original: string | null;
  amount: number | null;
  unit: string | null;
  sort_order: number | null;
};

type NutrientJoinRow = {
  name: string;
  amount: number | null;
  unit: string | null;
  percent_of_daily_needs: number | null;
};

type InstructionStepJoinRow = {
  step_number: number;
  step_text: string;
  length_number: number | null;
  length_unit: string | null;
  sort_order: number | null;
};

type InstructionGroupJoinRow = {
  sort_order: number | null;
  recipe_instruction_steps: InstructionStepJoinRow[] | null;
};

type RecipeJoinRow = {
  title: string;
  image_url: string | null;
  ready_in_minutes: number | null;
  servings: number | null;
  source_url: string | null;
  source_name: string | null;
  recipe_ingredients: IngredientJoinRow[] | null;
  recipe_nutrients: NutrientJoinRow[] | null;
  recipe_instruction_groups: InstructionGroupJoinRow[] | null;
};

type MatchDetailRow = {
  id: string;
  recipe_id: string;
  created_at: string;
  cooked_at: string | null;
  removed_at: string | null;
  recipes: RecipeJoinRow | RecipeJoinRow[] | null;
};

function recipeFromJoin(row: MatchDetailRow): RecipeJoinRow | undefined {
  const recipe = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
  return recipe ?? undefined;
}

function orderedInstructionSteps(
  groups: InstructionGroupJoinRow[] | null,
): InstructionStepJoinRow[] {
  return [...(groups ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .flatMap((group) =>
      [...(group.recipe_instruction_steps ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      ),
    );
}

function mapMatchDetail(row: MatchDetailRow): MatchDetail | undefined {
  const recipe = recipeFromJoin(row);
  if (!recipe) return undefined;
  const ingredients = [...(recipe.recipe_ingredients ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const instructionSteps = orderedInstructionSteps(recipe.recipe_instruction_groups);

  return {
    matchId: row.id,
    recipeId: row.recipe_id,
    matchedAt: row.created_at,
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
      originalText: ingredient.original,
      amount: ingredient.amount,
      unit: ingredient.unit,
    })),
    nutrients: (recipe.recipe_nutrients ?? []).map((nutrient) => ({
      name: nutrient.name,
      amount: nutrient.amount,
      unit: nutrient.unit,
      percentOfDailyNeeds: nutrient.percent_of_daily_needs,
    })),
    instructionSteps: instructionSteps.map((step) => ({
      stepNumber: step.step_number,
      text: step.step_text,
      lengthNumber: step.length_number,
      lengthUnit: step.length_unit,
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
          'id, recipe_id, created_at, cooked_at, removed_at, recipes(title, image_url, ready_in_minutes, servings, source_url, source_name, recipe_ingredients(id, name, original, amount, unit, sort_order), recipe_nutrients(name, amount, unit, percent_of_daily_needs), recipe_instruction_groups(sort_order, recipe_instruction_steps(step_number, step_text, length_number, length_unit, sort_order)))',
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
