// =============================================================================================
// Newsletter. Regras em src/lib/newsletter.ts; dados:
//   Loja    useUnsubscribe (página do link "cancelar inscrição")
//   Admin   useSubscribers, useSaveSubscriber, useDeleteSubscriber, useCampaigns, useCampaignStats,
//           useSaveCampaign, useDeleteCampaign, useQueueCampaign, useCancelCampaign, useAudienceCount,
//           useNewsletterSettings, useSaveNewsletterSettings
// O público e a fila são calculados no servidor (newsletter_queue); o navegador só mostra.
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_DELIVERY_STATS, normalizeNewsletterSettings, type Campaign, type CampaignDraft, type DeliveryStats, type NewsletterSettings,
  type Segment, type Subscriber,
} from "@/lib/newsletter";

const sb = supabase as any;

/* ---------- Loja ---------- */

export type UnsubscribeResult = { email: string; was_subscribed: boolean; unsubscribed: boolean };

export function useUnsubscribe(token: string | null) {
  const qc = useQueryClient();
  const peek = useQuery({
    queryKey: ["newsletter-unsubscribe", token],
    enabled: !!token,
    retry: false,
    queryFn: async (): Promise<UnsubscribeResult> => {
      const { data, error } = await sb.rpc("newsletter_unsubscribe", { _token: token, _confirm: false });
      if (error) throw error;
      return data;
    },
  });
  const confirm = useMutation({
    mutationFn: async (): Promise<UnsubscribeResult> => {
      const { data, error } = await sb.rpc("newsletter_unsubscribe", { _token: token, _confirm: true });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => qc.setQueryData(["newsletter-unsubscribe", token], data),
  });
  return { peek, confirm };
}

/* ---------- Admin: inscritos ---------- */

const SUB_COLS = "id,email,name,status,source,locale,created_at,unsubscribed_at";

export function useSubscribers() {
  return useQuery({
    queryKey: ["admin-newsletter-subscribers"],
    queryFn: async (): Promise<Subscriber[]> => {
      const { data, error } = await sb.from("newsletter_subscriptions").select(SUB_COLS).order("created_at", { ascending: false }).limit(10000);
      if (error) throw error;
      return (data ?? []) as Subscriber[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["admin-newsletter-subscribers", "admin-newsletter-campaigns", "admin-newsletter-stats", "newsletter-audience"]) qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useSaveSubscriber() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string | null; patch: Partial<Pick<Subscriber, "email" | "name" | "status" | "locale">> & { source?: string } }) => {
      const { error } = a.id
        ? await sb.from("newsletter_subscriptions").update(a.patch).eq("id", a.id)
        : await sb.from("newsletter_subscriptions").insert({ source: "admin", status: "subscribed", ...a.patch });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSubscriber() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("newsletter_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/* ---------- Admin: campanhas ---------- */

export function useCampaigns() {
  return useQuery({
    queryKey: ["admin-newsletter-campaigns"],
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await sb.from("newsletter_campaigns").select("*").order("updated_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({ ...c, product_ids: c.product_ids ?? [], recipients: Number(c.recipients ?? 0) }));
    },
  });
}

export function useCampaignStats() {
  return useQuery({
    queryKey: ["admin-newsletter-stats"],
    queryFn: async (): Promise<Record<string, DeliveryStats>> => {
      const { data, error } = await sb.rpc("admin_newsletter_stats");
      if (error) throw error;
      const out: Record<string, DeliveryStats> = {};
      for (const [id, v] of Object.entries((data ?? {}) as Record<string, any>)) out[id] = { ...EMPTY_DELIVERY_STATS, ...v };
      return out;
    },
  });
}

export function useSaveCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string | null; draft: CampaignDraft }): Promise<string> => {
      if (a.id) {
        const { error } = await sb.from("newsletter_campaigns").update(a.draft).eq("id", a.id);
        if (error) throw error;
        return a.id;
      }
      const { data, error } = await sb.from("newsletter_campaigns").insert(a.draft).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("newsletter_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useQueueCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; sendAt: string | null }): Promise<{ recipients: number }> => {
      const { data, error } = await sb.rpc("newsletter_queue", { _campaign: a.id, _send_at: a.sendAt });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useCancelCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; toDraft: boolean }) => {
      const { error } = await sb.rpc("newsletter_cancel", { _campaign: a.id, _to_draft: a.toDraft });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Quantos inscritos ativos recebem com este segmento e idioma (calculado no servidor). */
export function useAudienceCount(segment: Segment, locale: string | null) {
  return useQuery({
    queryKey: ["newsletter-audience", segment, locale],
    staleTime: 15_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await sb.rpc("newsletter_audience_count", { _segment: segment, _locale: locale });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

/* ---------- Admin: regras ---------- */

export const NEWSLETTER_SETTINGS_KEY = ["newsletter-settings"] as const;

export function useNewsletterSettings() {
  return useQuery({
    queryKey: NEWSLETTER_SETTINGS_KEY,
    queryFn: async (): Promise<NewsletterSettings> => {
      const { data } = await sb.from("store_settings").select("value").eq("key", "newsletter").maybeSingle();
      return normalizeNewsletterSettings(data?.value);
    },
  });
}

export function useSaveNewsletterSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: NewsletterSettings) => {
      const { error } = await sb.from("store_settings").upsert({ key: "newsletter", value: next }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NEWSLETTER_SETTINGS_KEY }),
  });
}
