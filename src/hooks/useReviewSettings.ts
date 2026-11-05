// =====================================================================================
// Regras das avaliações (store_settings.review_settings): se os clientes podem enviar uma foto com a avaliação e o
// pedido de avaliação por e-mail depois da entrega (request_email, request_after_days; lidos pelo trigger orders_review_request).
// Lido pelo formulário da página do produto; gravado no Admin > Avaliações. O servidor confere a mesma regra
// (função review_customer_photos_enabled no envio da foto e no trigger product_reviews_guard).
// =====================================================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ReviewSettings {
  customer_photos: boolean;
  request_email: boolean;
  request_after_days: number;
}

export const REVIEW_SETTINGS_KEY = ['review-settings'] as const;
const DEFAULTS: ReviewSettings = { customer_photos: false, request_email: true, request_after_days: 3 };

/** Pasta pública das fotos dos clientes (o trigger só aceita este caminho, na pasta do próprio cliente). */
export const REVIEW_PHOTOS_BUCKET = 'review-photos';
export const REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function useReviewSettings() {
  return useQuery({
    queryKey: REVIEW_SETTINGS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReviewSettings> => {
      const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'review_settings').maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Partial<ReviewSettings>;
      const days = Number(v.request_after_days);
      return {
        customer_photos: v.customer_photos === true,
        request_email: v.request_email !== false,
        request_after_days: Number.isFinite(days) ? Math.min(60, Math.max(0, Math.round(days))) : DEFAULTS.request_after_days,
      };
    },
  });
}

export function useSaveReviewSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: ReviewSettings) => {
      const { error } = await supabase.from('store_settings').upsert({ key: 'review_settings', value: next as any }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REVIEW_SETTINGS_KEY }),
  });
}

/** Envia a foto do cliente e devolve o caminho relativo gravado em product_reviews.image_url. */
export async function uploadReviewPhoto(userId: string, file: File): Promise<string> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(REVIEW_PHOTOS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return `/storage/v1/object/public/${REVIEW_PHOTOS_BUCKET}/${path}`;
}
