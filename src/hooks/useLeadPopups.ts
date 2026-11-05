// =============================================================================================
// Pop-ups de captação. Regras e formato em src/lib/leadPopups.ts; dados:
//   Loja    useSitePopups (site_popups; com ?popup_preview=<id> o admin vê qualquer um), popupSeen, useSubmitPopupLead
//   Admin   useAdminPopups, useAdminPopupStats, useSavePopup, useDeletePopup, useResetPopupViews,
//           usePopupLeads, useDeletePopupLeads, useCouponExists, uploadPopupImage
// As tabelas são só do Admin; o site passa sempre pelas RPCs.
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatures";
import {
  normalizeContent, normalizeRules, type LeadPopup, type LeadValues, type PopupContent, type PopupRules, type PopupStatus, type SitePopup,
} from "@/lib/leadPopups";

const sb = supabase as any;
// Colunas com permissão (o sal dos visitantes nunca sai do banco).
const POPUP_COLS = "id,name,status,content,rules,priority,starts_at,ends_at,coupon_code,save_newsletter,views,created_at,updated_at";
const LEAD_COLS = "id,popup_id,popup_name,email,phone,name,extra,consent,newsletter,locale,country,path,user_id,created_at";

const toSite = (p: any): SitePopup => ({ id: p.id, priority: Number(p.priority) || 0, content: normalizeContent(p.content), rules: normalizeRules(p.rules) });

/* ---------- Loja ---------- */

export function useSitePopups(preview: string | null) {
  const on = useFeature("lead_popups");
  return useQuery({
    queryKey: ["site-popups", preview],
    enabled: on || !!preview,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SitePopup[]> => {
      const { data, error } = await sb.rpc("site_popups", preview ? { _preview: preview } : {});
      if (error) throw error;
      return ((data ?? []) as any[]).map(toSite);
    },
  });
}

export function popupSeen(id: string) {
  void sb.rpc("popup_seen", { _id: id }).then(() => undefined, () => undefined);
}

export type SubmitResult = { ok: true; duplicate: boolean; coupon: string | null };

/** Erro do servidor em código estável: invalid:<campo>:<motivo>, empty, consent, rate_limited, not_found... */
export function popupErrorCode(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  const m = msg.match(/(invalid:[a-z0-9_]+:[a-z_]+|feature_off|not_found|empty|consent|rate_limited)/);
  return m ? m[1] : "unknown";
}

export function useSubmitPopupLead() {
  return useMutation({
    mutationFn: async (a: { popupId: string; values: LeadValues; consent: boolean; locale: string; country: string | null; path: string }): Promise<SubmitResult> => {
      const { data, error } = await sb.rpc("submit_popup_lead", {
        _popup: a.popupId, _values: a.values, _consent: a.consent, _locale: a.locale, _country: a.country, _path: a.path,
      });
      if (error) throw error;
      return data as SubmitResult;
    },
  });
}

/* ---------- Admin ---------- */

const toPopup = (p: any): LeadPopup => ({
  ...p,
  priority: Number(p.priority) || 0,
  views: Number(p.views) || 0,
  content: normalizeContent(p.content),
  rules: normalizeRules(p.rules),
});

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["admin-popups", "admin-popup-stats", "site-popups", "popup-leads"]) qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useAdminPopups() {
  return useQuery({
    queryKey: ["admin-popups"],
    queryFn: async (): Promise<LeadPopup[]> => {
      const { data, error } = await sb.from("lead_popups").select(POPUP_COLS).order("priority").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return ((data ?? []) as any[]).map(toPopup);
    },
  });
}

export type PopupStats = { leads: number; last: string | null; week: number };
export const EMPTY_POPUP_STATS: PopupStats = { leads: 0, last: null, week: 0 };

export function useAdminPopupStats() {
  return useQuery({
    queryKey: ["admin-popup-stats"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, PopupStats>> => {
      const { data, error } = await sb.rpc("admin_popup_stats");
      if (error) throw error;
      return (data ?? {}) as Record<string, PopupStats>;
    },
  });
}

export type PopupDraft = {
  name: string;
  status: PopupStatus;
  content: PopupContent;
  rules: PopupRules;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  coupon_code: string | null;
  save_newsletter: boolean;
};

export function useSavePopup() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: PopupDraft }): Promise<string> => {
      const row = { ...draft, coupon_code: draft.coupon_code?.trim() || null, name: draft.name.trim() };
      if (id) {
        const { error } = await sb.from("lead_popups").update(row).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await sb.from("lead_popups").insert(row).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: inv,
  });
}

export function useDeletePopup() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("lead_popups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: inv,
  });
}

export function useResetPopupViews() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("admin_popup_reset_views", { _id: id });
      if (error) throw error;
    },
    onSuccess: inv,
  });
}

export type PopupLead = {
  id: string;
  popup_id: string | null;
  popup_name: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  extra: Record<string, string>;
  consent: boolean;
  newsletter: boolean;
  locale: string | null;
  country: string | null;
  path: string | null;
  user_id: string | null;
  created_at: string;
};

/** Contatos recebidos (de um pop-up ou de todos), os mais novos primeiro. */
export function usePopupLeads(popupId: string | null) {
  return useQuery({
    queryKey: ["popup-leads", popupId],
    queryFn: async (): Promise<PopupLead[]> => {
      let q = sb.from("popup_leads").select(LEAD_COLS).order("created_at", { ascending: false }).limit(5000);
      if (popupId) q = q.eq("popup_id", popupId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((l) => ({ ...l, extra: l.extra && typeof l.extra === "object" ? l.extra : {} }));
    },
  });
}

export function useDeletePopupLeads() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await sb.from("popup_leads").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: inv,
  });
}

/** O cupom existe e está ativo em Admin > Cupons? (null = não deu para saber) */
export function useCouponExists(code: string | null | undefined) {
  const c = (code ?? "").trim();
  return useQuery({
    queryKey: ["popup-coupon", c.toUpperCase()],
    enabled: c.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<{ exists: boolean; active: boolean } | null> => {
      const { data, error } = await sb.from("coupons").select("code,active").ilike("code", c).limit(1);
      if (error) return null;
      const row = (data ?? [])[0];
      return { exists: !!row, active: !!row?.active };
    },
  });
}

/** Envia uma imagem para o armazenamento público dos banners (pasta popups) e devolve o endereço (caminho no próprio site). */
export async function uploadPopupImage(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `popups/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("banners").upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from("banners").getPublicUrl(path);
  // O armazenamento fica no mesmo domínio do site: guarda o caminho, que continua certo se o domínio mudar.
  try {
    const u = new URL(data.publicUrl, window.location.origin);
    return u.origin === window.location.origin ? u.pathname : data.publicUrl;
  } catch {
    return data.publicUrl;
  }
}
