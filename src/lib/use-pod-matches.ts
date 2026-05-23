// Cookbook matches join through recipes for the screen-ready fields while
// keeping the cooked/removed filter in JS. That keeps the Supabase read shape
// stable and makes P9's cookbook states easy to unit-test.

import { useAuth } from '@clerk/clerk-expo';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createSupabaseClient } from '@/lib/supabase';
import { usePodStore } from '@/state/usePodStore';

export type CookbookFilter = 'all' | 'cooked' | 'removed' | 'unattempted';

export type CookbookEntry = {
  matchId: string;
  recipeId: string;
  title: string;
  imageUrl: string | null;
  readyInMinutes: number | null;
  servings: number | null;
  matchedAt: string;
  cookedAt: string | null;
  removedAt: string | null;
};

type RecipeJoinRow = {
  id: string;
  title: string;
  image_url: string | null;
  ready_in_minutes: number | null;
  servings: number | null;
};

type MatchJoinRow = {
  id: string;
  recipe_id: string;
  matched_at: string;
  cooked_at: string | null;
  removed_at: string | null;
  recipes: RecipeJoinRow | RecipeJoinRow[] | null;
};

type UsePodMatchesResult = {
  data: CookbookEntry[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

function recipeFromJoin(row: MatchJoinRow): RecipeJoinRow | undefined {
  const recipe = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
  return recipe ?? undefined;
}

function mapEntry(row: MatchJoinRow): CookbookEntry | null {
  const recipe = recipeFromJoin(row);
  if (!recipe) return null;
  return {
    matchId: row.id,
    recipeId: row.recipe_id,
    title: recipe.title,
    imageUrl: recipe.image_url,
    readyInMinutes: recipe.ready_in_minutes,
    servings: recipe.servings,
    matchedAt: row.matched_at,
    cookedAt: row.cooked_at,
    removedAt: row.removed_at,
  };
}

function matchesFilter(entry: CookbookEntry, filter: CookbookFilter): boolean {
  if (filter === 'removed') return entry.removedAt !== null;
  if (filter === 'cooked') return entry.cookedAt !== null && entry.removedAt === null;
  if (filter === 'unattempted') return entry.cookedAt === null && entry.removedAt === null;
  return entry.removedAt === null;
}

export function usePodMatches(filter: CookbookFilter = 'all'): UsePodMatchesResult {
  const podId = usePodStore((s) => s.activePodId);
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const query = useQuery({
    queryKey: ['pod-matches', podId, filter],
    enabled: Boolean(podId),
    queryFn: async (): Promise<CookbookEntry[]> => {
      const { data, error } = await supabase
        .from('matches')
        .select(
          'id, recipe_id, matched_at, cooked_at, removed_at, recipes(id, title, image_url, ready_in_minutes, servings)',
        )
        .eq('pod_id', podId)
        .order('matched_at', { ascending: false });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as MatchJoinRow[];
      return rows
        .map(mapEntry)
        .filter((entry): entry is CookbookEntry => entry !== null)
        .filter((entry) => matchesFilter(entry, filter));
    },
  });

  if (!podId) {
    return { data: [], isLoading: false, error: null };
  }
  return { data: query.data, isLoading: query.isLoading, error: query.error };
}

export function usePodMatchCount(): { count: number | null; isLoading: boolean } {
  const podId = usePodStore((s) => s.activePodId);
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const query = useQuery({
    queryKey: ['pod-match-count', podId],
    enabled: Boolean(podId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('pod_id', podId)
        .is('removed_at', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  if (!podId) {
    return { count: 0, isLoading: false };
  }
  return { count: query.data ?? 0, isLoading: query.isLoading };
}

export async function markCooked(supabase: SupabaseClient, matchId: string): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({ cooked_at: new Date().toISOString() })
    .eq('id', matchId);
  if (error) throw new Error(error.message);
}

export async function removeFromCookbook(supabase: SupabaseClient, matchId: string): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', matchId);
  if (error) throw new Error(error.message);
}

export async function restoreToCookbook(supabase: SupabaseClient, matchId: string): Promise<void> {
  const { error } = await supabase.from('matches').update({ removed_at: null }).eq('id', matchId);
  if (error) throw new Error(error.message);
}
