// Dados do Admin > Avaliações: avaliações dos produtos (product_reviews) e avaliações da loja (home_section_items com
// kind 'testimonial', enviadas em /deixar-avaliacao). A base protege os campos da loja (trigger product_reviews_guard):
// compra verificada e moderação são calculadas lá, nunca aqui.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const REVIEW_SOURCES = [
  "site", "whatsapp", "instagram", "facebook", "google", "email", "marketplace", "phone", "in_person", "other",
] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export type AdminReview = {
  id: string;
  product_id: string;
  user_id: string | null;
  order_id: string | null;
  rating: number;
  title: string;
  comment: string | null;
  customer_name: string | null;
  image_url: string | null;
  approved: boolean | null;
  created_by_admin: boolean;
  source: ReviewSource;
  verified: boolean;
  admin_reply: string | null;
  admin_reply_at: string | null;
  moderation_date: string | null;
  created_at: string;
  product_name: string | null;
  /** Nome a mostrar: o escrito na avaliação, senão o do perfil do cliente. */
  display_name: string | null;
};

export type ReviewDraft = {
  product_id: string;
  customer_name: string;
  rating: number;
  title: string;
  comment: string;
  image_url: string;
  source: ReviewSource;
  approved: boolean;
  admin_reply: string;
  created_at: string;
};

export type StoreReview = {
  id: string;
  author_name: string | null;
  author_role: string | null;
  author_location: string | null;
  submitter_email: string | null;
  rating: number | null;
  body: string | null;
  status: "approved" | "pending" | "rejected";
  is_active: boolean;
  created_at: string;
};

export type StoreReviewDraft = Pick<StoreReview, "author_name" | "author_role" | "author_location" | "rating" | "body" | "status">;

const PRODUCT_KEY = ["admin-reviews"];
const STORE_KEY = ["admin-store-reviews"];

export function useAdminProductReviews() {
  return useQuery({
    queryKey: PRODUCT_KEY,
    queryFn: async (): Promise<AdminReview[]> => {
      const { data, error } = await db.from("product_reviews").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Omit<AdminReview, "product_name" | "display_name">[];
      const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
      const [products, profiles] = await Promise.all([
        productIds.length ? db.from("products").select("id,name").in("id", productIds) : { data: [] },
        userIds.length ? db.from("user_profiles").select("user_id,full_name").in("user_id", userIds) : { data: [] },
      ]);
      const productName = new Map<string, string>((products.data ?? []).map((p: any) => [p.id, p.name]));
      const profileName = new Map<string, string>((profiles.data ?? []).map((p: any) => [p.user_id, p.full_name]));
      return rows.map((r) => ({
        ...r,
        product_name: productName.get(r.product_id) ?? null,
        display_name: r.customer_name?.trim() || (r.user_id ? profileName.get(r.user_id) ?? null : null),
      }));
    },
  });
}

export function useReviewProducts() {
  return useQuery({
    queryKey: ["admin-reviews-products"],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await db.from("products").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAdminStoreReviews() {
  return useQuery({
    queryKey: STORE_KEY,
    queryFn: async (): Promise<StoreReview[]> => {
      const { data, error } = await db
        .from("home_section_items")
        .select("id,author_name,author_role,author_location,submitter_email,rating,body,status,is_active,created_at")
        .eq("kind", "testimonial")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReviewMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: PRODUCT_KEY });
    qc.invalidateQueries({ queryKey: ["reviews"] });
    qc.invalidateQueries({ queryKey: ["admin-attention"] });
  };

  const save = useMutation({
    mutationFn: async ({ id, draft, customerReview }: { id: string | null; draft: ReviewDraft; customerReview: boolean }) => {
      const payload: Record<string, unknown> = {
        product_id: draft.product_id,
        customer_name: draft.customer_name.trim() || null,
        rating: draft.rating,
        title: draft.title.trim(),
        comment: draft.comment.trim() || null,
        image_url: draft.image_url || null,
        approved: draft.approved,
        admin_reply: draft.admin_reply.trim() || null,
      };
      // Avaliação do cliente: origem e data ficam as dele.
      if (!customerReview) {
        payload.source = draft.source === "site" ? "other" : draft.source;
        if (draft.created_at) payload.created_at = new Date(`${draft.created_at}T12:00:00`).toISOString();
      }
      const query = id
        ? db.from("product_reviews").update(payload).eq("id", id).select("id").single()
        : db.from("product_reviews").insert({ ...payload, created_by_admin: true }).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: refresh,
  });

  const setApproved = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const { error } = await db.from("product_reviews").update({ approved }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("product_reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return { save, setApproved, remove };
}

export function useStoreReviewMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: STORE_KEY });
    qc.invalidateQueries({ queryKey: ["home_section_items"] });
  };

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: StoreReviewDraft }) => {
      const payload = {
        author_name: draft.author_name?.trim() || null,
        author_role: draft.author_role?.trim() || null,
        author_location: draft.author_location?.trim() || null,
        rating: draft.rating,
        body: draft.body?.trim() || null,
        status: draft.status,
        is_active: draft.status === "approved",
      };
      const query = id
        ? db.from("home_section_items").update(payload).eq("id", id).select("id").single()
        : db.from("home_section_items").insert({ ...payload, kind: "testimonial", section_key: "testimonials", display_order: 0 }).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: refresh,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StoreReview["status"] }) => {
      const { error } = await db.from("home_section_items").update({ status, is_active: status === "approved" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("home_section_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return { save, setStatus, remove };
}
