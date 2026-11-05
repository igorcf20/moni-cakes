// Cartão de uma enquete no site (bloco da página inicial e página /enquetes). Mostra as respostas para votar ou,
// depois do voto e se a regra da enquete deixar, as barras do resultado. O servidor decide quem vota e o que aparece.
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Loader2, Lock, Vote } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useVotePoll } from "@/hooks/usePolls";
import { useMessages } from "@/i18n";
import { pollsMessages } from "@/i18n/polls";
import { pollErrorOf, pollLeaders, pollPercents, togglePollChoice, type SitePoll } from "@/lib/polls";
import { cn } from "@/lib/utils";

export function PollCard({ poll, className }: { poll: SitePoll; className?: string }) {
  const { t, locale } = useMessages(pollsMessages);
  const { user } = useAuth();
  const location = useLocation();
  const vote = useVotePoll();
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [justVoted, setJustVoted] = useState(false);

  const ids = poll.options.map((o) => o.id);
  const showResults = poll.counts !== null && poll.total !== null && (poll.voted || !poll.open);
  const needsLogin = poll.open && !poll.voted && !poll.guests && !user;
  const canVote = poll.open && !poll.voted && !needsLogin;
  const single = poll.max_choices <= 1;
  const percents = showResults ? pollPercents(poll.counts!, ids, poll.total!, single) : {};
  const leaders = showResults ? pollLeaders(poll.counts!, ids) : [];
  const votes = (n: number) => (n === 1 ? t("votes_one") : t("votes_n", { n: n.toLocaleString(locale) }));
  const date = (d: string) => new Date(d).toLocaleDateString(locale, { day: "numeric", month: "long" });

  const submit = async () => {
    setError(null);
    try {
      await vote.mutateAsync({ pollId: poll.id, options: picked });
      setJustVoted(true);
    } catch (e) {
      setError(t(`err_${pollErrorOf((e as Error)?.message)}`));
    }
  };

  const note = !poll.voted && !poll.open ? null
    : poll.voted && !showResults ? (poll.results === "hidden" ? t("results_hidden") : poll.results === "after_close" ? t("results_after_close") : t("voted_hidden"))
    : !poll.voted && poll.results === "after_close" ? t("results_after_close")
    : !poll.voted && poll.results === "hidden" ? t("results_hidden")
    : null;

  return (
    <article className={cn("flex h-full flex-col gap-4 rounded-[20px] border border-brand-card-border bg-white p-5 sm:p-6", className)}>
      <header className="space-y-1.5">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-orange-text">
          <Vote className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          {poll.open ? (single ? t("choose_one") : t("choose_up_to", { n: poll.max_choices })) : t("closed")}
        </div>
        <h3 className="text-[20px] font-bold leading-snug tracking-[-0.02em]">{poll.title}</h3>
        {poll.description && <p className="text-[15px] leading-relaxed text-brand-ink-soft">{poll.description}</p>}
      </header>

      {showResults ? (
        <ul className="space-y-2.5" aria-label={poll.title}>
          {poll.options.map((o) => {
            const mine = poll.mine.includes(o.id);
            const lead = leaders.includes(o.id);
            const pct = percents[o.id] ?? 0;
            return (
              <li key={o.id} className="relative overflow-hidden rounded-[14px] border border-brand-card-border bg-brand-alt/60">
                <motion.span aria-hidden="true" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className={cn("absolute inset-y-0 left-0", lead ? "bg-primary/20" : "bg-brand-ink/[0.07]")} />
                <span className="relative flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
                    <span className="min-w-0 break-words">{o.label}</span>
                    {mine && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[12px] font-semibold text-brand-orange-text"><Check className="h-3 w-3" aria-hidden="true" />{t("your_vote")}</span>}
                  </span>
                  <span className={cn("shrink-0 text-[15px] tabular-nums", lead ? "font-bold" : "font-semibold text-brand-ink-soft")}>{pct}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div role={single ? "radiogroup" : "group"} aria-label={poll.title} className="space-y-2.5">
          {poll.options.map((o) => {
            const on = picked.includes(o.id) || poll.mine.includes(o.id);
            const full = !single && !on && picked.length >= poll.max_choices;
            return (
              <button key={o.id} type="button" role={single ? "radio" : "checkbox"} aria-checked={on} disabled={!canVote || full}
                onClick={() => setPicked((p) => togglePollChoice(p, o.id, poll.max_choices))}
                className={cn("flex min-h-12 w-full items-center gap-3 rounded-[14px] border px-4 py-2.5 text-left text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  on ? "border-primary bg-brand-orange-soft" : "border-brand-card-border bg-white enabled:hover:border-primary/50", full && "opacity-50")}>
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center border-2 transition-colors duration-150", single ? "rounded-full" : "rounded-[6px]",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-brand-ink/25")} aria-hidden="true">
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 break-words">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {note && <p className="rounded-[14px] bg-brand-alt px-4 py-3 text-[14px] text-brand-ink-soft">{note}</p>}
      {justVoted && showResults && <p className="text-[14px] font-medium text-emerald-700" role="status">{t("thanks")}</p>}
      {error && <p className="text-[14px] text-destructive" role="alert">{error}</p>}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-[13px] text-brand-ink-soft">
          {[showResults ? (poll.total! > 0 ? votes(poll.total!) : t("no_votes")) : null, poll.open && poll.ends_at ? t("ends_on", { date: date(poll.ends_at) }) : null].filter(Boolean).join(" · ")}
        </p>
        {canVote && (
          <button type="button" onClick={() => void submit()} disabled={!picked.length || vote.isPending}
            className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            {vote.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {vote.isPending ? t("voting") : t("vote")}
          </button>
        )}
        {needsLogin && (
          <p className="flex items-center gap-2 text-[14px] text-brand-ink-soft">
            <Lock className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("login_to_vote")}
            <Link to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} className="font-semibold text-brand-orange-text hover:underline">{t("login")}</Link>
          </p>
        )}
      </footer>
    </article>
  );
}
