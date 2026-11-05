// =====================================================================================
// Página de um pop-up (Admin > Pop-ups > pop-up; /admin?tab=popups&ver=popup&id=<id>). Sem janelas:
//   Topo        nome, estado (rascunho, ativo, pausado), salvar, testar na loja, apagar; números (exibições,
//               contatos, conversão) e o que falta arrumar antes de ativar
//   Desenho     PopupBuilder (área de arrastar) + PopupInspector (adicionar, elemento, camadas, fundo e tamanho)
//   Exibição    PopupDisplay (posição na tela, modo discreto, gatilho, páginas, público, frequência, datas)
//   Envio       cupom, lista da newsletter, fechar sozinho e os contatos recebidos deste pop-up
// Desfazer e refazer guardam até 80 passos do desenho.
// =====================================================================================
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, BarChart3, CheckCircle2, ExternalLink, Eye, Inbox, Loader2, Mail, Paintbrush, Percent, RotateCcw, Save, Send, Ticket, Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminSubpage from "@/components/admin/AdminSubpage";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";
import { AdminStatCard } from "@/components/admin/AdminListKit";
import AdminHelp from "@/components/admin/AdminHelp";
import { Field, Group, NumberSlider, Segmented, SwitchRow, usePopupT } from "./fields";
import PopupBuilder, { type SetContent } from "./PopupBuilder";
import PopupInspector, { type InspectorTab } from "./PopupInspector";
import PopupDisplay from "./PopupDisplay";
import PopupLeadsList from "./PopupLeadsList";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  EMPTY_POPUP_STATS, useAdminPopups, useAdminPopupStats, useCouponExists, useDeletePopup, useResetPopupViews, useSavePopup, type PopupDraft,
} from "@/hooks/useLeadPopups";
import { BLOCKING, contentProblems, newId, PREVIEW_PARAM, type Device, type PopupContent, type PopupLocale, type StepId } from "@/lib/leadPopups";
import { useLocale } from "@/i18n";
import { cn } from "@/lib/utils";

type PageTab = "design" | "display" | "send";
const STATUS_TONE = { draft: "bg-muted text-muted-foreground", active: "bg-emerald-50 text-emerald-700", paused: "bg-amber-50 text-amber-800" } as const;

export function StatusChip({ status, label }: { status: keyof typeof STATUS_TONE; label: string }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>{label}</span>;
}

export default function PopupEditor({ id, onBack, tab, setTab }: { id: string; onBack: () => void; tab: string | null; setTab: (t: string) => void }) {
  const { t } = usePopupT();
  const fmt = useAdminFormat();
  const adminLocale = useLocale((s) => s.locale);
  const { data: popups = [], isLoading } = useAdminPopups();
  const { data: stats = {} } = useAdminPopupStats();
  const save = useSavePopup();
  const del = useDeletePopup();
  const resetViews = useResetPopupViews();
  const { ask, confirmSlot } = useInlineConfirm();
  const p = popups.find((x) => x.id === id);
  const st = stats[id] ?? EMPTY_POPUP_STATS;

  const [draft, setDraftState] = useState<PopupDraft | null>(null);
  const draftRef = useRef<PopupDraft | null>(null);
  const [saved, setSaved] = useState("");
  const past = useRef<PopupContent[]>([]);
  const future = useRef<PopupContent[]>([]);
  const lastCp = useRef(0);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const setDraft = useCallback((d: PopupDraft) => { draftRef.current = d; setDraftState(d); }, []);

  useEffect(() => {
    if (!p || draftRef.current) return;
    const d: PopupDraft = {
      name: p.name, status: p.status, content: p.content, rules: p.rules, priority: p.priority, starts_at: p.starts_at, ends_at: p.ends_at,
      coupon_code: p.coupon_code, save_newsletter: p.save_newsletter,
    };
    setDraft(d);
    setSaved(JSON.stringify(d));
  }, [p, setDraft]);

  const setContent: SetContent = useCallback((fn, opts) => {
    const d = draftRef.current;
    if (!d) return;
    const next = fn(d.content);
    const now = Date.now();
    const cp = opts?.checkpoint === true || (opts?.checkpoint !== false && now - lastCp.current > 800);
    if (cp) {
      past.current = [...past.current.slice(-79), d.content];
      future.current = [];
      lastCp.current = now;
    }
    if (next !== d.content) setDraft({ ...d, content: next });
    else if (cp) bump();
  }, [setDraft]);

  const undo = useCallback(() => {
    const d = draftRef.current;
    const prev = past.current[past.current.length - 1];
    if (!d || !prev) return;
    past.current = past.current.slice(0, -1);
    future.current = [d.content, ...future.current];
    lastCp.current = 0;
    setDraft({ ...d, content: prev });
  }, [setDraft]);
  const redo = useCallback(() => {
    const d = draftRef.current;
    const next = future.current[0];
    if (!d || !next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, d.content];
    lastCp.current = 0;
    setDraft({ ...d, content: next });
  }, [setDraft]);

  const [device, setDevice] = useState<Device>("desktop");
  const [step, setStep] = useState<StepId>("form");
  const [selected, setSelectedState] = useState<string | null>(null);
  const [inspector, setInspector] = useState<InspectorTab>("add");
  const [textLocale, setTextLocale] = useState<PopupLocale>(adminLocale);
  const [focusText, setFocusText] = useState(0);
  const setSelected = useCallback((sid: string | null) => {
    setSelectedState(sid);
    if (sid) setInspector((x) => (x === "layers" ? x : "element"));
  }, []);

  const dirty = !!draft && JSON.stringify(draft) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const { data: coupon } = useCouponExists(draft?.coupon_code);
  const problems = useMemo(() => (draft ? contentProblems(draft.content, draft.coupon_code) : []), [draft]);
  const blocking = problems.filter((x) => BLOCKING.includes(x.id));
  const pageTab: PageTab = tab === "display" || tab === "send" ? tab : "design";

  if (isLoading || (p && !draft)) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!p || !draft) {
    return (
      <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}>
        <p className="text-sm text-muted-foreground">{t("not_found_d")}</p>
      </AdminSubpage>
    );
  }

  const onDelete = (eid: string) => {
    setContent((c) => ({ ...c, [step]: { ...c[step], elements: c[step].elements.filter((e) => e.id !== eid) } }), { checkpoint: true });
    setSelectedState(null);
  };
  const onDuplicate = (eid: string) => {
    const nid = newId();
    setContent((c) => {
      const el = c[step].elements.find((e) => e.id === eid);
      if (!el) return c;
      const copy = { ...el, id: nid, name: el.name ? `${el.name} 2` : "", desktop: { ...el.desktop, x: el.desktop.x + 3, y: el.desktop.y + 3 }, mobile: { ...el.mobile, x: el.mobile.x + 3, y: el.mobile.y + 3 } };
      return { ...c, [step]: { ...c[step], elements: [...c[step].elements, copy] } };
    }, { checkpoint: true });
    setSelected(nid);
  };

  const doSave = async (patch: Partial<PopupDraft> = {}): Promise<boolean> => {
    const next = { ...draft, ...patch };
    if (!next.name.trim()) { toast.error(t("err_name")); return false; }
    if (next.status === "active" && blocking.length) {
      toast.error(t("err_cant_activate"));
      setTab("design");
      return false;
    }
    if (next.starts_at && next.ends_at && next.ends_at <= next.starts_at) { toast.error(t("err_dates")); return false; }
    try {
      await save.mutateAsync({ id, draft: next });
      setDraft(next);
      setSaved(JSON.stringify(next));
      toast.success(next.status === "active" ? t("saved_active") : t("saved"));
      return true;
    } catch {
      toast.error(t("save_error"));
      return false;
    }
  };

  const testOnSite = async () => {
    if (dirty && !(await doSave())) return;
    window.open(`/?${PREVIEW_PARAM}=${encodeURIComponent(id)}`, "_blank", "noopener");
  };

  const remove = async () => {
    if (!(await ask(t("delete_confirm", { name: draft.name }), { description: t("delete_d", { n: st.leads }), tone: "danger", confirmLabel: t("delete") }))) return;
    try {
      await del.mutateAsync(id);
      toast.success(t("deleted"));
      onBack();
    } catch {
      toast.error(t("save_error"));
    }
  };

  const conv = p.views ? Math.round((st.leads / p.views) * 1000) / 10 : 0;
  const showProblem = (pr: (typeof problems)[number]) => {
    setTab("design");
    if (pr.step) setStep(pr.step);
    if (pr.el) setSelected(pr.el);
  };

  return (
    <div data-popup-editor>
      <AdminSubpage
        title={draft.name || t("untitled")}
        subtitle={t("edited", { when: fmt.relative(p.updated_at) })}
        backLabel={t("back")}
        onBack={onBack}
        actions={
          <>
            <Segmented label={t("status")} size="sm" value={draft.status} onChange={(status) => setDraft({ ...draft, status })} options={[
              { value: "draft", label: t("status_draft") }, { value: "active", label: t("status_active") }, { value: "paused", label: t("status_paused") },
            ]} />
            <Button variant="outline" onClick={testOnSite} title={t("test_tip")}><ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("test")}</Button>
            <Button onClick={() => doSave()} disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              {dirty ? t("save") : t("saved_short")}
            </Button>
          </>
        }
      >
        {confirmSlot}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Field label={t("name")} tip={t("name_tip")} htmlFor="popup-name">
            <Input id="popup-name" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="max-w-xl" />
          </Field>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            {dirty && <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-50 px-3 text-xs font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{t("unsaved")}</span>}
            <StatusChip status={p.status} label={t("now_status", { s: t(`status_${p.status}`) })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminStatCard icon={Eye} label={t("stat_views")} value={p.views.toLocaleString(fmt.locale)} hint={t("stat_views_hint")} />
          <AdminStatCard icon={Inbox} label={t("stat_leads")} value={st.leads.toLocaleString(fmt.locale)} hint={st.week ? t("stat_week", { n: st.week }) : undefined} onClick={() => setTab("send")} />
          <AdminStatCard icon={Percent} label={t("stat_conv")} value={`${conv.toLocaleString(fmt.locale)}%`} hint={t("stat_conv_hint")} tone={conv >= 3 ? "success" : "default"} />
          <AdminStatCard icon={BarChart3} label={t("stat_last")} value={st.last ? fmt.relative(st.last) : <span className="text-base font-semibold text-muted-foreground sm:text-lg">{t("never")}</span>} />
        </div>
        {p.views > 0 && (
          <button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            onClick={async () => { if (await ask(t("reset_views_confirm"), { description: t("reset_views_d") })) resetViews.mutate(id); }}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{t("reset_views")}
          </button>
        )}

        {problems.length > 0 && (
          <div className={cn("space-y-1.5 rounded-2xl border p-3", blocking.length ? "border-destructive/30 bg-destructive/5" : "border-amber-200 bg-amber-50/70")}>
            <p className="flex items-center gap-1.5 text-sm font-bold"><AlertTriangle className="h-4 w-4" aria-hidden="true" />{blocking.length ? t("problems_blocking") : t("problems_warn")}</p>
            <ul className="space-y-1">
              {problems.slice(0, 8).map((pr, i) => (
                <li key={`${pr.id}-${pr.el ?? i}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", BLOCKING.includes(pr.id) ? "bg-destructive" : "bg-amber-500")} />
                  <span className="min-w-0 flex-1">{t(`problem_${pr.id}`)}{pr.step === "success" ? ` (${t("step_success")})` : ""}</span>
                  {(pr.el || pr.step) && <button type="button" onClick={() => showProblem(pr)} className="text-xs font-semibold text-brand-orange-text hover:underline">{t("show")}</button>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div role="tablist" aria-label={t("page_tabs")} className="flex flex-wrap gap-1 border-b">
          {([["design", Paintbrush, t("tab_design")], ["display", Eye, t("tab_display")], ["send", Send, `${t("tab_send")} (${st.leads})`]] as const).map(([v, I, label]) => (
            <button key={v} type="button" role="tab" aria-selected={pageTab === v} onClick={() => setTab(v)}
              className={cn("-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors duration-150",
                pageTab === v ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <I className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{label}
            </button>
          ))}
        </div>

        {pageTab === "design" && (
          <div className="space-y-4">
            <AdminHelp id="popup-builder" title={t("builder_help_title")} steps={[t("builder_help_1"), t("builder_help_2"), t("builder_help_3"), t("builder_help_4"), t("builder_help_5")]} />
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_350px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
              <PopupBuilder
                t={t} content={draft.content} setContent={setContent} device={device} setDevice={setDevice} step={step} setStep={setStep}
                selected={selected} setSelected={setSelected} locale={textLocale} setLocale={setTextLocale}
                undo={undo} redo={redo} canUndo={past.current.length > 0} canRedo={future.current.length > 0}
                onDelete={onDelete} onDuplicate={onDuplicate} previewCoupon={draft.coupon_code || "CUPOM10"}
                onEditText={(eid) => { setSelected(eid); setInspector("element"); setFocusText((n) => n + 1); }}
              />
              <div className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
                <PopupInspector
                  t={t} tab={inspector} setTab={setInspector} content={draft.content} setContent={setContent} step={step} device={device}
                  locale={textLocale} selected={selected} setSelected={setSelected} onDelete={onDelete} onDuplicate={onDuplicate}
                  focusText={focusText} couponCode={draft.coupon_code ?? ""}
                />
              </div>
            </div>
          </div>
        )}

        {pageTab === "display" && (
          <PopupDisplay
            t={t} content={draft.content} setContent={setContent} rules={draft.rules} setRules={(rules) => setDraft({ ...draft, rules })}
            startsAt={draft.starts_at} endsAt={draft.ends_at} setDates={(starts_at, ends_at) => setDraft({ ...draft, starts_at, ends_at })}
            priority={draft.priority} setPriority={(priority) => setDraft({ ...draft, priority })} locale={textLocale}
          />
        )}

        {pageTab === "send" && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Group title={t("g_coupon")} tip={t("g_coupon_tip")} icon={Ticket}>
                <Field label={t("coupon_code")} hint={t("coupon_code_hint")} htmlFor="popup-coupon">
                  <Input id="popup-coupon" value={draft.coupon_code ?? ""} maxLength={60} placeholder="BEMVINDO10"
                    onChange={(e) => setDraft({ ...draft, coupon_code: e.target.value.toUpperCase().replace(/\s/g, "") || null })} className="max-w-xs font-mono uppercase" />
                </Field>
                {draft.coupon_code && coupon && (
                  <p className={cn("flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-2 text-xs", coupon.exists && coupon.active ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
                    {coupon.exists && coupon.active ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                    {coupon.exists ? (coupon.active ? t("coupon_ok") : t("coupon_inactive")) : t("coupon_missing")}
                    {!(coupon.exists && coupon.active) && <Link to="/admin/cupons/novo" className="font-semibold underline underline-offset-2">{t("coupon_create")}</Link>}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{t("coupon_where")}</p>
              </Group>
              <Group title={t("g_after")} tip={t("g_after_tip")} icon={Mail}>
                <SwitchRow label={t("save_newsletter")} hint={t("save_newsletter_d")} checked={draft.save_newsletter} onChange={(save_newsletter) => setDraft({ ...draft, save_newsletter })} />
                {draft.save_newsletter && !draft.content.form.elements.some((e) => e.type === "consent") && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("newsletter_needs_consent")}</p>
                )}
                <NumberSlider label={t("auto_close")} tip={t("auto_close_tip")} value={draft.content.successAutoClose} min={0} max={60}
                  onChange={(successAutoClose) => setContent((c) => ({ ...c, successAutoClose }))} suffix="s" />
                <p className="text-xs text-muted-foreground">{t("emails_off")}</p>
              </Group>
            </div>
            <h3 className="pt-2 text-base font-bold">{t("leads_title")}</h3>
            <PopupLeadsList t={t} popupId={id} />
          </div>
        )}

        <div className="flex justify-end border-t pt-4">
          <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("delete_popup")}
          </Button>
        </div>
      </AdminSubpage>
    </div>
  );
}
