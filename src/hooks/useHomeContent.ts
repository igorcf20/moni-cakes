import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HomeSection = {
  id: string;
  key: string;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  secondary_cta_text: string | null;
  secondary_cta_url: string | null;
  is_active: boolean;
};

export type HomeSectionItem = {
  id: string;
  section_key: string;
  kind: "feature" | "trust_stat" | "testimonial" | string;
  display_order: number;
  is_active: boolean;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  icon: string | null;
  stat_value: string | null;
  stat_label: string | null;
  author_name: string | null;
  author_role: string | null;
  author_location: string | null;
  rating: number | null;
  status?: string | null;
};

export const useHomeContent = () => {
  const sections = useQuery({
    queryKey: ["home_sections"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("home_sections")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      const map: Record<string, HomeSection> = {};
      (data || []).forEach((s: HomeSection) => { map[s.key] = s; });
      return map;
    },
    staleTime: 60_000,
  });

  const items = useQuery({
    queryKey: ["home_section_items"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("home_section_items_public")
        .select("*")
        .eq("is_active", true)
        .eq("status", "approved")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as HomeSectionItem[];
    },
    staleTime: 60_000,
  });

  const byKind = (sectionKey: string, kind: string) =>
    (items.data || []).filter((i) => i.section_key === sectionKey && i.kind === kind);

  return { sections: sections.data || {}, items: items.data || [], byKind, isLoading: sections.isLoading || items.isLoading };
};

export const useGoogleReviewSettings = () => {
  return useQuery({
    queryKey: ["google_review_settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("store_settings")
        .select("key, value")
        .in("key", ["google_place_id", "google_maps_review_url", "google_rating_cache"]);
      if (error) throw error;
      const out: Record<string, any> = {};
      (data || []).forEach((r: any) => { out[r.key] = r.value; });
      return {
        place_id: (out.google_place_id as string) || "",
        review_url: (out.google_maps_review_url as string) || "",
        rating: out.google_rating_cache?.rating ?? null,
        total: out.google_rating_cache?.total ?? null,
        updated_at: out.google_rating_cache?.updated_at ?? null,
      };
    },
    staleTime: 60_000,
  });
};