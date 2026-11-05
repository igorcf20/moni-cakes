// =====================================================================================
// Admin > Aparência da loja > Pop-ups (recurso lead_popups). Sem janelas:
//   Lista      números (ativos, exibições, contatos, conversão), filtros, cada pop-up com a miniatura do desenho
//   Novo       escolha de um modelo (Lista VIP com os textos do antigo Modal VIP, só imagem + campo + botão, canto
//              discreto, anúncio com botão, em branco): o pop-up nasce como rascunho e abre a página dele
//   Contatos   todos os contatos recebidos (aba=contatos), com planilha
//   pop-up     src/components/admin/popups/PopupEditor.tsx (ver=popup&id=<id>)
// Regras em src/lib/leadPopups.ts; dados em src/hooks/useLeadPopups.ts; textos em src/i18n/adminPopups.ts.
// =====================================================================================
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Eye, Inbox, LayoutTemplate, Loader2, Megaphone, Percent, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminHelp from "./AdminHelp";
import { useAdminPage } from "./AdminSubpage";
import { AdminStatCard, FilterChips } from "./AdminListKit";
import PopupCanvas from "@/components/popups/PopupCanvas";
import PopupEditor, { StatusChip } from "./popups/PopupEditor";
import PopupLeadsList from "./popups/PopupLeadsList";
import { usePopupT, type PT } from "./popups/fields";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import { EMPTY_POPUP_STATS, useAdminPopups, useAdminPopupStats, useSavePopup } from "@/hooks/useLeadPopups";
import { templateContent, TEMPLATE_IDS, type LeadPopup, type PopupContent, type PopupStatus, type TemplateId } from "@/lib/leadPopups";
import { useLocale } from "@/i18n";
import { cn } from "@/lib/utils";

export default function AdminPopups() {
  const page = useAdminPage();
  if (page.view === "popup" && page.id) {
    return <PopupEditor id={page.id} onBack={page.close} tab={page.tab} setTab={page.setTab} />;
  }
  return <PopupList onOpen={(id) => page.open("popup", id)} tab={page.tab} setTab={page.setTab} />;
}

/** Miniatura do desenho, reduzida para caber na caixa. */
export function PopupThumb({ content, box = 120, className }: { content: PopupContent; box?: number; className?: string }) {
  const locale = useLocale((s) => s.locale);
  const { t } = usePopupT();
  const size = content.size.desktop;
  const k = Math.min(box / size.w, box / size.h);
  return (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl bg-muted/60", className)} style={{ width: box, height: box }} aria-hidden="true">
      <div style={{ width: size.w * k, height: size.h * k }}>
        <div style={{ width: size.w, height: size.h, transform: `scale(${k})`, transformOrigin: "top left" }}>
          <PopupCanvas content={content} step="form" device="desktop" locale={locale} mode="thumb" closeLabel={t("close_btn")} privacyLabel={t("privacy_link_text")} className="pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

type ListFilter = "all" | PopupStatus;

function triggerSummary(t: PT, p: LeadPopup): string {
  const r = p.rules;
  const when = r.trigger === "delay" ? t("sum_delay", { n: r.delay }) : r.trigger === "scroll" ? t("sum_scroll", { n: r.scroll })
    : r.trigger === "exit" ? t("sum_exit") : t("sum_immediate");
  return [when, t(`pages_${r.pages}`), t(`freq_${r.frequency}`)].join(" · ");
}

function PopupList({ onOpen, tab, setTab }: { onOpen: (id: string) => void; tab: string | null; setTab: (t: string) => void }) {
  const { t } = usePopupT();
  const fmt = useAdminFormat();
  const { data: popups = [], isLoading, error } = useAdminPopups();
  const { data: stats = {} } = useAdminPopupStats();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const view = tab === "contatos" ? "leads" : "popups";

  const totals = useMemo(() => {
    const views = popups.reduce((n, p) => n + p.views, 0);
    const leads = popups.reduce((n, p) => n + (stats[p.id]?.leads ?? 0), 0);
    const week = popups.reduce((n, p) => n + (stats[p.id]?.week ?? 0), 0);
    return { views, leads, week, conv: views ? Math.round((leads / views) * 1000) / 10 : 0 };
  }, [popups, stats]);

  const help = <AdminHelp id="popups" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />;
  if (isLoading) return <div className="space-y-5">{help}<p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p></div>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  const count = (s: PopupStatus) => popups.filter((p) => p.status === s).length;
  const s = q.trim().toLowerCase();
  const shown = popups.filter((p) => (filter === "all" || p.status === filter) && (!s || p.name.toLowerCase().includes(s)));

  return (
    <div className="space-y-5">
      {help}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Megaphone} label={t("stat_active")} value={count("active")} onClick={() => { setTab("popups"); setFilter("active"); }} active={view === "popups" && filter === "active"} />
        <AdminStatCard icon={Eye} label={t("stat_views")} value={totals.views.toLocaleString(fmt.locale)} />
        <AdminStatCard icon={Inbox} label={t("stat_leads")} value={totals.leads.toLocaleString(fmt.locale)} hint={totals.week ? t("stat_week", { n: totals.week }) : undefined} onClick={() => setTab("contatos")} active={view === "leads"} />
        <AdminStatCard icon={Percent} label={t("stat_conv")} value={`${totals.conv.toLocaleString(fmt.locale)}%`} hint={t("stat_conv_hint")} />
      </div>

      <div role="tablist" aria-label={t("page_tabs")} className="flex flex-wrap gap-1 border-b">
        {([["popups", LayoutTemplate, t("list_tab_popups", { n: popups.length })], ["contatos", Inbox, t("list_tab_leads", { n: totals.leads })]] as const).map(([v, I, label]) => {
          const on = (v === "contatos") === (view === "leads");
          return (
            <button key={v} type="button" role="tab" aria-selected={on} onClick={() => setTab(v)}
              className={cn("-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors duration-150", on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <I className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{label}
            </button>
          );
        })}
      </div>

      {view === "leads" ? <PopupLeadsList t={t} popupId={null} popups={popups.map((p) => ({ id: p.id, name: p.name }))} /> : (
        <>
          {(picking || !popups.length) && <TemplatePicker t={t} onCreated={onOpen} onCancel={popups.length ? () => setPicking(false) : undefined} />}
          {popups.length > 0 && (
            <>
              <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <FilterChips<ListFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
                    { value: "all", label: t("f_all"), count: popups.length },
                    { value: "active", label: t("status_active"), count: count("active") },
                    { value: "draft", label: t("status_draft"), count: count("draft") },
                    { value: "paused", label: t("status_paused"), count: count("paused") },
                  ]} />
                  {!picking && <Button onClick={() => setPicking(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("new")}</Button>}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
                </div>
              </div>
              {shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("none_match")}</p> : (
                <ul className="space-y-3">
                  {shown.map((p) => {
                    const st = stats[p.id] ?? EMPTY_POPUP_STATS;
                    const conv = p.views ? Math.round((st.leads / p.views) * 1000) / 10 : 0;
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => onOpen(p.id)} className="flex w-full items-center gap-4 rounded-[18px] border bg-card p-3 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <PopupThumb content={p.content} box={96} />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-semibold">{p.name}</span>
                              <StatusChip status={p.status} label={t(`status_${p.status}`)} />
                            </span>
                            <span className="mt-0.5 block text-sm text-muted-foreground">{triggerSummary(t, p)}</span>
                            <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                              <span>{t("row_views", { n: p.views.toLocaleString(fmt.locale) })}</span>
                              <span>{t("row_leads", { n: st.leads.toLocaleString(fmt.locale) })}</span>
                              <span>{t("row_conv", { n: conv.toLocaleString(fmt.locale) })}</span>
                              <span>{t("edited", { when: fmt.relative(p.updated_at) })}</span>
                            </span>
                          </span>
                          <ChevronRight className="hidden h-4 w-4 shrink-0 text-brand-orange-text sm:block" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function TemplatePicker({ t, onCreated, onCancel }: { t: PT; onCreated: (id: string) => void; onCancel?: () => void }) {
  const save = useSavePopup();
  const { data: visual } = useVisualSettings();
  const legacy = visual?.broadcast_modal ?? null;
  const [busy, setBusy] = useState<TemplateId | null>(null);
  const previews = useMemo(() => Object.fromEntries(TEMPLATE_IDS.map((id) => [id, templateContent(id, legacy)])), [legacy]);

  const create = async (id: TemplateId) => {
    setBusy(id);
    try {
      const tpl = templateContent(id, legacy);
      const newId = await save.mutateAsync({
        id: null,
        draft: {
          name: t(`tpl_${id}`), status: "draft", content: tpl.content, rules: tpl.rules, priority: 0, starts_at: null, ends_at: null,
          coupon_code: tpl.coupon || null, save_newsletter: true,
        },
      });
      onCreated(newId);
    } catch {
      toast.error(t("save_error"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 rounded-[20px] border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">{t("tpl_title")}</h3>
          <p className="text-sm text-muted-foreground">{t("tpl_d")}</p>
        </div>
        {onCancel && <button type="button" onClick={onCancel} aria-label={t("cancel")} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button>}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1500px]:grid-cols-5">
        {TEMPLATE_IDS.map((id) => (
          <li key={id}>
            <button type="button" onClick={() => create(id)} disabled={!!busy}
              className="group flex h-full w-full flex-col gap-2 rounded-2xl border bg-background/60 p-3 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              <PopupThumb content={previews[id].content} box={150} className="mx-auto w-full" />
              <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
                {busy === id && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {t(`tpl_${id}`)}
                {id === "vip" && legacy?.title && <span className="whitespace-nowrap rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-orange-text">{t("tpl_from_old")}</span>}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">{t(`tpl_${id}_d`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
