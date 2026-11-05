// =====================================================================================
// Admin > Vendas > Orçamentos (recurso quotes em Admin > Recursos da loja). Sem janelas:
//   Pedidos     números (novos, à espera do cliente, aceitos, convertidos em pedido), filtros, busca e lista
//   orcamento   (ver=orcamento&id=<id>) dados do cliente e da empresa, itens com quantidade e preço da proposta
//               (atalho de desconto sobre a tabela), validade, mensagem; enviar ou atualizar a proposta, recusar o
//               pedido, nota interna, pedido gerado e apagar
//   Regras      validade padrão, botões na página do produto e no carrinho, mínimo de unidades
// Regras no banco (migration 20261007150000_quotes.sql: admin_quote_send, admin_quote_reject); o preço entra no
// pedido só pelo servidor (_shared/pricing.ts). Contas em src/lib/quotes.ts; dados em src/hooks/useQuotes.ts;
// textos em src/i18n/adminQuotes.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, ClipboardList, Clock, ExternalLink, Inbox, Loader2, Package, Search, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminQuotesMessages } from "@/i18n/adminQuotes";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  useAdminQuoteReject, useAdminQuoteSend, useAdminQuotes, useDeleteQuote, useQuoteSettings, useSaveQuoteNote, useSaveQuoteSettings,
} from "@/hooks/useQuotes";
import { addDaysISO, discounted, quoteErrorOf, quoteRef, quoteTotals, quoteView, QUOTE_PATH, type QuoteSettings, type QuoteView } from "@/lib/quotes";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminQuotesMessages["pt-BR"]>>["t"];
const PAGE_SIZE = 25;

const Loading = ({ t }: { t: T }) => (
  <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
);
const LoadError = ({ t }: { t: T }) => (
  <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>
);
const ADMIN_ERRORS = new Set(["forbidden", "not_found", "ordered", "invalid", "empty", "missing_price"]);
const errText = (t: T, e: unknown) => {
  const code = quoteErrorOf((e as Error)?.message);
  return t(ADMIN_ERRORS.has(code) ? (`err_${code}` as "err_forbidden") : "err_unknown");
};
const numInput = (raw: string) => Number(raw.replace(",", ".").replace(/[^\d.]/g, "")) || 0;

const TONE: Record<QuoteView, string> = {
  new: "bg-primary/10 text-brand-orange-text",
  sent: "bg-amber-50 text-amber-800",
  accepted: "bg-sky-50 text-sky-800",
  ordered: "bg-emerald-50 text-emerald-700",
  declined: "bg-muted text-muted-foreground",
  rejected: "bg-rose-50 text-rose-700",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};
function StatusChip({ t, view }: { t: T; view: QuoteView }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", TONE[view])}>{t(`st_${view}`)}</span>;
}

export default function AdminQuotes() {
  const { t } = useMessages(adminQuotesMessages);
  const page = useAdminPage();
  const tab = page.tab === "regras" ? "regras" : "pedidos";
  if (page.view === "orcamento" && page.id) return <QuotePage id={page.id} onBack={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="quotes" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="pedidos" className="px-4">{t("tab_requests")}</TabsTrigger>
          <TabsTrigger value="regras" className="px-4">{t("tab_rules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="pedidos" className="mt-5"><QuoteList onOpen={(id) => page.open("orcamento", id)} /></TabsContent>
        <TabsContent value="regras" className="mt-5"><Rules /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Pedidos ---------- */

type ListFilter = "open" | "new" | "sent" | "accepted" | "ordered" | "closed" | "all";
const CLOSED: QuoteView[] = ["declined", "rejected", "cancelled", "expired"];

function QuoteList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminQuotesMessages);
  const fmt = useAdminFormat();
  const { data: list = [], isLoading, error } = useAdminQuotes();
  const [filter, setFilter] = useState<ListFilter>("open");
  const [q, setQ] = useState("");
  const [pg, setPg] = useState(1);
  const rows = useMemo(() => list.map((x) => ({ q: x, view: quoteView(x), totals: quoteTotals(x.items) })), [list]);
  useEffect(() => setPg(1), [filter, q]);

  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;
  if (!list.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
        <ClipboardList className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">{t("empty_all")}</p>
        <a href={`${siteUrl()}${QUOTE_PATH}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-orange-text hover:underline">
          {t("open_page")}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    );
  }

  const count = (v: QuoteView[]) => rows.filter((r) => v.includes(r.view)).length;
  const ordered = rows.filter((r) => r.view === "ordered");
  const converted = ordered.reduce((s, r) => s + (r.totals.offer ?? 0), 0);
  const match = (view: QuoteView) => {
    if (filter === "all") return true;
    if (filter === "open") return ["new", "sent", "accepted"].includes(view);
    if (filter === "closed") return CLOSED.includes(view);
    return view === filter;
  };
  const s = q.trim().toLowerCase();
  const shown = rows.filter((r) => match(r.view) && (!s || quoteRef(r.q.number).toLowerCase().includes(s) || String(r.q.number).includes(s)
    || (r.q.company ?? "").toLowerCase().includes(s) || r.q.contact_name.toLowerCase().includes(s) || (r.q.email ?? "").toLowerCase().includes(s)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageRows = shown.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Inbox} label={t("stat_new")} value={count(["new"])} tone={count(["new"]) > 0 ? "warning" : "default"}
          hint={t("stat_new_d")} onClick={() => setFilter("new")} active={filter === "new"} />
        <AdminStatCard icon={Clock} label={t("stat_sent")} value={count(["sent"])} hint={t("stat_sent_d")}
          onClick={() => setFilter("sent")} active={filter === "sent"} />
        <AdminStatCard icon={CheckCircle2} label={t("stat_accepted")} value={count(["accepted"])} hint={t("stat_accepted_d")}
          onClick={() => setFilter("accepted")} active={filter === "accepted"} />
        <AdminStatCard icon={Package} label={t("stat_ordered")} value={fmt.money(converted)} tone="success"
          hint={ordered.length === 1 ? t("stat_ordered_one") : t("stat_ordered_d", { n: ordered.length })}
          onClick={() => setFilter("ordered")} active={filter === "ordered"} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<ListFilter> label={t("f_label")} value={filter} onChange={setFilter} options={[
          { value: "open", label: t("f_open"), count: count(["new", "sent", "accepted"]) },
          { value: "new", label: t("f_new"), count: count(["new"]), tone: "warning" },
          { value: "sent", label: t("f_sent"), count: count(["sent"]) },
          { value: "accepted", label: t("f_accepted"), count: count(["accepted"]) },
          { value: "ordered", label: t("f_ordered"), count: ordered.length },
          { value: "closed", label: t("f_closed"), count: count(CLOSED) },
          { value: "all", label: t("f_all"), count: rows.length },
        ]} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
        </div>
      </div>

      {shown.length === 0 ? <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("none_match")}</p> : (
        <>
          <ul className="space-y-3">
            {pageRows.map(({ q: x, view, totals }) => (
              <li key={x.id}>
                <button type="button" onClick={() => onOpen(x.id)} className="flex w-full flex-col gap-3 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand-orange-text"><ClipboardList className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold">{quoteRef(x.number)}</span>
                        <span className="truncate font-semibold">{x.company || x.contact_name}</span>
                        <StatusChip t={t} view={view} />
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {[x.company ? x.contact_name : x.email, x.items.length === 1 ? t("items_one") : t("items_n", { n: x.items.length }), t("units_n", { n: totals.units }),
                          fmt.relative(x.created_at)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-4 self-end sm:self-auto">
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{fmt.money(totals.offer ?? totals.list)}</span>
                      <span className="block text-xs text-muted-foreground">{totals.offer != null ? t("row_offer") : t("row_list")}</span>
                    </span>
                    <ChevronRight className="hidden h-4 w-4 text-brand-orange-text sm:block" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <AdminPager page={pg} pages={pages} total={shown.length} from={(pg - 1) * PAGE_SIZE + 1} to={Math.min(shown.length, pg * PAGE_SIZE)} onPage={setPg} />
        </>
      )}
    </div>
  );
}

/* ---------- Página do orçamento ---------- */

type Line = { id: string; quantity: number; price: string; remove: boolean };

function QuotePage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, locale } = useMessages(adminQuotesMessages);
  const fmt = useAdminFormat();
  const { data: list = [], isLoading } = useAdminQuotes();
  const { data: settings } = useQuoteSettings();
  const send = useAdminQuoteSend();
  const reject = useAdminQuoteReject();
  const saveNote = useSaveQuoteNote();
  const del = useDeleteQuote();
  const { ask, confirmSlot } = useInlineConfirm();
  const x = list.find((r) => r.id === id);
  const [lines, setLines] = useState<Line[]>([]);
  const [validUntil, setValidUntil] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [pct, setPct] = useState("");
  const [tried, setTried] = useState(false);

  // Recarrega o formulário só quando o orçamento muda no banco (não a cada nova leitura da lista).
  useEffect(() => {
    if (!x) return;
    setLines(x.items.map((i) => ({ id: i.id, quantity: i.quantity, price: i.unit_price != null ? String(i.unit_price) : "", remove: false })));
    setValidUntil(x.valid_until && x.valid_until >= addDaysISO(0) ? x.valid_until : addDaysISO(settings?.valid_days ?? 15));
    setMessage(x.store_message ?? "");
    setNote(x.admin_note ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x?.id, x?.updated_at, settings?.valid_days]);

  if (isLoading) return <Loading t={t} />;
  if (!x) return <AdminSubpage title={t("err_not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("load_error")}</p></AdminSubpage>;

  const view = quoteView(x);
  const locked = x.status === "ordered";
  const kept = lines.filter((l) => !l.remove);
  const draftItems = x.items.map((i) => {
    const l = lines.find((y) => y.id === i.id);
    return { ...i, quantity: l?.quantity ?? i.quantity, unit_price: l && l.price.trim() !== "" ? numInput(l.price) : null, remove: !!l?.remove };
  }).filter((i) => !i.remove);
  const totals = quoteTotals(draftItems);
  const missing = kept.some((l) => l.price.trim() === "" || !Number.isFinite(Number(l.price.replace(",", "."))));
  const badQty = kept.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 100000);
  const badDate = !validUntil || validUntil < addDaysISO(0);
  const setLine = (lid: string, patch: Partial<Line>) => setLines((p) => p.map((l) => (l.id === lid ? { ...l, ...patch } : l)));
  const applyPct = () => {
    const v = numInput(pct);
    setLines((p) => p.map((l) => {
      const i = x.items.find((y) => y.id === l.id)!;
      return { ...l, price: String(discounted(i.list_price, v)) };
    }));
  };
  const useTargets = () => setLines((p) => p.map((l) => {
    const i = x.items.find((y) => y.id === l.id)!;
    return i.target_price != null ? { ...l, price: String(i.target_price) } : l;
  }));

  const submit = async () => {
    setTried(true);
    if (!kept.length || missing || badQty || badDate) return;
    try {
      await send.mutateAsync({
        id: x.id, validUntil, message,
        items: lines.map((l) => ({ id: l.id, quantity: l.quantity, unit_price: l.remove ? 0 : numInput(l.price), ...(l.remove ? { remove: true } : {}) })),
      });
      toast.success(x.status === "new" ? t("sent_toast") : t("updated_toast"));
    } catch (e) {
      toast.error(errText(t, e));
    }
  };
  const doReject = async () => {
    if (!(await ask(t("reject_confirm", { ref: quoteRef(x.number) }), { description: t("reject_d"), confirmLabel: t("reject"), tone: "danger" }))) return;
    try {
      await reject.mutateAsync({ id: x.id, message });
      toast.success(t("rejected_toast"));
    } catch (e) {
      toast.error(errText(t, e));
    }
  };
  const remove = async () => {
    if (!(await ask(t("delete_confirm", { ref: quoteRef(x.number) }), { description: t("delete_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await del.mutateAsync(x.id);
      toast.success(t("deleted"));
      onBack();
    } catch (e) {
      toast.error(errText(t, e));
    }
  };
  const submitNote = async () => {
    try {
      await saveNote.mutateAsync({ id: x.id, note: note.trim() });
      toast.success(t("note_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };

  const facts: [string, string | null][] = [
    [t("c_company"), x.company], [t("c_contact"), x.contact_name], [t("c_email"), x.email], [t("c_phone"), x.phone],
    [t("c_tax_id"), x.tax_id], [t("c_country"), x.country],
  ];
  const timeline: [string, string | null][] = [[t("h_created"), x.created_at], [t("h_sent"), x.sent_at], [t("h_decided"), x.decided_at]];

  return (
    <AdminSubpage
      title={`${quoteRef(x.number)} · ${x.company || x.contact_name}`}
      subtitle={[t(`st_${view}`), t("requested", { when: fmt.dateTime(x.created_at) })].join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={!locked && (
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>
      )}
    >
      {confirmSlot}

      {locked && x.order_id && (
        <Link to={adminHref.order(x.order_id)} className="flex items-center justify-between gap-3 rounded-[18px] border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 transition-colors duration-150 hover:border-emerald-400">
          <span className="flex items-center gap-2"><Package className="h-4 w-4" aria-hidden="true" />{t("ordered_banner")}</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {/* Itens e preços da proposta */}
          <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
            <div>
              <h4 className="font-semibold">{t("items_title")}</h4>
              <p className="text-sm text-muted-foreground">{locked ? t("items_locked") : t("items_d")}</p>
            </div>
            {!locked && (
              <div className="flex flex-wrap items-end gap-2 rounded-xl bg-muted/50 p-3">
                <div className="space-y-1">
                  <Label htmlFor="q-pct" className="text-xs">{t("pct_label")}</Label>
                  <Input id="q-pct" inputMode="decimal" className="h-10 w-24" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="10" />
                </div>
                <Button type="button" variant="outline" size="sm" className="h-10" onClick={applyPct} disabled={!pct.trim()}>{t("pct_apply")}</Button>
                {x.items.some((i) => i.target_price != null) && <Button type="button" variant="ghost" size="sm" className="h-10" onClick={useTargets}>{t("use_targets")}</Button>}
              </div>
            )}
            <ul className="divide-y rounded-xl border">
              {x.items.map((i) => {
                const l = lines.find((y) => y.id === i.id);
                if (!l) return null;
                const priceBad = tried && !l.remove && (l.price.trim() === "" || !Number.isFinite(Number(l.price.replace(",", "."))));
                const qtyBad = tried && !l.remove && (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 100000);
                return (
                  <li key={i.id} className={cn("flex flex-col gap-3 p-3 sm:flex-row sm:items-center", l.remove && "opacity-50")}>
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {i.image ? <img src={i.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted"><Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" /></span>}
                      <div className="min-w-0">
                        <Link to={adminHref.product(i.product_id)} className={cn("font-medium hover:underline", l.remove && "line-through")}>{i.name}</Link>
                        <p className="text-xs text-muted-foreground">
                          {[i.variation_name, i.size_label, t("list_price", { v: fmt.money(i.list_price) }), i.target_price != null ? t("target_price", { v: fmt.money(i.target_price) }) : null].filter(Boolean).join(" · ")}
                        </p>
                        {i.note && <p className="mt-0.5 text-xs text-muted-foreground">{t("item_note")}: {i.note}</p>}
                      </div>
                    </div>
                    {locked ? (
                      <p className="text-right text-sm tabular-nums">{i.quantity} x <span className="font-semibold">{fmt.money(Number(i.unit_price))}</span></p>
                    ) : (
                      <div className="flex items-end gap-2 self-end sm:self-auto">
                        <div className="space-y-1">
                          <Label htmlFor={`qq-${i.id}`} className="text-xs">{t("qty")}</Label>
                          <Input id={`qq-${i.id}`} inputMode="numeric" className="h-10 w-20" value={String(l.quantity)} disabled={l.remove} aria-invalid={qtyBad}
                            onChange={(e) => setLine(i.id, { quantity: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`qp-${i.id}`} className="text-xs">{t("unit_price")} ({fmt.currency})</Label>
                          <Input id={`qp-${i.id}`} inputMode="decimal" className="h-10 w-28" value={l.price} disabled={l.remove} aria-invalid={priceBad}
                            onChange={(e) => setLine(i.id, { price: e.target.value.replace(/[^\d.,]/g, "") })} />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => setLine(i.id, { remove: !l.remove })}
                          aria-label={l.remove ? t("restore_item") : t("remove_item")} title={l.remove ? t("restore_item") : t("remove_item")}>
                          {l.remove ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3 text-sm">
              <span className="text-muted-foreground">{t("total_list")}: <span className="tabular-nums">{fmt.money(totals.list)}</span>{totals.saving > 0 && <span className="ml-2 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-brand-orange-text">{t("saving", { pct: totals.saving.toLocaleString(locale) })}</span>}</span>
              <span className="text-right"><span className="block text-xs text-muted-foreground">{t("total_offer")}</span><span className="text-xl font-bold tabular-nums">{totals.offer != null ? fmt.money(totals.offer) : "-"}</span></span>
            </div>
            <p className="text-xs text-muted-foreground">{t("money_note")}</p>
          </section>

          {/* Validade, mensagem e envio */}
          {!locked && (
            <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
              <h4 className="font-semibold">{t("offer_title")}</h4>
              <div className="space-y-1.5">
                <Label htmlFor="q-valid">{t("valid_until")}</Label>
                <Input id="q-valid" type="date" className="max-w-[200px]" min={addDaysISO(0)} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} aria-invalid={tried && badDate} />
                {tried && badDate ? <p className="text-xs text-destructive">{t("err_date")}</p> : <p className="text-xs text-muted-foreground">{t("valid_until_d")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-msg">{t("message")}</Label>
                <Textarea id="q-msg" rows={4} maxLength={3000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("message_ph")} />
                <p className="text-xs text-muted-foreground">{t("message_d")}</p>
              </div>
              {tried && (missing || badQty || !kept.length) && <p className="text-sm text-destructive" role="alert">{!kept.length ? t("err_empty") : missing ? t("err_missing_price") : t("err_qty")}</p>}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {["new", "sent", "accepted"].includes(x.status) && (
                  <Button variant="outline" onClick={() => void doReject()} disabled={reject.isPending} className="text-destructive hover:text-destructive">{t("reject")}</Button>
                )}
                <Button onClick={() => void submit()} disabled={send.isPending}>
                  {send.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  {x.status === "new" ? t("send") : t("resend")}
                </Button>
              </div>
              {x.status !== "new" && <p className="text-xs text-muted-foreground">{t("resend_d")}</p>}
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="space-y-3 rounded-[18px] border bg-card p-4">
            <h4 className="font-semibold">{t("customer_title")}</h4>
            <dl className="space-y-2 text-sm">
              {facts.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words font-medium">{v}</dd></div>
              ))}
            </dl>
            <Link to={adminHref.customer(x.user_id)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-orange-text hover:underline">{t("open_customer")}<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
            {x.message && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">{t("customer_message")}</p>
                <p className="whitespace-pre-line text-sm">{x.message}</p>
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-[18px] border bg-card p-4">
            <h4 className="font-semibold">{t("history_title")}</h4>
            <ul className="space-y-1.5 text-sm">
              {timeline.filter(([, v]) => v).map(([k, v]) => <li key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="tabular-nums">{fmt.dateTime(v!)}</span></li>)}
              {x.valid_until && <li className="flex justify-between gap-3"><span className="text-muted-foreground">{t("h_valid")}</span><span className="tabular-nums">{fmt.date(`${x.valid_until}T12:00:00`)}</span></li>}
            </ul>
          </section>

          <section className="space-y-2 rounded-[18px] border bg-card p-4">
            <Label htmlFor="q-note" className="font-semibold">{t("note_title")}</Label>
            <Textarea id="q-note" rows={3} maxLength={3000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("note_ph")} />
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => void submitNote()} disabled={saveNote.isPending || note.trim() === (x.admin_note ?? "")}>{t("save")}</Button>
            </div>
          </section>
        </aside>
      </div>
    </AdminSubpage>
  );
}

/* ---------- Regras ---------- */

function Rules() {
  const { t } = useMessages(adminQuotesMessages);
  const { data, isLoading } = useQuoteSettings();
  const save = useSaveQuoteSettings();
  const [f, setF] = useState<QuoteSettings | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  if (isLoading || !f) return <Loading t={t} />;
  const badDays = !Number.isInteger(f.valid_days) || f.valid_days < 1 || f.valid_days > 365;
  const badMin = !Number.isInteger(f.min_quantity) || f.min_quantity < 1 || f.min_quantity > 100000;
  const submit = async () => {
    if (badDays || badMin) return;
    try {
      await save.mutateAsync(f);
      toast.success(t("rules_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
      <h4 className="font-semibold">{t("rules_title")}</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="qr-days">{t("r_days")}</Label>
          <Input id="qr-days" inputMode="numeric" className="max-w-[140px]" value={String(f.valid_days)}
            onChange={(e) => setF({ ...f, valid_days: Number(e.target.value.replace(/\D/g, "")) || 0 })} aria-invalid={badDays} />
          {badDays ? <p className="text-xs text-destructive">{t("err_days")}</p> : <p className="text-xs text-muted-foreground">{t("r_days_d")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qr-min">{t("r_min")}</Label>
          <Input id="qr-min" inputMode="numeric" className="max-w-[140px]" value={String(f.min_quantity)}
            onChange={(e) => setF({ ...f, min_quantity: Number(e.target.value.replace(/\D/g, "")) || 0 })} aria-invalid={badMin} />
          {badMin ? <p className="text-xs text-destructive">{t("err_min")}</p> : <p className="text-xs text-muted-foreground">{t("r_min_d")}</p>}
        </div>
      </div>
      <label className="flex items-start justify-between gap-3 border-t pt-4">
        <span><span className="block text-sm font-medium">{t("r_product")}</span><span className="block text-xs text-muted-foreground">{t("r_product_d")}</span></span>
        <Switch checked={f.product_button} onCheckedChange={(v) => setF({ ...f, product_button: v })} aria-label={t("r_product")} />
      </label>
      <label className="flex items-start justify-between gap-3 border-t pt-4">
        <span><span className="block text-sm font-medium">{t("r_cart")}</span><span className="block text-xs text-muted-foreground">{t("r_cart_d")}</span></span>
        <Switch checked={f.cart_button} onCheckedChange={(v) => setF({ ...f, cart_button: v })} aria-label={t("r_cart")} />
      </label>
      <div className="border-t pt-4">
        <p className="text-sm font-medium">{t("r_page")}</p>
        <p className="break-all text-xs text-muted-foreground">{t("r_page_d", { page: `${siteUrl()}${QUOTE_PATH}` })}</p>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={save.isPending || badDays || badMin}>{save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("save")}</Button>
      </div>
    </section>
  );
}

