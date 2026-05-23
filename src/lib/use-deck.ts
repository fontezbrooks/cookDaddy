// Deck-metadata fetch for the P6c active swipe surface. Given the ordered
// `deck_recipe_ids` from start_session, this hook fetches the recipe rows
// the visible card stack needs (id, title, image_url) and returns them in
// the same order as `recipeIds` — Postgres' `IN (uuid[])` does not preserve
// caller order, so the resort is done client-side.

import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createSupabaseClient } from '@/lib/supabase';

export type DeckRecipe = {
  id: string;
  title: string;
  imageUrl: string | null;
};

export type UseDeckResult = {
  data: DeckRecipe[] | undefined;
  isLoading: boolean;
};

export function useDeck(recipeIds: string[]): UseDeckResult {
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  // Stable cache key. Joining is fine — deck order is the cache identity for
  // a given session, and the array reference would otherwise churn every render.
  const queryKey = useMemo(() => ['deck', recipeIds.join(',')], [recipeIds]);

  const query = useQuery({
    queryKey,
    enabled: recipeIds.length > 0,
    queryFn: async (): Promise<DeckRecipe[]> => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, image_url')
        .in('id', recipeIds);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as {
        id: string;
        title: string;
        image_url: string | null;
      }[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      return recipeIds
        .map((id) => byId.get(id))
        .filter((r): r is (typeof rows)[number] => r !== undefined)
        .map((r) => ({ id: r.id, title: r.title, imageUrl: r.image_url }));
    },
  });

  // Empty deck case: never enabled, so return [] eagerly so screens don't
  // have to special-case `data === undefined`.
  if (recipeIds.length === 0) {
    return { data: [], isLoading: false };
  }
  return { data: query.data, isLoading: query.isLoading };
}
