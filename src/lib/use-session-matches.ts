import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createSupabaseClient } from '@/lib/supabase';

export type SessionMatch = {
  matchId: string;
  recipeId: string;
  title: string;
  imageUrl: string | null;
};

type RecipeJoinRow = {
  id: string;
  title: string;
  image_url: string | null;
};

type MatchJoinRow = {
  id: string;
  recipe_id: string;
  matched_at: string;
  recipes: RecipeJoinRow | RecipeJoinRow[] | null;
};

type UseSessionMatchesResult = {
  data: SessionMatch[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

function recipeFromJoin(row: MatchJoinRow): RecipeJoinRow | undefined {
  const recipe = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
  return recipe ?? undefined;
}

function mapMatch(row: MatchJoinRow): SessionMatch | null {
  const recipe = recipeFromJoin(row);
  if (!recipe) return null;
  return {
    matchId: row.id,
    recipeId: row.recipe_id,
    title: recipe.title,
    imageUrl: recipe.image_url,
  };
}

export function useSessionMatches(sessionId: string): UseSessionMatchesResult {
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const query = useQuery({
    queryKey: ['session-matches', sessionId],
    enabled: Boolean(sessionId),
    queryFn: async (): Promise<SessionMatch[]> => {
      const { data, error } = await supabase
        .from('matches')
        .select('id, recipe_id, matched_at, recipes(id, title, image_url)')
        .eq('session_id', sessionId)
        .order('matched_at', { ascending: true });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as MatchJoinRow[];
      return rows.map(mapMatch).filter((match): match is SessionMatch => match !== null);
    },
  });

  return { data: query.data, isLoading: query.isLoading, error: query.error };
}
