// =====================================================================================
// Admin > Clientes > Perguntas dos clientes (recurso product_questions). Uma página, sem janelas:
//   regras (clientes podem perguntar, estilo na página do produto, quantas por vez), números, filtros e busca,
//   e cada pergunta com a resposta escrita ali mesmo (responder e publicar, recusar, tirar do site, apagar).
// Dados: public.product_questions (migration 20261008120000_product_questions.sql), regras em store_settings.product_questions.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, MessageCircleQuestion, Pencil, Save, Search, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useFeature } from "@/hooks/useFeatures";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useProductQuestionsSettings, useSaveProductQuestionsSettings } from "@/hooks/useOfferSettings";
import { useAdminQuestions, useUpdateQuestion, type AdminQuestion } from "@/hooks/useProductQuestions";
import { useMessages } from "@/i18n";
import { productQuestionsMessages } from "@/i18n/productQuestions";
import { ANSWER_MAX, DEFAULT_PRODUCT_QUESTIONS, type ProductQuestionsSettings, type QuestionsStyle } from "@/lib/productQuestions";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
type Filter = "pending" | "published" | "rejected" | "all";

export default function AdminProductQuestions() {
  const { t } = useMessages(productQuestionsMessages);
  return (
    <div className="space-y-5">
      <AdminHelp id="product-questions" title={t("a_help_title")} steps={[t("a_help_1"), t("a_help_2"), t("a_help_3")]} />
      <RulesCard />
      <QuestionList />
    </div>
  );
}

function RulesCard() {
  const { t } = useMessages(productQuestionsMessages);
  const on = useFeature("product_questions");
  const { data: saved, isLoading } = useProductQuestionsSettings();
  const save = useSaveProductQuestionsSettings();
  const [form, setForm] = useState<ProductQuestionsSettings>(DEFAULT_PRODUCT_QUESTIONS);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && JSON.stringify(saved) !== JSON.stringify(form);
  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>;
  const styles: { value: QuestionsStyle; label: string; text: string }[] = [
    { value: "full", label: t("a_style_full"), text: t("a_style_full_d") },
    { value: "discreet", label: t("a_style_discreet"), text: t("a_style_discreet_d") },
  ];
  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">{t("a_settings")}</h2>
      {!on && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />{t("a_feature_off")}
          <Link to={adminHref.section("features")} className="font-semibold underline">{t("a_feature_link")}</Link>
        </p>
      )}
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="flex items-center text-sm font-semibold">{t("a_ask")}<HelpTip label={t("a_help")} text={t("a_ask_h")} /></span>
          <span className="block text-xs text-muted-foreground">{t("a_ask_h")}</span>
        </span>
        <Switch checked={form.ask} onCheckedChange={(v) => setForm((f) => ({ ...f, ask: v }))} aria-label={t("a_ask")} />
      </label>
      <fieldset>
        <legend className="flex items-center text-sm font-semibold">{t("a_style")}<HelpTip label={t("a_help")} text={t("a_style_h")} /></legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {styles.map((o) => (
            <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 transition-colors duration-150", form.style === o.value ? "border-primary bg-accent" : "hover:border-foreground/30")}>
              <input type="radio" name="pq-style" checked={form.style === o.value} onChange={() => setForm((f) => ({ ...f, style: o.value }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
              <span><span className="block text-sm font-semibold">{o.label}</span><span className="block text-xs text-muted-foreground">{o.text}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="pq-per-page" className="flex items-center text-sm font-semibold">{t("a_per_page")}<HelpTip label={t("a_help")} text={t("a_per_page_h")} /></label>
        <Input id="pq-per-page" type="number" min={1} max={20} step={1} value={form.perPage} className="mt-1.5 max-w-[120px]"
          onChange={(e) => setForm((f) => ({ ...f, perPage: Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))) }))} />
        <p className="mt-1 text-xs text-muted-foreground">{t("a_per_page_h")}</p>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate(form, { onSuccess: () => toast.success(t("a_saved")), onError: () => toast.error(t("a_save_error")) })} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("a_save")}
        </Button>
      </div>
    </section>
  );
}

function QuestionList() {
  const { t } = useMessages(productQuestionsMessages);
  const { data: rows = [], isLoading, error } = useAdminQuestions();
  const [filter, setFilter] = useState<Filter>("pending");
  const [q, setQ] = useState("");
  const count = (s: AdminQuestion["status"]) => rows.filter((r) => r.status === s).length;
  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    return rows.filter((r) => (filter === "all" || r.status === filter)
      && (!needle || norm(r.question).includes(needle) || norm(r.products?.name || "").includes(needle)));
  }, [rows, filter, q]);
  const paged = usePaged(filtered, 20);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("a_load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <AdminStatCard icon={MessageCircleQuestion} label={t("a_kpi_pending")} value={count("pending")} tone={count("pending") ? "warning" : "default"} active={filter === "pending"} onClick={() => setFilter("pending")} />
        <AdminStatCard icon={CheckCircle2} label={t("a_kpi_published")} value={count("published")} tone="success" active={filter === "published"} onClick={() => setFilter("published")} />
        <AdminStatCard icon={XCircle} label={t("a_kpi_rejected")} value={count("rejected")} active={filter === "rejected"} onClick={() => setFilter("rejected")} />
      </div>
      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter> label={t("a_kpi_pending")} value={filter} onChange={setFilter} options={[
          { value: "pending", label: t("f_pending"), count: count("pending"), tone: "warning" },
          { value: "published", label: t("f_published"), count: count("published") },
          { value: "rejected", label: t("f_rejected"), count: count("rejected") },
          { value: "all", label: t("f_all"), count: rows.length },
        ]} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("a_search")} aria-label={t("a_search")} className="pl-9" />
        </div>
      </div>
      {paged.items.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("a_empty")}</p>
      ) : (
        <ul className="space-y-3">{paged.items.map((r) => <QuestionItem key={r.id} row={r} />)}</ul>
      )}
      <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
    </div>
  );
}

function QuestionItem({ row }: { row: AdminQuestion }) {
  const { t } = useMessages(productQuestionsMessages);
  const { dateTime } = useAdminFormat();
  const update = useUpdateQuestion();
  const { ask, confirmSlot } = useInlineConfirm();
  const [answer, setAnswer] = useState(row.answer ?? "");
  useEffect(() => { setAnswer(row.answer ?? ""); }, [row.answer]);
  const clean = answer.trim();
  const changed = clean !== (row.answer ?? "");

  const run = async (patch: Parameters<typeof update.mutateAsync>[0]["patch"]) => {
    if (patch === "delete" && !(await ask(t("a_delete_confirm"), { tone: "danger", confirmLabel: t("a_delete") }))) return;
    try { await update.mutateAsync({ id: row.id, patch }); toast.success(t("a_done")); } catch { toast.error(t("a_error")); }
  };
  const tone = row.status === "pending" ? "bg-amber-50 text-amber-700" : row.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground";
  const statusLabel = row.status === "pending" ? t("f_pending") : row.status === "published" ? t("f_published") : t("f_rejected");
  const busy = update.isPending;

  return (
    <li className="rounded-[18px] border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
          {row.products?.image && <img src={row.products.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", tone)}>{statusLabel}</span>
            <Link to={adminHref.product(row.product_id)} className="font-medium text-foreground hover:text-brand-orange-text hover:underline">{row.products?.name || t("a_product")}</Link>
            <a href={`/produto/${row.product_id}#perguntas`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand-orange-text">
              {t("a_view_product")}<ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </p>
          <p className="mt-2 whitespace-pre-line break-words text-[15px] font-semibold">{row.question}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.author_name ? t("a_from", { name: row.author_name }) : t("a_from_unknown")} · {t("a_asked_at", { date: dateTime(row.created_at) })}
            {row.answered_at && <> · {t("a_answered_at", { date: dateTime(row.answered_at) })}</>}
            {row.locale && <> · {row.locale}</>}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor={`pq-${row.id}`} className="text-sm font-semibold">{t("a_answer")}</label>
        <Textarea id={`pq-${row.id}`} value={answer} rows={3} maxLength={ANSWER_MAX} placeholder={t("a_answer_placeholder")}
          onChange={(e) => setAnswer(e.target.value)} className="mt-1.5" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {row.status !== "published" ? (
          <Button size="sm" disabled={!clean || busy} onClick={() => void run({ answer: clean, status: "published" })}>
            <Send className="mr-1.5 h-4 w-4" />{t("a_publish")}
          </Button>
        ) : (
          <Button size="sm" disabled={!clean || !changed || busy} onClick={() => void run({ answer: clean })}>
            <Pencil className="mr-1.5 h-4 w-4" />{t("a_update")}
          </Button>
        )}
        {row.status === "published" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ status: "pending" })}><Undo2 className="mr-1.5 h-4 w-4" />{t("a_unpublish")}</Button>}
        {row.status === "pending" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ status: "rejected" })}><XCircle className="mr-1.5 h-4 w-4" />{t("a_reject")}</Button>}
        {row.status === "rejected" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ status: "pending" })}><Undo2 className="mr-1.5 h-4 w-4" />{t("a_restore")}</Button>}
        {row.status !== "published" && changed && clean && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ answer: clean })}><Save className="mr-1.5 h-4 w-4" />{t("a_save_draft")}</Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" disabled={busy} onClick={() => void run("delete")}>
          <Trash2 className="mr-1.5 h-4 w-4" />{t("a_delete")}
        </Button>
      </div>
      {confirmSlot}
    </li>
  );
}
