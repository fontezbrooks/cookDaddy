import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createSupabaseClient } from '@/lib/supabase';

type IngredientAisleRow = {
  name_clean: string | null;
  aisle: string | null;
};

const INGREDIENT_AISLE_MAP_STALE_MS = 60 * 60 * 1000;

export function useIngredientAisleMap(): {
  data: Map<string, string>;
  isLoading: boolean;
  error: Error | null;
} {
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);

  const query = useQuery({
    queryKey: ['ingredient-aisle-map'],
    staleTime: INGREDIENT_AISLE_MAP_STALE_MS,
    queryFn: async (): Promise<Map<string, string>> => {
      // P14: repoint this source to the canonical ingredients table when it lands.
      const { data, error } = await supabase.from('recipe_ingredients').select('name_clean, aisle');
      if (error) throw new Error(error.message);
      return buildIngredientAisleMap((data ?? []) as IngredientAisleRow[]);
    },
  });

  return { data: query.data ?? new Map(), isLoading: query.isLoading, error: query.error };
}

export function buildIngredientAisleMap(rows: IngredientAisleRow[]): Map<string, string> {
  const countsByName = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const nameClean = row.name_clean?.trim();
    const aisle = row.aisle?.trim();
    if (!nameClean || !aisle) continue;

    const aisleCounts = countsByName.get(nameClean) ?? new Map<string, number>();
    aisleCounts.set(aisle, (aisleCounts.get(aisle) ?? 0) + 1);
    countsByName.set(nameClean, aisleCounts);
  }

  const aisleMap = new Map<string, string>();
  for (const [nameClean, aisleCounts] of countsByName) {
    const winner = [...aisleCounts.entries()].sort(
      ([aisleA, countA], [aisleB, countB]) => countB - countA || aisleA.localeCompare(aisleB),
    )[0]?.[0];
    if (!winner) continue;
    aisleMap.set(nameClean, winner);
  }

  return aisleMap;
}
