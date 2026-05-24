import { useAuth } from '@clerk/clerk-expo';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { nameClean } from '@/lib/name-clean';
import { createSupabaseClient } from '@/lib/supabase';
import { usePodStore } from '@/state/usePodStore';

export type PantryItem = {
  id: string;
  name: string;
  nameClean: string | null;
  quantity: number | null;
  unit: string | null;
  expiresAt: string | null;
  updatedByUserId: string;
};

type PantryItemRow = {
  id: string;
  name: string;
  name_clean: string | null;
  quantity: number | null;
  unit: string | null;
  expires_at: string | null;
  updated_by_user_id: string;
};

type AddOrUpdatePantryItemInput = {
  podId: string;
  updatedByUserId: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  expiresAt?: string | null;
};

type EditPantryItemPatch = {
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  expiresAt?: string | null;
};

function mapPantryItem(row: PantryItemRow): PantryItem {
  return {
    id: row.id,
    name: row.name,
    nameClean: row.name_clean,
    quantity: row.quantity,
    unit: row.unit,
    expiresAt: row.expires_at,
    updatedByUserId: row.updated_by_user_id,
  };
}

export function usePantry(): {
  data: PantryItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const podId = usePodStore((s) => s.activePodId);
  const { getToken } = useAuth();
  const supabase = useMemo(() => createSupabaseClient(getToken as never), [getToken]);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['pantry', podId],
    enabled: Boolean(podId),
    queryFn: async (): Promise<PantryItem[]> => {
      const { data, error } = await supabase
        .from('pantry_items')
        .select('id, name, name_clean, quantity, unit, expires_at, updated_by_user_id')
        .eq('pod_id', podId)
        .order('name');
      if (error) throw new Error(error.message);
      return ((data ?? []) as PantryItemRow[]).map(mapPantryItem);
    },
  });

  useEffect(() => {
    if (!podId) return undefined;
    const channel = supabase
      .channel(`pod-pantry:${podId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pantry_items',
          filter: `pod_id=eq.${podId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ['pantry', podId] }),
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

export async function addOrUpdatePantryItem(
  supabase: SupabaseClient,
  input: AddOrUpdatePantryItemInput,
): Promise<void> {
  const { error } = await supabase.from('pantry_items').upsert(
    {
      pod_id: input.podId,
      name: input.name,
      name_clean: nameClean(input.name),
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      expires_at: input.expiresAt ?? null,
      updated_by_user_id: input.updatedByUserId,
    },
    { onConflict: 'pod_id,name_clean' },
  );
  if (error) throw new Error(error.message);
}

export async function editPantryItem(
  supabase: SupabaseClient,
  id: string,
  patch: EditPantryItemPatch,
): Promise<void> {
  const payload: {
    name?: string;
    name_clean?: string;
    quantity?: number | null;
    unit?: string | null;
    expires_at?: string | null;
  } = {};
  if (patch.name !== undefined) {
    payload.name = patch.name;
    payload.name_clean = nameClean(patch.name);
  }
  if (patch.quantity !== undefined) payload.quantity = patch.quantity;
  if (patch.unit !== undefined) payload.unit = patch.unit;
  if (patch.expiresAt !== undefined) payload.expires_at = patch.expiresAt;

  const { error } = await supabase.from('pantry_items').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePantryItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('pantry_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
