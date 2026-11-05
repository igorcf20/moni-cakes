// =============================================================================================
// Blog da loja. Regras em src/lib/blog.ts; dados:
//   Loja    useBlogSettings, useBlogPosts (publicados, pela regra do banco), useBlogPost, useBlogComments,
//           useAddBlogComment, countBlogView
//   Admin   useAdminBlogPosts, useSaveBlogPost, useDeleteBlogPost, useAdminBlogComments, useModerateBlogComment,
//           useDeleteBlogComment, useSaveBlogSettings
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatures";
import { normalizeBlogSettings, type BlogComment, type BlogDraft, type BlogPost, type BlogSettings } from "@/lib/blog";

const sb = supabase as any;
const LIST_COLS = "id,slug,locale,title,excerpt,body,cover_url,cover_alt,author_name,tags,product_ids,status,published_at,featured,allow_comments,views,created_at,updated_at";
const toPost = (p: any): BlogPost => ({
  ...p,
  body: p.body ?? null,
  seo_title: p.seo_title ?? null,
  seo_description: p.seo_description ?? null,
  tags: p.tags ?? [],
  product_ids: p.product_ids ?? [],
  views: Number(p.views ?? 0),
});

/* ---------- Loja ---------- */

export const BLOG_SETTINGS_KEY = ["blog-settings"] as const;

export function useBlogSettings() {
  return useQuery({
    queryKey: BLOG_SETTINGS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BlogSettings> => {
      const { data } = await sb.from("store_settings").select("value").eq("key", "blog").maybeSingle();
      return normalizeBlogSettings(data?.value);
    },
  });
}

/** Publicados (o banco só devolve os com a data passada e o recurso ligado); o texto entra para o resumo e a busca. */
export function useBlogPosts() {
  const on = useFeature("blog");
  return useQuery({
    queryKey: ["blog-posts"],
    enabled: on,
    staleTime: 60_000,
    queryFn: async (): Promise<BlogPost[]> => {
      const { data, error } = await sb.from("blog_posts").select(LIST_COLS).eq("status", "published").order("published_at", { ascending: false }).limit(500);
      if (error) throw error;
      return ((data ?? []) as any[]).map(toPost);
    },
  });
}

export function useBlogPost(slug: string | undefined) {
  const on = useFeature("blog");
  return useQuery({
    queryKey: ["blog-post", slug],
    enabled: on && !!slug,
    queryFn: async (): Promise<BlogPost | null> => {
      const { data, error } = await sb.from("blog_posts").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
      if (error) throw error;
      return data ? toPost(data) : null;
    },
  });
}

export function useBlogComments(postId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["blog-comments", postId, user?.id ?? null],
    enabled: !!postId,
    queryFn: async (): Promise<BlogComment[]> => {
      const { data, error } = await sb.rpc("blog_post_comments", { _post: postId });
      if (error) throw error;
      return (data ?? []) as BlogComment[];
    },
  });
}

export function useAddBlogComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { postId: string; body: string }): Promise<{ id: string; status: "pending" | "approved" }> => {
      const { data, error } = await sb.rpc("add_blog_comment", { _post: a.postId, _body: a.body.trim() });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, a) => {
      qc.invalidateQueries({ queryKey: ["blog-comments", a.postId] });
      qc.invalidateQueries({ queryKey: ["admin-blog-comments"] });
      qc.invalidateQueries({ queryKey: ["admin-attention"] });
    },
  });
}

/** Uma leitura por artigo enquanto a página estiver aberta (nada fica guardado no aparelho). */
const viewed = new Set<string>();
export function countBlogView(postId: string) {
  if (viewed.has(postId)) return;
  viewed.add(postId);
  void sb.rpc("blog_count_view", { _post: postId });
}

/* ---------- Admin ---------- */

export type AdminBlogComment = {
  id: string; post_id: string; user_id: string | null; author_name: string | null; body: string; status: "pending" | "approved" | "rejected";
  admin_reply: string | null; created_at: string; post: { title: string; slug: string } | null;
};

function useInvalidateAdmin() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["admin-blog-posts", "admin-blog-comments", "blog-posts", "blog-post", "blog-comments", "admin-attention"]) qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useAdminBlogPosts() {
  return useQuery({
    queryKey: ["admin-blog-posts"],
    queryFn: async (): Promise<BlogPost[]> => {
      const { data, error } = await sb.from("blog_posts").select("*").order("updated_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return ((data ?? []) as any[]).map(toPost);
    },
  });
}

export function useSaveBlogPost() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (a: { id: string | null; draft: BlogDraft }): Promise<string> => {
      const row = { ...a.draft };
      if (a.id) {
        const { error } = await sb.from("blog_posts").update(row).eq("id", a.id);
        if (error) throw error;
        return a.id;
      }
      const { data, error } = await sb.from("blog_posts").insert(row).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteBlogPost() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("blog_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAdminBlogComments() {
  return useQuery({
    queryKey: ["admin-blog-comments"],
    queryFn: async (): Promise<AdminBlogComment[]> => {
      const { data, error } = await sb.from("blog_comments").select("*, blog_posts(title, slug)").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return ((data ?? []) as any[]).map(({ blog_posts, ...c }) => ({ ...c, post: blog_posts ?? null }));
    },
  });
}

export function useModerateBlogComment() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (a: { id: string; status?: AdminBlogComment["status"]; reply?: string | null }) => {
      const patch: Record<string, unknown> = {};
      if (a.status) patch.status = a.status;
      if (a.reply !== undefined) patch.admin_reply = a.reply?.trim() || null;
      const { error } = await sb.from("blog_comments").update(patch).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteBlogComment() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("blog_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSaveBlogSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: BlogSettings) => {
      const { error } = await sb.from("store_settings").upsert({ key: "blog", value: next }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BLOG_SETTINGS_KEY }),
  });
}
