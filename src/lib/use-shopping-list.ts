import { useAuth } from '@clerk/clerk-expo';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { nameClean } from '@/lib/name-clean';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodStore } from '@/state/usePodStore';

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  sourceRecipeId: string | null;
  addedByUserId: string;
  checkedAt: string | null;
  createdAt: string;
};

type ShoppingItemRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  source_recipe_id: string | null;
  added_by_user_id: string;
  checked_at: string | null;
  created_at: string;
};

type AddShoppingItemInput = {
  podId: string;
  addedByUserId: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
};

type MoveToPantryInput = {
  podId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  updatedByUserId: string;
  shoppingItemId: string;
};

function mapShoppingItem(row: ShoppingItemRow): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    category: row.category,
    sourceRecipeId: row.source_recipe_id,
    addedByUserId: row.added_by_user_id,
    checkedAt: row.checked_at,
    createdAt: row.created_at,
  };
}

export function useShoppingList(): {
  data: ShoppingItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const podId = usePodStore((s) => s.activePodId);
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['shopping-list', podId],
    enabled: Boolean(podId),
    queryFn: async (): Promise<ShoppingItem[]> => {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select(
          'id, name, quantity, unit, category, source_recipe_id, added_by_user_id, checked_at, created_at',
        )
        .eq('pod_id', podId)
        .order('created_at');
      if (error) throw new Error(error.message);
      return ((data ?? []) as ShoppingItemRow[]).map(mapShoppingItem);
    },
  });

  useEffect(() => {
    if (!podId) return undefined;
    const channel = supabase
      .channel(`pod-shopping:${podId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_list_items',
          filter: `pod_id=eq.${podId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ['shopping-list', podId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [podId, queryClient, supabase]);

  if (!podId) {
    return { data: [], isLoading: false, error: null };
  }
  return { data: query.data, isLoading: query.isLoading, error: query.error };
}

export async function addShoppingItem(
  supabase: SupabaseClient,
  input: AddShoppingItemInput,
): Promise<void> {
  const { error } = await supabase.from('shopping_list_items').insert({
    pod_id: input.podId,
    added_by_user_id: input.addedByUserId,
    name: input.name,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    category: input.category ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function toggleChecked(
  supabase: SupabaseClient,
  item: { id: string; checkedAt: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_items')
    .update({ checked_at: item.checkedAt ? null : new Date().toISOString() })
    .eq('id', item.id);
  if (error) throw new Error(error.message);
}

export async function clearChecked(supabase: SupabaseClient, podId: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('pod_id', podId)
    .not('checked_at', 'is', null);
  if (error) throw new Error(error.message);
}

export async function moveToPantry(
  supabase: SupabaseClient,
  item: MoveToPantryInput,
): Promise<void> {
  const { error: upsertError } = await supabase.from('pantry_items').upsert(
    {
      pod_id: item.podId,
      name: item.name,
      name_clean: nameClean(item.name),
      quantity: item.quantity,
      unit: item.unit,
      updated_by_user_id: item.updatedByUserId,
    },
    { onConflict: 'pod_id,name_clean' },
  );
  if (upsertError) throw new Error(upsertError.message);

  const { error: deleteError } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('id', item.shoppingItemId);
  if (deleteError) throw new Error(deleteError.message);
}
