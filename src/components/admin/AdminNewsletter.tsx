// =====================================================================================
// Admin > Marketing > Newsletter (recurso newsletter_campaigns em Admin > Recursos da loja). Sem janelas:
//   Campanhas   números (inscritos, novos em 30 dias, na fila, enviadas), aviso do envio de e-mails, filtros e lista
//   campanha    (ver=campanha&id=<id> ou id=novo) nome, assunto, pré-visualização, texto, produtos em destaque,
//               prévia do e-mail (computador e celular); ao lado: público (segmento e idioma, com a contagem do
//               servidor), enviar agora ou agendar; na fila: números, cancelar ou voltar a rascunho; duplicar, apagar
//   Inscritos   ativos e cancelados, origem, idioma, busca, adicionar, cancelar ou reativar, apagar, planilha
//   Regras      nome do remetente, e-mail de resposta e rodapé com o endereço da empresa
// O envio sai quando houver remetente de e-mail na loja; até lá a campanha fica na fila. Regras no banco
// (migration 20261007180000_newsletter_campaigns.sql); contas e HTML do e-mail em src/lib/newsletter.ts; dados em
// src/hooks/useNewsletter.ts; textos em src/i18n/adminNewsletter.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import {
  ArrowDown, ArrowUp, CalendarClock, ChevronRight, Copy, Download, Inbox, Loader2, Mail, MailOpen, Monitor, Plus, Search, Send, Smartphone,
  Trash2, TriangleAlert, Undo2, UserPlus, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import RichTextEditor from "./RichTextEditor";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { LOCALE_NAMES, useLocale, useMessages } from "@/i18n";
import { adminNewsletterMessages } from "@/i18n/adminNewsletter";
import { newsletterMessages } from "@/i18n/newsletter";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useBrand } from "@/hooks/useBrand";
import { useLinkProductOptions } from "@/hooks/useCrossSell";
import { useProductCards } from "@/hooks/useProductCards";
import {
  useAudienceCount, useCampaigns, useCampaignStats, useCancelCampaign, useDeleteCampaign, useDeleteSubscriber, useNewsletterSettings,
  useQueueCampaign, useSaveCampaign, useSaveNewsletterSettings, useSaveSubscriber, useSubscribers,
} from "@/hooks/useNewsletter";
import { downloadCsv } from "@/lib/csv";
import {
  absoluteUrl, campaignDraftErrors, campaignState, duplicateCampaign, EMAIL_RE, EMPTY_CAMPAIGN, EMPTY_DELIVERY_STATS, MAX_CAMPAIGN_PRODUCTS,
  NEWSLETTER_LOCALES, newsletterErrorOf, renderNewsletterEmail, SEGMENTS, UNSUBSCRIBE_PATH,
  type CampaignDraft, type CampaignState, type NewsletterLocale, type NewsletterSettings, type Segment, type Subscriber,
} from "@/lib/newsletter";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminNewsletterMessages["pt-BR"]>>["t"];
const PAGE_SIZE = 25;

const Loading = ({ t }: { t: T }) => (
  <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
);
const LoadError = ({ t }: { t: T }) => (
  <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>
);

const STATE_TONE: Record<CampaignState, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-sky-50 text-sky-800",
  queued: "bg-amber-50 text-amber-800",
  sending: "bg-amber-50 text-amber-800",
  sent: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-muted text-foreground",
};
function StateChip({ t, state }: { t: T; state: CampaignState }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATE_TONE[state])}>{t(`state_${state}`)}</span>;
}

/** Aviso fixo: sem remetente de e-mail na loja, nada sai (a campanha espera na fila). */
function EmailNotice({ t }: { t: T }) {
  return (
    <p className="flex items-start gap-2 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span><span className="font-semibold">{t("email_off_title")}</span> {t("email_off_d")}</span>
    </p>
  );
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function AdminNewsletter() {
  const { t } = useMessages(adminNewsletterMessages);
  const page = useAdminPage();
  const tab = ["inscritos", "regras"].includes(page.tab ?? "") ? page.tab! : "campanhas";
  if (page.view === "campanha" && page.id) return <CampaignPage id={page.id} onBack={page.close} onOpen={(id) => page.open("campanha", id)} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="newsletter" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="campanhas" className="px-4">{t("tab_campaigns")}</TabsTrigger>
          <TabsTrigger value="inscritos" className="px-4">{t("tab_subscribers")}</TabsTrigger>
          <TabsTrigger value="regras" className="px-4">{t("tab_rules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="campanhas" className="mt-5"><CampaignList onOpen={(id) => page.open("campanha", id)} onSubscribers={() => page.setTab("inscritos")} /></TabsContent>
        <TabsContent value="inscritos" className="mt-5"><SubscriberList /></TabsContent>
        <TabsContent value="regras" className="mt-5"><Rules /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Campanhas ---------- */

type ListFilter = "all" | "draft" | "waiting" | "sent" | "cancelled";
const groupOf = (s: CampaignState): ListFilter => (s === "draft" ? "draft" : s === "sent" ? "sent" : s === "cancelled" ? "cancelled" : "waiting");

function CampaignList({ onOpen, onSubscribers }: { onOpen: (id: string) => void; onSubscribers: () => void }) {
  const { t } = useMessages(adminNewsletterMessages);
  const fmt = useAdminFormat();
  const { data: campaigns = [], isLoading, error } = useCampaigns();
  const { data: subs = [] } = useSubscribers();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [q, setQ] = useState("");
  const [pg, setPg] = useState(1);
  const rows = useMemo(() => campaigns.map((c) => ({ c, state: campaignState(c) })), [campaigns]);
  useEffect(() => setPg(1), [filter, q]);

  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;

  const active = subs.filter((s) => s.status === "subscribed").length;
  const month = Date.now() - 30 * 86_400_000;
  const fresh = subs.filter((s) => s.status === "subscribed" && new Date(s.created_at).getTime() > month).length;
  const count = (f: ListFilter) => rows.filter((r) => groupOf(r.state) === f).length;
  const s = q.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === "all" || groupOf(r.state) === filter) && (!s || r.c.name.toLowerCase().includes(s) || r.c.subject.toLowerCase().includes(s)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <EmailNotice t={t} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Users} label={t("stat_subscribers")} value={active.toLocaleString()} onClick={onSubscribers} />
        <AdminStatCard icon={UserPlus} label={t("stat_new")} value={fresh.toLocaleString()} />
        <AdminStatCard icon={CalendarClock} label={t("stat_waiting")} value={count("waiting")} onClick={() => setFilter("waiting")} active={filter === "waiting"} />
        <AdminStatCard icon={Send} label={t("stat_sent")} value={count("sent")} onClick={() => setFilter("sent")} active={filter === "sent"} />
      </div>

      {!campaigns.length ? (
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
          <MailOpen className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
          <p className="max-w-md text-sm text-muted-foreground">{t("empty_all")}</p>
          <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new_first")}</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FilterChips<ListFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
                { value: "all", label: t("f_all"), count: rows.length },
                { value: "draft", label: t("state_draft"), count: count("draft") },
                { value: "waiting", label: t("f_waiting"), count: count("waiting") },
                { value: "sent", label: t("state_sent"), count: count("sent") },
                { value: "cancelled", label: t("state_cancelled"), count: count("cancelled") },
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
                {shown.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE).map(({ c, state }) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => onOpen(c.id)} className="flex w-full flex-col gap-3 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand-orange-text"><Mail className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{c.name}</span><StateChip t={t} state={state} /></span>
                          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                            {[c.subject || t("no_subject"), t(`seg_${c.segment}`), c.locale ? LOCALE_NAMES[c.locale] : null,
                              state === "scheduled" ? t("goes", { when: fmt.dateTime(c.send_at!) }) : state === "draft" ? t("edited", { when: fmt.relative(c.updated_at) }) : c.queued_at ? fmt.date(c.queued_at) : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center gap-4 self-end sm:self-auto">
                        {state !== "draft" && (
                          <span className="text-right">
                            <span className="block font-semibold tabular-nums">{c.recipients.toLocaleString()}</span>
                            <span className="block text-xs text-muted-foreground">{t("row_recipients")}</span>
                          </span>
                        )}
                        <ChevronRight className="hidden h-4 w-4 text-brand-orange-text sm:block" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <AdminPager page={pg} pages={pages} total={shown.length} from={(pg - 1) * PAGE_SIZE + 1} to={Math.min(shown.length, pg * PAGE_SIZE)} onPage={setPg} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Página da campanha ---------- */

function CampaignPage({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const { t } = useMessages(adminNewsletterMessages);
  const fmt = useAdminFormat();
  const isNew = id === "novo";
  const { data: campaigns = [], isLoading } = useCampaigns();
  const { data: stats = {} } = useCampaignStats();
  const save = useSaveCampaign();
  const del = useDeleteCampaign();
  const queue = useQueueCampaign();
  const cancel = useCancelCampaign();
  const { ask, confirmSlot } = useInlineConfirm();
  const c = campaigns.find((x) => x.id === id);
  const [f, setF] = useState<CampaignDraft>(EMPTY_CAMPAIGN);
  const [tried, setTried] = useState<"save" | "send" | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [when, setWhen] = useState("");

  // Recarrega o formulário só quando a campanha muda no banco.
  useEffect(() => {
    if (c) {
      setF({ name: c.name, subject: c.subject, preheader: c.preheader, body: c.body ?? "", product_ids: c.product_ids, segment: c.segment, locale: c.locale });
      setEditorKey((k) => k + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id, c?.updated_at]);

  const audience = useAudienceCount(f.segment, f.locale);
  if (isLoading) return <Loading t={t} />;
  if (!isNew && !c) return <AdminSubpage title={t("err_not_found")} backLabel={t("back")} onBack={onBack}><LoadError t={t} /></AdminSubpage>;

  const state = c ? campaignState(c) : "draft";
  const locked = state !== "draft";
  const st = stats[id] ?? EMPTY_DELIVERY_STATS;
  const set = <K extends keyof CampaignDraft>(k: K, v: CampaignDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  const errs = campaignDraftErrors(f, tried === "send");
  const showErr = (k: (typeof errs)[number]) => !!tried && errs.includes(k);
  const errText = (e: unknown) => t(`err_${newsletterErrorOf((e as Error)?.message)}`);

  const persist = async (): Promise<string | null> => {
    try {
      const savedId = await save.mutateAsync({ id: isNew ? null : id, draft: { ...f, name: f.name.trim() } });
      return savedId;
    } catch (e) {
      toast.error(errText(e));
      return null;
    }
  };
  const submit = async () => {
    setTried("save");
    if (campaignDraftErrors(f, false).length) return;
    const savedId = await persist();
    if (!savedId) return;
    toast.success(t("saved"));
    setTried(null);
    if (isNew) onOpen(savedId);
  };
  const send = async () => {
    setTried("send");
    if (campaignDraftErrors(f, true).length) return;
    const sendAt = mode === "later" && when ? new Date(when).toISOString() : null;
    if (mode === "later" && (!when || new Date(when).getTime() <= Date.now())) { toast.error(t("err_when")); return; }
    if (!(await ask(sendAt ? t("schedule_confirm", { n: (audience.data ?? 0).toLocaleString(), when: fmt.dateTime(sendAt) }) : t("send_confirm", { n: (audience.data ?? 0).toLocaleString() }), { description: t("send_confirm_d"), confirmLabel: sendAt ? t("schedule") : t("send_now") }))) return;
    const savedId = await persist();
    if (!savedId) return;
    try {
      const r = await queue.mutateAsync({ id: savedId, sendAt });
      toast.success(t("queued_toast", { n: r.recipients.toLocaleString() }));
      setTried(null);
      if (isNew) onOpen(savedId);
    } catch (e) {
      toast.error(errText(e));
    }
  };
  const stop = async (toDraft: boolean) => {
    if (!(await ask(toDraft ? t("to_draft_confirm") : t("cancel_confirm"), { description: toDraft ? t("to_draft_d") : t("cancel_d"), confirmLabel: toDraft ? t("to_draft") : t("cancel"), tone: toDraft ? undefined : "danger" }))) return;
    try {
      await cancel.mutateAsync({ id, toDraft });
      toast.success(toDraft ? t("to_draft_done") : t("cancelled_toast"));
    } catch (e) {
      toast.error(errText(e));
    }
  };
  const duplicate = async () => {
    try {
      const newId = await save.mutateAsync({ id: null, draft: duplicateCampaign(f, t("copy_suffix")) });
      toast.success(t("duplicated"));
      onOpen(newId);
    } catch (e) {
      toast.error(errText(e));
    }
  };
  const remove = async () => {
    if (!c) return;
    if (!(await ask(t("delete_confirm", { name: c.name }), { description: t("delete_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await del.mutateAsync(c.id);
      toast.success(t("deleted"));
      onBack();
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const subtitle = isNew ? t("new_d")
    : [t(`state_${state}`), state === "scheduled" ? t("goes", { when: fmt.dateTime(c!.send_at!) }) : null, locked ? t("recipients_n", { n: c!.recipients.toLocaleString() }) : t("edited", { when: fmt.relative(c!.updated_at) })].filter(Boolean).join(" · ");

  return (
    <AdminSubpage
      title={isNew ? t("new") : c!.name}
      subtitle={subtitle}
      backLabel={t("back")}
      onBack={onBack}
      actions={!isNew && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => void duplicate()} disabled={save.isPending}><Copy className="mr-1.5 h-4 w-4" />{t("duplicate")}</Button>
          {!["queued", "scheduled", "sending"].includes(state) && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>}
        </div>
      )}
    >
      {confirmSlot}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {locked && <p className="rounded-[18px] border bg-muted/40 p-4 text-sm text-muted-foreground">{t("locked_note")}</p>}
          <fieldset disabled={locked} className="min-w-0 space-y-5">
            <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
              <div className="space-y-1.5">
                <Label htmlFor="nl-name">{t("f_name")}</Label>
                <Input id="nl-name" value={f.name} maxLength={200} onChange={(e) => set("name", e.target.value)} placeholder={t("f_name_ph")} aria-invalid={showErr("name")} />
                {showErr("name") ? <p className="text-xs text-destructive">{t("err_name")}</p> : <p className="text-xs text-muted-foreground">{t("f_name_d")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl-subject">{t("f_subject")}</Label>
                <Input id="nl-subject" value={f.subject} maxLength={200} onChange={(e) => set("subject", e.target.value)} placeholder={t("f_subject_ph")} aria-invalid={showErr("subject")} className="text-base" />
                {showErr("subject") ? <p className="text-xs text-destructive">{t("err_subject")}</p> : <p className="text-xs text-muted-foreground">{t("f_subject_d", { n: f.subject.length })}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl-pre">{t("f_preheader")}</Label>
                <Input id="nl-pre" value={f.preheader ?? ""} maxLength={200} onChange={(e) => set("preheader", e.target.value || null)} placeholder={t("f_preheader_ph")} />
                <p className="text-xs text-muted-foreground">{t("f_preheader_d")}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("f_body")}</Label>
                {locked ? <div className="prose prose-sm max-w-none rounded-xl border bg-white p-4" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(f.body ?? "") }} />
                  : <RichTextEditor key={editorKey} value={f.body ?? ""} onChange={(v) => set("body", v)} placeholder={t("f_body_ph")} className="[&_.ProseMirror]:min-h-[260px]" />}
                {showErr("body") && <p className="text-xs text-destructive">{t("err_body")}</p>}
              </div>
            </section>
            <ProductsPicker ids={f.product_ids} onChange={(ids) => set("product_ids", ids)} t={t} locked={locked} />
          </fieldset>
          <EmailPreview draft={f} t={t} />
        </div>

        <aside className="space-y-5">
          <section className="space-y-4 rounded-[18px] border bg-card p-4 lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">{t("audience_title")}</h4>
              <StateChip t={t} state={state} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-seg">{t("f_segment")}</Label>
              <select id="nl-seg" value={f.segment} disabled={locked} onChange={(e) => set("segment", e.target.value as Segment)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                {SEGMENTS.map((s) => <option key={s} value={s}>{t(`seg_${s}`)}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{t(`seg_${f.segment}_d`)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-locale">{t("f_locale")}</Label>
              <select id="nl-locale" value={f.locale ?? ""} disabled={locked} onChange={(e) => set("locale", (e.target.value || null) as NewsletterLocale | null)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                <option value="">{t("all_locales")}</option>
                {NEWSLETTER_LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{t("f_locale_d")}</p>
            </div>
            {!locked && (
              <p className="flex items-center gap-2 rounded-xl bg-primary/5 p-3 text-sm">
                <Users className="h-4 w-4 shrink-0 text-brand-orange-text" aria-hidden="true" />
                {audience.isLoading ? t("loading") : t("audience_n", { n: (audience.data ?? 0).toLocaleString() })}
              </p>
            )}

            {locked ? (
              <div className="space-y-3 border-t pt-3">
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{t("st_queued")}</dt><dd className="text-lg font-semibold tabular-nums">{st.queued.toLocaleString()}</dd></div>
                  <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{t("st_sent")}</dt><dd className="text-lg font-semibold tabular-nums">{st.sent.toLocaleString()}</dd></div>
                  <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{t("st_failed")}</dt><dd className="text-lg font-semibold tabular-nums">{st.failed.toLocaleString()}</dd></div>
                  <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{t("st_skipped")}</dt><dd className="text-lg font-semibold tabular-nums">{st.skipped.toLocaleString()}</dd></div>
                </dl>
                {["queued", "scheduled", "sending"].includes(state) && (
                  <>
                    <p className="text-xs text-muted-foreground">{t("waiting_sender")}</p>
                    {st.sent + st.failed === 0 && <Button variant="outline" className="w-full" onClick={() => void stop(true)} disabled={cancel.isPending}><Undo2 className="mr-1.5 h-4 w-4" />{t("to_draft")}</Button>}
                    <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={() => void stop(false)} disabled={cancel.isPending}><X className="mr-1.5 h-4 w-4" />{t("cancel")}</Button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3 border-t pt-3">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t("when_title")}>
                  {(["now", "later"] as const).map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                      className={cn("min-h-9 rounded-lg px-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                      {t(`when_${m}`)}
                    </button>
                  ))}
                </div>
                {mode === "later" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="nl-when">{t("f_when")}</Label>
                    <Input id="nl-when" type="datetime-local" value={when} min={toLocalInput(new Date().toISOString())} onChange={(e) => setWhen(e.target.value)} />
                  </div>
                )}
                {tried && errs.length > 0 && <p className="text-sm text-destructive" role="alert">{t("err_fix")}</p>}
                <Button className="w-full" onClick={() => void send()} disabled={save.isPending || queue.isPending || !audience.data}>
                  {queue.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  {mode === "later" ? t("schedule") : t("send_now")}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => void submit()} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("save_draft")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("send_note")}</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </AdminSubpage>
  );
}

function ProductsPicker({ ids, onChange, t, locked }: { ids: string[]; onChange: (ids: string[]) => void; t: T; locked: boolean }) {
  const { data: options = [] } = useLinkProductOptions();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return options.filter((o) => o.is_active && !ids.includes(o.id) && [o.name, o.id, o.sku ?? ""].some((v) => v.toLowerCase().includes(s))).slice(0, 8);
  }, [q, options, ids]);
  const move = (i: number, d: number) => {
    const next = [...ids];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
      <div>
        <h4 className="font-semibold">{t("products_title")}</h4>
        <p className="text-sm text-muted-foreground">{t("products_d")}</p>
      </div>
      {ids.length > 0 && (
        <ol className="divide-y rounded-xl border">
          {ids.map((pid, i) => {
            const o = byId.get(pid);
            return (
              <li key={pid} className="flex items-center gap-3 p-2.5">
                {o?.image ? <img src={o.image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-lg bg-muted" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{o?.name ?? pid}</span>
                {!locked && <>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} aria-label={t("move_up")} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === ids.length - 1} aria-label={t("move_down")} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("remove")} onClick={() => onChange(ids.filter((x) => x !== pid))}><X className="h-4 w-4" /></Button>
                </>}
              </li>
            );
          })}
        </ol>
      )}
      {!locked && ids.length < MAX_CAMPAIGN_PRODUCTS && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("products_search")} aria-label={t("products_search")} className="pl-9" />
          </div>
          {q.trim() && (results.length === 0 ? <p className="text-sm text-muted-foreground">{t("no_results")}</p> : (
            <ul className="divide-y rounded-xl border">
              {results.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => { onChange([...ids, o.id]); setQ(""); }} className="flex w-full items-center gap-3 p-2.5 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                    {o.image ? <img src={o.image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-lg bg-muted" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.name}</span>
                    <Plus className="h-4 w-4 text-brand-orange-text" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </>
      )}
    </section>
  );
}

const SOURCES = ["newsletter", "signup", "popup", "checkout", "admin"] as const;

/** Prévia do e-mail como os programas de e-mail o mostram (iframe sem scripts), com a largura do computador ou do celular. */
function EmailPreview({ draft, t }: { draft: CampaignDraft; t: T }) {
  const brand = useBrand();
  const { data: settings } = useNewsletterSettings();
  const { cards } = useProductCards(draft.product_ids, "newsletter-cards");
  const current = useLocale((s) => s.locale);
  const lang = draft.locale ?? current;
  const mail = newsletterMessages[lang] ?? newsletterMessages["pt-BR"];
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");
  const base = siteUrl();
  const html = useMemo(() => renderNewsletterEmail({
    subject: draft.subject || t("no_subject"),
    preheader: draft.preheader,
    body: DOMPurify.sanitize(draft.body || `<p>${t("f_body_ph")}</p>`),
    products: cards.map((p) => ({ name: p.name, price: p.price, oldPrice: p.oldPrice, image: absoluteUrl(base, p.image), url: `${base}/produto/${p.id}` })),
    brand: {
      name: brand.name, logo: absoluteUrl(base, brand.logos.wordmark || brand.logos.full),
      primary: brand.theme.colors.primary, text: brand.theme.colors.text, muted: brand.theme.colors.textMuted,
      background: brand.theme.colors.background, surface: brand.theme.colors.surface, border: brand.theme.colors.border,
    },
    footerText: settings?.footer_text ?? "",
    siteUrl: base,
    unsubscribeUrl: `${base}${UNSUBSCRIBE_PATH}?t=...`,
    labels: { viewProduct: mail.mail_view, products: mail.mail_products, unsubscribe: mail.mail_unsubscribe, why: mail.mail_why, visit: mail.mail_visit },
    lang,
  }), [draft, cards, brand, settings, base, mail, lang, t]);
  const from = settings?.from_name || brand.name;
  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold">{t("preview_title")}</h4>
          <p className="text-sm text-muted-foreground">{t("preview_d")}</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          <Button type="button" size="sm" variant={width === "desktop" ? "secondary" : "ghost"} className="h-8" onClick={() => setWidth("desktop")} aria-pressed={width === "desktop"}><Monitor className="mr-1.5 h-4 w-4" />{t("pv_desktop")}</Button>
          <Button type="button" size="sm" variant={width === "phone" ? "secondary" : "ghost"} className="h-8" onClick={() => setWidth("phone")} aria-pressed={width === "phone"}><Smartphone className="mr-1.5 h-4 w-4" />{t("pv_phone")}</Button>
        </div>
      </div>
      <div className="rounded-xl border bg-muted/30 p-3">
        <div className="mb-3 flex items-start gap-3 rounded-lg bg-white p-3 text-sm">
          <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-semibold">{from}</span>
            <span className="block truncate">{draft.subject || t("no_subject")}</span>
            {draft.preheader && <span className="block truncate text-muted-foreground">{draft.preheader}</span>}
          </span>
        </div>
        <iframe title={t("preview_title")} srcDoc={html} sandbox="" className={cn("mx-auto block h-[720px] rounded-lg border bg-white transition-[width] duration-200", width === "phone" ? "w-[375px] max-w-full" : "w-full")} />
      </div>
    </section>
  );
}

/* ---------- Inscritos ---------- */

type SubFilter = "subscribed" | "unsubscribed" | "all";

function SubscriberList() {
  const { t } = useMessages(adminNewsletterMessages);
  const fmt = useAdminFormat();
  const { data: subs = [], isLoading, error } = useSubscribers();
  const saveSub = useSaveSubscriber();
  const delSub = useDeleteSubscriber();
  const { ask, confirmSlot } = useInlineConfirm();
  const [filter, setFilter] = useState<SubFilter>("subscribed");
  const [q, setQ] = useState("");
  const [pg, setPg] = useState(1);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [locale, setLocale] = useState<NewsletterLocale | "">("");
  useEffect(() => setPg(1), [filter, q]);

  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;

  const active = subs.filter((s) => s.status === "subscribed");
  const out = subs.filter((s) => s.status === "unsubscribed");
  const month = Date.now() - 30 * 86_400_000;
  const s = q.trim().toLowerCase();
  const shown = subs.filter((x) => (filter === "all" || x.status === filter) && (!s || x.email.includes(s) || (x.name ?? "").toLowerCase().includes(s)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const source = (x: Subscriber) => t(`src_${(SOURCES as readonly string[]).includes(x.source ?? "") ? (x.source as (typeof SOURCES)[number]) : "other"}`);

  const add = async () => {
    const v = email.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) { toast.error(t("err_email")); return; }
    if (subs.some((x) => x.email === v)) { toast.error(t("err_email_taken")); return; }
    try {
      await saveSub.mutateAsync({ id: null, patch: { email: v, name: name.trim() || null, locale: locale || null } });
      toast.success(t("sub_added"));
      setEmail(""); setName(""); setLocale(""); setAdding(false);
    } catch {
      toast.error(t("save_error"));
    }
  };
  const toggle = async (x: Subscriber) => {
    const next = x.status === "subscribed" ? "unsubscribed" : "subscribed";
    if (next === "subscribed" && !(await ask(t("resub_confirm", { email: x.email }), { description: t("resub_d"), confirmLabel: t("resub") }))) return;
    try {
      await saveSub.mutateAsync({ id: x.id, patch: { status: next } });
      toast.success(next === "subscribed" ? t("resub_done") : t("unsub_done"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const remove = async (x: Subscriber) => {
    if (!(await ask(t("sub_delete_confirm", { email: x.email }), { description: t("sub_delete_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await delSub.mutateAsync(x.id);
      toast.success(t("sub_deleted"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const exportCsv = () => downloadCsv("newsletter-inscritos", [t("csv_email"), t("csv_name"), t("csv_status"), t("csv_source"), t("csv_locale"), t("csv_date")],
    shown.map((x) => [x.email, x.name ?? "", t(`sub_${x.status}`), source(x), x.locale ?? "", fmt.date(x.created_at)]));

  return (
    <div className="space-y-5">
      {confirmSlot}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Users} label={t("stat_subscribers")} value={active.length.toLocaleString()} onClick={() => setFilter("subscribed")} active={filter === "subscribed"} />
        <AdminStatCard icon={UserPlus} label={t("stat_new")} value={active.filter((x) => new Date(x.created_at).getTime() > month).length.toLocaleString()} />
        <AdminStatCard icon={Mail} label={t("stat_from_signup")} value={active.filter((x) => x.source === "signup").length.toLocaleString()} />
        <AdminStatCard icon={X} label={t("stat_unsubscribed")} value={out.length.toLocaleString()} onClick={() => setFilter("unsubscribed")} active={filter === "unsubscribed"} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips<SubFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
            { value: "subscribed", label: t("sub_subscribed"), count: active.length },
            { value: "unsubscribed", label: t("sub_unsubscribed"), count: out.length },
            { value: "all", label: t("f_all"), count: subs.length },
          ]} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!shown.length}><Download className="mr-1.5 h-4 w-4" />{t("csv")}</Button>
            <Button onClick={() => setAdding((v) => !v)}><UserPlus className="mr-1.5 h-4 w-4" />{t("sub_add")}</Button>
          </div>
        </div>
        {adding && (
          <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[1.4fr_1fr_160px_auto] sm:items-end">
            <div className="space-y-1.5"><Label htmlFor="ns-email">{t("csv_email")}</Label><Input id="ns-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ns-name">{t("csv_name")}</Label><Input id="ns-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-locale">{t("csv_locale")}</Label>
              <select id="ns-locale" value={locale} onChange={(e) => setLocale(e.target.value as NewsletterLocale | "")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{t("no_locale")}</option>
                {NEWSLETTER_LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
              </select>
            </div>
            <Button onClick={() => void add()} disabled={saveSub.isPending}>{t("sub_add_btn")}</Button>
            <p className="text-xs text-muted-foreground sm:col-span-4">{t("sub_add_d")}</p>
          </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("sub_search")} aria-label={t("sub_search")} className="pl-9" />
        </div>
      </div>

      {shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{subs.length ? t("none_match") : t("sub_empty")}</p> : (
        <>
          <ul className="divide-y rounded-[18px] border bg-card">
            {shown.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE).map((x) => (
              <li key={x.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{x.email}</span>
                    {x.status === "unsubscribed" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{t("sub_unsubscribed")}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {[x.name, source(x), x.locale ? LOCALE_NAMES[x.locale] : null, x.status === "unsubscribed" && x.unsubscribed_at ? t("left_on", { when: fmt.date(x.unsubscribed_at) }) : t("joined_on", { when: fmt.date(x.created_at) })].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1 self-end sm:self-auto">
                  <Button variant="ghost" size="sm" onClick={() => void toggle(x)} disabled={saveSub.isPending}>{x.status === "subscribed" ? t("unsub") : t("resub")}</Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" aria-label={t("delete")} onClick={() => void remove(x)}><Trash2 className="h-4 w-4" /></Button>
                </span>
              </li>
            ))}
          </ul>
          <AdminPager page={pg} pages={pages} total={shown.length} from={(pg - 1) * PAGE_SIZE + 1} to={Math.min(shown.length, pg * PAGE_SIZE)} onPage={setPg} />
        </>
      )}
    </div>
  );
}

/* ---------- Regras ---------- */

function Rules() {
  const { t } = useMessages(adminNewsletterMessages);
  const brand = useBrand();
  const { data, isLoading } = useNewsletterSettings();
  const saveRules = useSaveNewsletterSettings();
  const [f, setF] = useState<NewsletterSettings | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  if (isLoading || !f) return <Loading t={t} />;
  const replyBad = !!f.reply_to.trim() && !EMAIL_RE.test(f.reply_to.trim());
  const submit = async () => {
    if (replyBad) return;
    try {
      await saveRules.mutateAsync({ from_name: f.from_name.trim(), reply_to: f.reply_to.trim(), footer_text: f.footer_text.trim() });
      toast.success(t("saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  return (
    <div className="max-w-2xl space-y-5">
      <EmailNotice t={t} />
      <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
        <div className="space-y-1.5">
          <Label htmlFor="nr-from">{t("r_from")}</Label>
          <Input id="nr-from" value={f.from_name} maxLength={100} placeholder={brand.name} onChange={(e) => setF({ ...f, from_name: e.target.value })} />
          <p className="text-xs text-muted-foreground">{t("r_from_d")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nr-reply">{t("r_reply")}</Label>
          <Input id="nr-reply" type="email" value={f.reply_to} maxLength={200} onChange={(e) => setF({ ...f, reply_to: e.target.value })} aria-invalid={replyBad} />
          {replyBad ? <p className="text-xs text-destructive">{t("err_email")}</p> : <p className="text-xs text-muted-foreground">{t("r_reply_d")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nr-footer">{t("r_footer")}</Label>
          <Textarea id="nr-footer" rows={3} maxLength={600} value={f.footer_text} placeholder={t("r_footer_ph")} onChange={(e) => setF({ ...f, footer_text: e.target.value })} />
          <p className="text-xs text-muted-foreground">{t("r_footer_d")}</p>
        </div>
        <Button onClick={() => void submit()} disabled={saveRules.isPending || replyBad}>
          {saveRules.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("save")}
        </Button>
      </section>
    </div>
  );
}
