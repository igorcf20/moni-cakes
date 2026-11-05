// =============================================================================================
// Fórum. Regras em src/lib/forum.ts; dados:
//   Loja    useForumRules, useForumCategories, useForumTopics, useForumTopic, countForumView, useCreateTopic,
//           useForumReply, useForumEdit, useForumReport
//   Admin   useForumStats, useAdminForumCategories, useSaveForumCategory, useDeleteForumCategory, useAdminForumTopics,
//           useAdminForumTopic, useAdminForumPosts, useUpdateForumTopic, useDeleteForumTopic, useUpdateForumPost,
//           useDeleteForumPost, useForumReports, useResolveForumReport, useSaveForumRules
// O site lê e escreve só pelas RPCs do banco; o Admin usa as tabelas (só administradores pela RLS).
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatures";
import {
  EMPTY_FORUM_STATS, FORUM_PAGE_SIZE, normalizeForumRules, type AdminForumCategory, type AdminForumPost, type AdminForumTopic,
  type CategoryDraft, type ForumCategory, type ForumReport, type ForumRules, type ForumStats, type ForumTopic, type ForumTopicRow,
} from "@/lib/forum";

const sb = supabase as any;

function useInvalidateForum() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["forum-categories", "forum-topics", "forum-topic", "admin-forum-stats", "admin-forum-categories", "admin-forum-topics",
      "admin-forum-topic", "admin-forum-posts", "admin-forum-reports", "admin-attention"]) qc.invalidateQueries({ queryKey: [k] });
  };
}

/* ---------- Loja: ler ---------- */

export const FORUM_RULES_KEY = ["forum-rules"] as const;

export function useForumRules() {
  return useQuery({
    queryKey: FORUM_RULES_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ForumRules> => {
      const { data } = await sb.from("store_settings").select("value").eq("key", "forum").maybeSingle();
      return normalizeForumRules(data?.value);
    },
  });
}

export function useForumCategories(locale: string) {
  const on = useFeature("forum");
  const { user } = useAuth();
  return useQuery({
    queryKey: ["forum-categories", locale, user?.id ?? null],
    enabled: on,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<ForumCategory[]> => {
      const { data, error } = await sb.rpc("forum_categories_public", { _locale: locale });
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({ ...c, topics: Number(c.topics ?? 0), posts: Number(c.posts ?? 0) }));
    },
  });
}

export function useForumTopics(a: { category: string | null; q: string | null; locale: string; page: number }) {
  const on = useFeature("forum");
  const { user } = useAuth();
  return useQuery({
    queryKey: ["forum-topics", a.category, a.q, a.locale, a.page, user?.id ?? null],
    enabled: on,
    retry: false,
    placeholderData: (prev: any) => prev,
    queryFn: async (): Promise<{ total: number; rows: ForumTopicRow[] }> => {
      const { data, error } = await sb.rpc("forum_topics_list", {
        _category: a.category, _q: a.q, _locale: a.locale, _limit: FORUM_PAGE_SIZE, _offset: (Math.max(a.page, 1) - 1) * FORUM_PAGE_SIZE,
      });
      if (error) throw error;
      return { total: Number(data?.total ?? 0), rows: (data?.rows ?? []) as ForumTopicRow[] };
    },
  });
}

export function useForumTopic(id: string | undefined) {
  const on = useFeature("forum");
  const { user } = useAuth();
  return useQuery({
    queryKey: ["forum-topic", id, user?.id ?? null],
    enabled: on && !!id,
    retry: false,
    queryFn: async (): Promise<ForumTopic> => {
      const { data, error } = await sb.rpc("forum_topic", { _topic: id });
      if (error) throw error;
      return data as ForumTopic;
    },
  });
}

/** Conta uma leitura por tópico e por visita (sem guardar nada no aparelho). */
const viewed = new Set<string>();
export function countForumView(id: string) {
  if (viewed.has(id)) return;
  viewed.add(id);
  void sb.rpc("forum_count_view", { _topic: id });
}

/* ---------- Loja: escrever ---------- */

export function useCreateTopic() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (a: { categoryId: string; title: string; body: string }): Promise<{ id: string; status: string }> => {
      const { data, error } = await sb.rpc("forum_create_topic", { _category: a.categoryId, _title: a.title, _body: a.body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useForumReply() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (a: { topicId: string; body: string }): Promise<{ id: string; status: string }> => {
      const { data, error } = await sb.rpc("forum_reply", { _topic: a.topicId, _body: a.body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useForumEdit() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (a: { topicId: string; postId: string | null; title: string | null; body: string }) => {
      const { error } = await sb.rpc("forum_edit", { _topic: a.topicId, _post: a.postId, _title: a.title, _body: a.body });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useForumReport() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (a: { topicId: string; postId: string | null; reason: string }) => {
      const { error } = await sb.rpc("forum_report", { _topic: a.topicId, _post: a.postId, _reason: a.reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/* ---------- Admin ---------- */

export function useForumStats() {
  return useQuery({
    queryKey: ["admin-forum-stats"],
    queryFn: async (): Promise<ForumStats> => {
      const { data, error } = await sb.rpc("admin_forum_stats");
      if (error) throw error;
      const out = { ...EMPTY_FORUM_STATS };
      for (const k of Object.keys(out) as (keyof ForumStats)[]) out[k] = Number(data?.[k] ?? 0);
      return out;
    },
  });
}

export function useAdminForumCategories() {
  return useQuery({
    queryKey: ["admin-forum-categories"],
    queryFn: async (): Promise<AdminForumCategory[]> => {
      const { data, error } = await sb.from("forum_categories").select("id,slug,name,description,locale,sort_order,is_active").order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as AdminForumCategory[];
    },
  });
}

export function useSaveForumCategory() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (a: { id: string | null; draft: CategoryDraft }) => {
      const { error } = a.id
        ? await sb.from("forum_categories").update(a.draft).eq("id", a.id)
        : await sb.from("forum_categories").insert(a.draft);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteForumCategory() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("forum_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

const TOPIC_COLS = "id,category_id,user_id,author_name,is_staff,title,body,status,pinned,locked,reply_count,views,last_post_at,created_at,edited_at";
const POST_COLS = "id,topic_id,user_id,author_name,is_staff,body,status,created_at,edited_at";

export function useAdminForumTopics() {
  return useQuery({
    queryKey: ["admin-forum-topics"],
    queryFn: async (): Promise<AdminForumTopic[]> => {
      const { data, error } = await sb.from("forum_topics").select(TOPIC_COLS).order("last_post_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as AdminForumTopic[];
    },
  });
}

export function useAdminForumTopic(id: string | null) {
  return useQuery({
    queryKey: ["admin-forum-topic", id],
    enabled: !!id,
    queryFn: async (): Promise<AdminForumTopic | null> => {
      const { data, error } = await sb.from("forum_topics").select(TOPIC_COLS).eq("id", id).maybeSingle();
      if (error) throw error;
      return data as AdminForumTopic | null;
    },
  });
}

/** Respostas de um tópico (topicId) ou todas as que esperam aprovação (topicId = null). */
export function useAdminForumPosts(topicId: string | null) {
  return useQuery({
    queryKey: ["admin-forum-posts", topicId],
    queryFn: async (): Promise<AdminForumPost[]> => {
      let q = sb.from("forum_posts").select(POST_COLS);
      q = topicId ? q.eq("topic_id", topicId).order("created_at") : q.eq("status", "pending").order("created_at", { ascending: false }).limit(500);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AdminForumPost[];
    },
  });
}

export function useUpdateForumTopic() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (a: { id: string; patch: Partial<Pick<AdminForumTopic, "status" | "pinned" | "locked" | "category_id" | "title" | "body">> }) => {
      const { error } = await sb.from("forum_topics").update(a.patch).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteForumTopic() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("forum_topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateForumPost() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (a: { id: string; patch: Partial<Pick<AdminForumPost, "status" | "body">> }) => {
      const { error } = await sb.from("forum_posts").update(a.patch).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteForumPost() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("forum_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useForumReports() {
  return useQuery({
    queryKey: ["admin-forum-reports"],
    queryFn: async (): Promise<ForumReport[]> => {
      const { data, error } = await sb.from("forum_reports").select("id,topic_id,post_id,user_id,reason,created_at,resolved_at")
        .order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as ForumReport[];
    },
  });
}

export function useResolveForumReport() {
  const invalidate = useInvalidateForum();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await sb.from("forum_reports").update({ resolved_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSaveForumRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: ForumRules) => {
      const { error } = await sb.from("store_settings").upsert({ key: "forum", value: next }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FORUM_RULES_KEY }),
  });
}
