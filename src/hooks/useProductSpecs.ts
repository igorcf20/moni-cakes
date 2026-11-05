// =====================================================================================
// Especificações e filtros (src/lib/productSpecs.ts; tabelas na migration 20261006210000_product_specs.sql).
//   Loja    useSpecAttributes (características com valores), useSpecRows (todas as ligações produto-valor, para a
//           listagem filtrar), useProductSpecOptionIds (valores de um produto, para a ficha)
//   Admin   useSaveSpecAttribute (característica + valores), useDeleteSpecAttribute, useSetProductSpecs
// =====================================================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SpecAttribute, SpecOption } from '@/lib/productSpecs';

const sb = supabase as any;
const KEY = ['product-specs'] as const;

export function useSpecAttributes(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'attributes'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SpecAttribute[]> => {
      const [a, o] = await Promise.all([
        sb.from('spec_attributes').select('id,slug,name_i18n,unit,show_in_filters,show_on_product,sort_order').order('sort_order').order('created_at'),
        sb.from('spec_options').select('id,attribute_id,slug,label_i18n,color,sort_order').order('sort_order').order('created_at'),
      ]);
      if (a.error) throw a.error;
      if (o.error) throw o.error;
      const options = (o.data ?? []) as SpecOption[];
      return ((a.data ?? []) as Omit<SpecAttribute, 'options'>[]).map((attr) => ({
        ...attr,
        name_i18n: attr.name_i18n ?? {},
        options: options.filter((x) => x.attribute_id === attr.id).map((x) => ({ ...x, label_i18n: x.label_i18n ?? {} })),
      }));
    },
  });
}

export function useSpecRows(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'rows'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ product_id: string; option_id: string }[]> => {
      const { data, error } = await sb.from('product_spec_options').select('product_id,option_id').limit(50000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProductSpecOptionIds(productId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'product', productId],
    enabled: !!productId && enabled,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await sb.from('product_spec_options').select('option_id').eq('product_id', productId);
      if (error) throw error;
      return (data ?? []).map((r: { option_id: string }) => r.option_id);
    },
  });
}

export type SpecOptionDraft = { id?: string; slug: string; label_i18n: Record<string, string>; color: string | null };
export type SpecAttributeDraft = Omit<SpecAttribute, 'id' | 'options' | 'sort_order'> & { sort_order?: number; options: SpecOptionDraft[] };

/** Grava a característica e os seus valores (os valores que saíram da lista são apagados). */
export function useSaveSpecAttribute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: SpecAttributeDraft }): Promise<string> => {
      const row = {
        slug: draft.slug, name_i18n: draft.name_i18n, unit: draft.unit?.trim() || null,
        show_in_filters: draft.show_in_filters, show_on_product: draft.show_on_product, updated_at: new Date().toISOString(),
        ...(draft.sort_order !== undefined ? { sort_order: draft.sort_order } : {}),
      };
      let attrId = id;
      if (attrId) {
        const { error } = await sb.from('spec_attributes').update(row).eq('id', attrId);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('spec_attributes').insert(row).select('id').single();
        if (error) throw error;
        attrId = data.id as string;
      }
      const keep = draft.options.filter((o) => o.id).map((o) => o.id as string);
      const { data: existing, error: exErr } = await sb.from('spec_options').select('id').eq('attribute_id', attrId);
      if (exErr) throw exErr;
      const gone = (existing ?? []).map((r: { id: string }) => r.id).filter((x: string) => !keep.includes(x));
      if (gone.length) {
        const { error } = await sb.from('spec_options').delete().in('id', gone);
        if (error) throw error;
      }
      // Slugs trocados entre valores: primeiro um nome temporário, para não bater na regra de slug único.
      for (const [i, o] of draft.options.entries()) {
        if (!o.id) continue;
        const { error } = await sb.from('spec_options').update({ slug: `tmp-${i}-${Date.now()}` }).eq('id', o.id);
        if (error) throw error;
      }
      for (const [i, o] of draft.options.entries()) {
        const values = { attribute_id: attrId, slug: o.slug, label_i18n: o.label_i18n, color: o.color, sort_order: i };
        const { error } = o.id
          ? await sb.from('spec_options').update(values).eq('id', o.id)
          : await sb.from('spec_options').insert(values);
        if (error) throw error;
      }
      return attrId as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSpecAttribute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('spec_attributes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Ordem das características (setas na lista do Admin). */
export function useReorderSpecAttributes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const [i, id] of ids.entries()) {
        const { error } = await sb.from('spec_attributes').update({ sort_order: i }).eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetProductSpecs(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (optionIds: string[]) => {
      const { error } = await sb.rpc('admin_set_product_specs', { _product_id: productId, _option_ids: optionIds });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
