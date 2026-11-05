// =====================================================================================
// Admin > Aparência e conteúdo > Enquetes (recurso polls em Admin > Recursos da loja). Sem janelas:
//   Lista      números (abertas, votos, agendadas e rascunhos, encerradas), filtros, busca e lista
//   enquete    (ver=enquete&id=<id> ou id=novo) pergunta, texto de apoio, respostas (ordem, votos de cada uma);
//              resultado ao vivo (barras, contas e visitantes, último voto, zerar votos); ao lado: estado
//              (rascunho, aberta, encerrada), início e fim, idioma, respostas por pessoa, quem vota, quando o
//              resultado aparece, página inicial; apagar
// Regras no banco (migration 20261007170000_polls.sql); contas em src/lib/polls.ts; dados em src/hooks/usePolls.ts;
// textos em src/i18n/adminPolls.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CalendarClock, ChevronRight, ExternalLink, Home, Loader2, Lock, Plus, RotateCcw, Search, Trash2, Users, Vote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { LOCALE_NAMES, useMessages } from "@/i18n";
import { adminPollsMessages } from "@/i18n/adminPolls";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useAdminPolls, useAdminPollStats, useDeletePoll, useResetPollVotes, useSavePoll } from "@/hooks/usePolls";
import {
  EMPTY_POLL_DRAFT, EMPTY_POLL_STATS, MAX_POLL_OPTIONS, pollDraftErrors, pollLeaders, pollPercents, pollState, POLL_LOCALES, POLL_PATH,
  POLL_RESULTS, type Poll, type PollDraft, type PollLocale, type PollState, type PollStatus,
} from "@/lib/polls";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminPollsMessages["pt-BR"]>>["t"];
const PAGE_SIZE = 25;

const Loading = ({ t }: { t: T }) => (
  <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
);

const STATE_TONE: Record<PollState, string> = {
  open: "bg-emerald-50 text-emerald-700",
  scheduled: "bg-sky-50 text-sky-800",
  draft: "bg-muted text-muted-foreground",
  ended: "bg-amber-50 text-amber-800",
  closed: "bg-muted text-foreground",
};
function StateChip({ t, state }: { t: T; state: PollState }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATE_TONE[state])}>{t(`state_${state}`)}</span>;
}

/** ISO para o campo datetime-local (hora local) e de volta. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export default function AdminPolls() {
  const page = useAdminPage();
  if (page.view === "enquete" && page.id) return <PollPage id={page.id} onBack={page.close} onOpen={(id) => page.open("enquete", id)} />;
  return <PollList onOpen={(id) => page.open("enquete", id)} />;
}

/* ---------- Lista ---------- */

type ListFilter = "all" | "open" | "waiting" | "finished";

function PollList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminPollsMessages);
  const fmt = useAdminFormat();
  const { data: polls = [], isLoading, error } = useAdminPolls();
  const { data: stats = {} } = useAdminPollStats();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [q, setQ] = useState("");
  const [pg, setPg] = useState(1);
  const rows = useMemo(() => polls.map((p) => ({ p, state: pollState(p), s: stats[p.id] ?? EMPTY_POLL_STATS })), [polls, stats]);
  useEffect(() => setPg(1), [filter, q]);

  const help = <AdminHelp id="polls" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />;
  if (isLoading) return <div className="space-y-5">{help}<Loading t={t} /></div>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;
  if (!polls.length) {
    return (
      <div className="space-y-5">
        {help}
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
          <Vote className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
          <p className="max-w-md text-sm text-muted-foreground">{t("empty_all")}</p>
          <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new_first")}</Button>
        </div>
      </div>
    );
  }

  const group = (st: PollState): ListFilter => (st === "open" ? "open" : st === "draft" || st === "scheduled" ? "waiting" : "finished");
  const count = (f: ListFilter) => rows.filter((r) => group(r.state) === f).length;
  const votes = rows.reduce((n, r) => n + r.s.total, 0);
  const openVotes = rows.filter((r) => r.state === "open").reduce((n, r) => n + r.s.total, 0);
  const s = q.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === "all" || group(r.state) === filter)
    && (!s || r.p.title.toLowerCase().includes(s) || r.p.options.some((o) => o.label.toLowerCase().includes(s))));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));

  return (
    <div className="space-y-5">
      {help}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Vote} label={t("stat_open")} value={count("open")} onClick={() => setFilter("open")} active={filter === "open"} />
        <AdminStatCard icon={Users} label={t("stat_votes")} value={votes.toLocaleString()} hint={openVotes ? t("stat_votes_open", { n: openVotes.toLocaleString() }) : undefined} />
        <AdminStatCard icon={CalendarClock} label={t("stat_waiting")} value={count("waiting")} onClick={() => setFilter("waiting")} active={filter === "waiting"} />
        <AdminStatCard icon={Lock} label={t("stat_finished")} value={count("finished")} onClick={() => setFilter("finished")} active={filter === "finished"} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips<ListFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
            { value: "all", label: t("f_all"), count: rows.length },
            { value: "open", label: t("f_open"), count: count("open") },
            { value: "waiting", label: t("f_waiting"), count: count("waiting") },
            { value: "finished", label: t("f_finished"), count: count("finished") },
          ]} />
          <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new")}</Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
        </div>
      </div>

      {shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("none_match")}</p> : (
        <>
          <ul className="space-y-3">
            {shown.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE).map(({ p, state, s: st }) => {
              const ids = p.options.map((o) => o.id);
              const lead = pollLeaders(st.counts, ids).map((id) => p.options.find((o) => o.id === id)?.label).filter(Boolean);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => onOpen(p.id)} className="flex w-full flex-col gap-3 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand-orange-text"><Vote className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold">{p.title}</span>
                          <StateChip t={t} state={state} />
                          {p.show_on_home && state !== "draft" && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-orange-text"><Home className="h-3 w-3" aria-hidden="true" />{t("on_home")}</span>}
                        </span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {[p.locale ? LOCALE_NAMES[p.locale] : t("all_locales"),
                            t("answers_n", { n: p.options.length }),
                            state === "scheduled" ? t("opens", { when: fmt.dateTime(p.starts_at!) }) : state === "open" && p.ends_at ? t("closes", { when: fmt.dateTime(p.ends_at) }) : null,
                            lead.length ? t("leading", { label: lead.join(", ") }) : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-4 self-end sm:self-auto">
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">{st.total.toLocaleString()}</span>
                        <span className="block text-xs text-muted-foreground">{t("row_votes")}</span>
                      </span>
                      <ChevronRight className="hidden h-4 w-4 text-brand-orange-text sm:block" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <AdminPager page={pg} pages={pages} total={shown.length} from={(pg - 1) * PAGE_SIZE + 1} to={Math.min(shown.length, pg * PAGE_SIZE)} onPage={setPg} />
        </>
      )}
    </div>
  );
}

/* ---------- Página da enquete ---------- */

const draftOf = (p: Poll): PollDraft => ({
  title: p.title, description: p.description, locale: p.locale, status: p.status, starts_at: p.starts_at, ends_at: p.ends_at,
  max_choices: p.max_choices, guests: p.guests, results: p.results, show_on_home: p.show_on_home, position: p.position,
  options: p.options.map((o) => ({ id: o.id, label: o.label })),
});

function PollPage({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const { t } = useMessages(adminPollsMessages);
  const fmt = useAdminFormat();
  const isNew = id === "novo";
  const { data: polls = [], isLoading } = useAdminPolls();
  const { data: allStats = {} } = useAdminPollStats();
  const save = useSavePoll();
  const del = useDeletePoll();
  const reset = useResetPollVotes();
  const { ask, confirmSlot } = useInlineConfirm();
  const p = polls.find((x) => x.id === id);
  const st = allStats[id] ?? EMPTY_POLL_STATS;
  const [f, setF] = useState<PollDraft>(EMPTY_POLL_DRAFT);
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [tried, setTried] = useState(false);

  // Recarrega o formulário só quando a enquete muda no banco.
  useEffect(() => {
    if (p) {
      setF(draftOf(p));
      setStarts(toLocalInput(p.starts_at));
      setEnds(toLocalInput(p.ends_at));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, p?.updated_at, p?.options.map((o) => `${o.id}:${o.label}:${o.position}`).join("|")]);

  if (isLoading) return <Loading t={t} />;
  if (!isNew && !p) return <AdminSubpage title={t("err_not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("load_error")}</p></AdminSubpage>;

  const set = <K extends keyof PollDraft>(k: K, v: PollDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  const draft: PollDraft = { ...f, starts_at: fromLocalInput(starts), ends_at: fromLocalInput(ends) };
  const errs = pollDraftErrors(draft);
  const state = pollState(draft);
  const filled = f.options.filter((o) => o.label.trim()).length;
  const votesOf = (oid: string | null) => (oid ? st.counts[oid] ?? 0 : 0);

  const setOption = (i: number, label: string) => setF((x) => ({ ...x, options: x.options.map((o, j) => (j === i ? { ...o, label } : o)) }));
  const move = (i: number, d: number) => setF((x) => {
    const next = [...x.options];
    const [o] = next.splice(i, 1);
    next.splice(i + d, 0, o);
    return { ...x, options: next };
  });
  const removeOption = async (i: number) => {
    const o = f.options[i];
    const n = votesOf(o.id);
    if (n > 0 && !(await ask(t("remove_option_confirm", { label: o.label }), { description: t("remove_option_d", { n }), confirmLabel: t("remove"), tone: "danger" }))) return;
    setF((x) => ({ ...x, options: x.options.filter((_, j) => j !== i) }));
  };

  const submit = async () => {
    setTried(true);
    if (errs.length) return;
    try {
      const newId = await save.mutateAsync({ id: isNew ? null : id, draft, previous: p?.options.map((o) => o.id) ?? [] });
      toast.success(t("saved"));
      setTried(false);
      if (isNew) onOpen(newId);
    } catch {
      toast.error(t("save_error"));
    }
  };
  const remove = async () => {
    if (!p) return;
    if (!(await ask(t("delete_confirm", { title: p.title }), { description: t("delete_d", { n: st.total }), confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await del.mutateAsync(p.id);
      toast.success(t("deleted"));
      onBack();
    } catch {
      toast.error(t("save_error"));
    }
  };
  const resetVotes = async () => {
    if (!p) return;
    if (!(await ask(t("reset_confirm"), { description: t("reset_d", { n: st.total }), confirmLabel: t("reset"), tone: "danger" }))) return;
    try {
      await reset.mutateAsync(p.id);
      toast.success(t("reset_done"));
    } catch {
      toast.error(t("save_error"));
    }
  };

  const savedIds = p?.options.map((o) => o.id) ?? [];
  const percents = pollPercents(st.counts, savedIds, st.total, (p?.max_choices ?? 1) <= 1);
  const leaders = pollLeaders(st.counts, savedIds);
  const live = p && ["open", "closed", "ended"].includes(pollState(p));

  return (
    <AdminSubpage
      title={isNew ? t("new") : p!.title}
      subtitle={isNew ? t("new_d") : [t(`state_${pollState(p!)}`), t("votes_n", { n: st.total.toLocaleString() }), t("edited", { when: fmt.relative(p!.updated_at) })].join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={!isNew && (
        <div className="flex items-center gap-1">
          {live && <a href={`${siteUrl()}${POLL_PATH}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-brand-orange-text hover:bg-muted">{t("view_site")}<ExternalLink className="h-3.5 w-3.5" /></a>}
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>
        </div>
      )}
    >
      {confirmSlot}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
            <div className="space-y-1.5">
              <Label htmlFor="pl-title">{t("f_title")}</Label>
              <Input id="pl-title" value={f.title} maxLength={300} onChange={(e) => set("title", e.target.value)} placeholder={t("f_title_ph")} aria-invalid={tried && errs.includes("title")} className="text-base" />
              {tried && errs.includes("title") && <p className="text-xs text-destructive">{t("err_title")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-desc">{t("f_desc")}</Label>
              <Textarea id="pl-desc" rows={2} maxLength={1000} value={f.description ?? ""} onChange={(e) => set("description", e.target.value || null)} placeholder={t("f_desc_ph")} />
            </div>
          </section>

          <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
            <div>
              <h4 className="font-semibold">{t("options_title")}</h4>
              <p className="text-sm text-muted-foreground">{t("options_d")}</p>
            </div>
            <ol className="space-y-2">
              {f.options.map((o, i) => (
                <li key={o.id ?? `new-${i}`} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  <Input value={o.label} maxLength={200} onChange={(e) => setOption(i, e.target.value)} placeholder={t("option_ph", { n: i + 1 })} aria-label={t("option_ph", { n: i + 1 })} />
                  {o.id && <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">{t("votes_n", { n: votesOf(o.id) })}</span>}
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={i === 0} aria-label={t("move_up")} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={i === f.options.length - 1} aria-label={t("move_down")} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={t("remove")} onClick={() => void removeOption(i)}><X className="h-4 w-4" /></Button>
                </li>
              ))}
            </ol>
            {tried && errs.includes("options") && <p className="text-xs text-destructive">{t("err_options")}</p>}
            {tried && errs.includes("dupe") && <p className="text-xs text-destructive">{t("err_dupe")}</p>}
            {f.options.length < MAX_POLL_OPTIONS && (
              <Button type="button" variant="outline" size="sm" onClick={() => set("options", [...f.options, { id: null, label: "" }])}><Plus className="mr-1.5 h-4 w-4" />{t("add_option")}</Button>
            )}
          </section>

          {!isNew && (
            <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{t("results_title")}</h4>
                  <p className="text-sm text-muted-foreground">{st.total ? t("results_d", { n: st.total.toLocaleString(), a: st.accounts.toLocaleString(), g: st.guests.toLocaleString() }) : t("results_none")}</p>
                </div>
                {st.total > 0 && <Button variant="outline" size="sm" onClick={() => void resetVotes()} disabled={reset.isPending}><RotateCcw className="mr-1.5 h-4 w-4" />{t("reset")}</Button>}
              </div>
              <ul className="space-y-2">
                {p!.options.map((o) => {
                  const pct = percents[o.id] ?? 0;
                  return (
                    <li key={o.id} className="relative overflow-hidden rounded-xl border bg-muted/30">
                      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", leaders.includes(o.id) ? "bg-primary/20" : "bg-foreground/[0.07]")} style={{ width: `${pct}%` }} />
                      <span className="relative flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 break-words font-medium">{o.label}</span>
                        <span className="shrink-0 tabular-nums"><span className="font-semibold">{pct}%</span><span className="ml-2 text-muted-foreground">{(st.counts[o.id] ?? 0).toLocaleString()}</span></span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {st.last && <p className="text-xs text-muted-foreground">{t("last_vote", { when: fmt.relative(st.last) })}{p!.max_choices > 1 ? ` · ${t("multi_note")}` : ""}</p>}
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="space-y-4 rounded-[18px] border bg-card p-4 lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">{t("status_title")}</h4>
              <StateChip t={t} state={state} />
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t("status_title")}>
              {(["draft", "open", "closed"] as PollStatus[]).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={f.status === s} onClick={() => set("status", s)}
                  className={cn("min-h-9 rounded-lg px-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    f.status === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {t(`status_${s}`)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t(`status_${f.status}_d`)}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-1.5">
                <Label htmlFor="pl-starts">{t("f_starts")}</Label>
                <Input id="pl-starts" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pl-ends">{t("f_ends")}</Label>
                <Input id="pl-ends" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} aria-invalid={tried && errs.includes("dates")} />
              </div>
            </div>
            {tried && errs.includes("dates") ? <p className="text-xs text-destructive">{t("err_dates")}</p> : <p className="text-xs text-muted-foreground">{t("f_dates_d")}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="pl-locale">{t("f_locale")}</Label>
              <select id="pl-locale" value={f.locale ?? ""} onChange={(e) => set("locale", (e.target.value || null) as PollLocale | null)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">{t("all_locales")}</option>
                {POLL_LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-max">{t("f_max")}</Label>
              <Input id="pl-max" type="number" min={1} max={Math.max(1, filled)} value={f.max_choices}
                onChange={(e) => set("max_choices", Math.max(1, Math.min(MAX_POLL_OPTIONS, Math.round(Number(e.target.value) || 1))))} aria-invalid={tried && errs.includes("choices")} />
              {tried && errs.includes("choices") ? <p className="text-xs text-destructive">{t("err_choices")}</p> : <p className="text-xs text-muted-foreground">{f.max_choices <= 1 ? t("f_max_one") : t("f_max_many", { n: f.max_choices })}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-results">{t("f_results")}</Label>
              <select id="pl-results" value={f.results} onChange={(e) => set("results", e.target.value as PollDraft["results"])}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {POLL_RESULTS.map((r) => <option key={r} value={r}>{t(`results_${r}`)}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{t(`results_${f.results}_d`)}</p>
            </div>
            <label className="flex items-start justify-between gap-3 border-t pt-3">
              <span><span className="block text-sm font-medium">{t("f_guests")}</span><span className="block text-xs text-muted-foreground">{t("f_guests_d")}</span></span>
              <Switch checked={f.guests} onCheckedChange={(v) => set("guests", v)} aria-label={t("f_guests")} />
            </label>
            <label className="flex items-start justify-between gap-3">
              <span><span className="block text-sm font-medium">{t("f_home")}</span><span className="block text-xs text-muted-foreground">{t("f_home_d")}</span></span>
              <Switch checked={f.show_on_home} onCheckedChange={(v) => set("show_on_home", v)} aria-label={t("f_home")} />
            </label>
            {tried && errs.length > 0 && <p className="text-sm text-destructive" role="alert">{t("err_fix")}</p>}
            <Button className="w-full" onClick={() => void submit()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isNew ? t("create") : t("save")}
            </Button>
          </section>
        </aside>
      </div>
    </AdminSubpage>
  );
}
