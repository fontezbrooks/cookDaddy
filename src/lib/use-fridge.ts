import { useMemo } from 'react';

import { useIngredientAisleMap } from '@/lib/use-ingredient-aisle-map';
import { type PantryItem, usePantry } from '@/lib/use-pantry';

export type FridgeGroup = {
  aisle: string;
  items: PantryItem[];
};

export function useFridge(): {
  groups: FridgeGroup[];
  isLoading: boolean;
  error: Error | null;
} {
  const pantry = usePantry();
  const ingredientAisleMap = useIngredientAisleMap();

  const groups = useMemo(
    () => groupPantryItemsByAisle(pantry.data ?? [], ingredientAisleMap.data),
    [pantry.data, ingredientAisleMap.data],
  );

  return {
    groups,
    isLoading: pantry.isLoading || ingredientAisleMap.isLoading,
    error: pantry.error ?? ingredientAisleMap.error,
  };
}

export function groupPantryItemsByAisle(
  items: PantryItem[],
  aisleMap: Map<string, string>,
): FridgeGroup[] {
  const grouped = new Map<string, PantryItem[]>();

  for (const item of items) {
    const key = item.nameClean?.trim();
    const aisle = key ? (aisleMap.get(key) ?? 'Other') : 'Other';
    grouped.set(aisle, [...(grouped.get(aisle) ?? []), item]);
  }

  return [...grouped.entries()]
    .map(([aisle, aisleItems]) => ({
      aisle,
      items: [...aisleItems].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.aisle === 'Other') return 1;
      if (b.aisle === 'Other') return -1;
      return a.aisle.localeCompare(b.aisle);
    });
}
