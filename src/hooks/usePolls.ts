// =============================================================================================
// Enquetes. Regras em src/lib/polls.ts; dados:
//   Loja    useSitePolls (site_polls, 'home' ou 'all'), useVotePoll (vote_poll)
//   Admin   useAdminPolls, useAdminPollStats, useSavePoll (enquete + respostas), useDeletePoll, useResetPollVotes
// As tabelas são só do Admin; o site passa sempre pelas RPCs.
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatures";
import { EMPTY_POLL_STATS, type Poll, type PollDraft, type PollStats, type SitePoll } from "@/lib/polls";

const sb = supabase as any;
// Colunas com permissão (o sal dos visitantes nunca sai do banco).
const POLL_COLS = "id,title,description,locale,status,starts_at,ends_at,max_choices,guests,results,show_on_home,position,created_at,updated_at,poll_options(id,poll_id,label,position)";

/* ---------- Loja ---------- */

export function useSitePolls(scope: "home" | "all" = "all") {
  const on = useFeature("polls");
  const { user } = useAuth();
  return useQuery({
    queryKey: ["site-polls", scope, user?.id ?? null],
    enabled: on,
    staleTime: 30_000,
    queryFn: async (): Promise<SitePoll[]> => {
      const { data, error } = await sb.rpc("site_polls", { _scope: scope });
      if (error) throw error;
      return (data ?? []) as SitePoll[];
    },
  });
}

export function useVotePoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { pollId: string; options: string[] }): Promise<SitePoll> => {
      const { data, error } = await sb.rpc("vote_poll", { _poll: a.pollId, _options: a.options });
      if (error) throw error;
      return data as SitePoll;
    },
    onSuccess: (poll) => {
      // Troca a enquete nas listas já abertas e volta a pedir as contas ao servidor.
      qc.setQueriesData<SitePoll[]>({ queryKey: ["site-polls"] }, (old) => old?.map((p) => (p.id === poll.id ? poll : p)));
      qc.invalidateQueries({ queryKey: ["site-polls"] });
      qc.invalidateQueries({ queryKey: ["admin-poll-stats"] });
    },
  });
}

/* ---------- Admin ---------- */

const toPoll = ({ poll_options, ...p }: any): Poll => ({
  ...p,
  options: [...(poll_options ?? [])].sort((a: any, b: any) => a.position - b.position),
});

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["admin-polls", "admin-poll-stats", "site-polls"]) qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useAdminPolls() {
  return useQuery({
    queryKey: ["admin-polls"],
    queryFn: async (): Promise<Poll[]> => {
      const { data, error } = await sb.from("polls").select(POLL_COLS).order("position").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return ((data ?? []) as any[]).map(toPoll);
    },
  });
}

export function useAdminPollStats() {
  return useQuery({
    queryKey: ["admin-poll-stats"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Record<string, PollStats>> => {
      const { data, error } = await sb.rpc("admin_poll_stats");
      if (error) throw error;
      const out: Record<string, PollStats> = {};
      for (const [id, v] of Object.entries((data ?? {}) as Record<string, any>)) {
        out[id] = { ...EMPTY_POLL_STATS, ...v, total: Number(v.total ?? 0), accounts: Number(v.accounts ?? 0), guests: Number(v.guests ?? 0) };
      }
      return out;
    },
  });
}

/** Grava a enquete e as respostas: muda as que ficaram, cria as novas e apaga as tiradas (os votos delas saem). */
export function useSavePoll() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string | null; draft: PollDraft; previous: string[] }): Promise<string> => {
      const { options, ...row } = a.draft;
      let id = a.id;
      if (id) {
        const { error } = await sb.from("polls").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("polls").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      const kept = options.filter((o) => o.label.trim());
      const removed = a.previous.filter((pid) => !kept.some((o) => o.id === pid));
      if (removed.length) {
        const { error } = await sb.from("poll_options").delete().in("id", removed);
        if (error) throw error;
      }
      for (const [position, o] of kept.entries()) {
        const { error } = o.id
          ? await sb.from("poll_options").update({ label: o.label.trim(), position }).eq("id", o.id)
          : await sb.from("poll_options").insert({ poll_id: id, label: o.label.trim(), position });
        if (error) throw error;
      }
      return id!;
    },
    onSuccess: invalidate,
  });
}

export function useDeletePoll() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("polls").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useResetPollVotes() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("poll_ballots").delete().eq("poll_id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
