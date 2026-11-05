// =====================================================================================
// Admin > Avisos de estoque (Avise-me quando chegar). Duas telas, sem janelas:
//   lista     produtos com pedidos de aviso: números, filtros (voltaram, esgotados), busca; os que voltaram vêm primeiro
//   produto   (ver=produto&id=<id>) pessoas à espera: selecionar, marcar como avisado, copiar e-mails, CSV, cancelar, apagar
// O envio automático por e-mail depende do remetente da loja (hoje desligado): até lá, a loja avisa por conta própria
// e marca aqui. Dados: public.stock_alerts e admin_stock_alert_summary (migration 20261006180000_stock_alerts.sql).
// =====================================================================================
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BellRing, CheckCheck, ChevronRight, Copy, Download, Loader2, Mail, PackageCheck, PackageX, Pencil, Search, Trash2, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminStockAlertsMessages } from "@/i18n/adminStockAlerts";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useProductStockAlerts, useStockAlertSummary, useUpdateStockAlerts, type StockAlertSummary } from "@/hooks/useStockAlerts";
import { backInStock, type StockAlertStatus } from "@/lib/stockAlerts";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
type T = ReturnType<typeof useMessages<typeof adminStockAlertsMessages["pt-BR"]>>["t"];

/** Aviso fixo: sem remetente de e-mail, a loja avisa por conta própria. */
function EmailNotice({ t }: { t: T }) {
  return (
    <p className="flex items-start gap-2.5 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <Mail className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
      <span><strong>{t("email_title")}</strong> {t("email_text")}</span>
    </p>
  );
}

function StockBadge({ stock, t }: { stock: number | null; t: T }) {
  const back = backInStock(stock);
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", back ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
      {stock == null ? t("stock_free") : back ? t("stock_n", { n: stock }) : t("stock_out")}
    </span>
  );
}

export default function AdminStockAlerts() {
  const { t } = useMessages(adminStockAlertsMessages);
  const page = useAdminPage();
  if (page.view === "produto" && page.id) return <ProductAlerts id={page.id} onBack={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="stock-alerts" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <EmailNotice t={t} />
      <AlertList onOpen={(id) => page.open("produto", id)} />
    </div>
  );
}

type Filter = "all" | "back" | "out";

function AlertList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminStockAlertsMessages);
  const { relative } = useAdminFormat();
  const { data: rows = [], isLoading, error } = useStockAlertSummary();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const withWaiting = rows.filter((r) => r.waiting > 0);
  const back = withWaiting.filter((r) => backInStock(r.stock_quantity));
  const waitingTotal = withWaiting.reduce((s, r) => s + r.waiting, 0);
  const notifiedTotal = rows.reduce((s, r) => s + r.notified, 0);

  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    const isBack = (r: StockAlertSummary) => r.waiting > 0 && backInStock(r.stock_quantity);
    return rows
      .filter((r) => (filter === "all" || (filter === "back" ? isBack(r) : !backInStock(r.stock_quantity))) && (!needle || norm(r.name).includes(needle)))
      .sort((a, b) => Number(isBack(b)) - Number(isBack(a)) || b.waiting - a.waiting || b.last_request.localeCompare(a.last_request));
  }, [rows, filter, q]);
  const paged = usePaged(filtered, 20);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Users} label={t("stat_waiting")} value={waitingTotal} />
        <AdminStatCard icon={BellRing} label={t("stat_products")} value={withWaiting.length} active={filter === "all"} onClick={() => setFilter("all")} />
        <AdminStatCard icon={PackageCheck} label={t("stat_back")} value={back.length} tone={back.length ? "warning" : "default"} active={filter === "back"} onClick={() => setFilter("back")} />
        <AdminStatCard icon={CheckCheck} label={t("stat_notified")} value={notifiedTotal} tone="success" />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter>
          label={t("f_label")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("f_all"), count: rows.length },
            { value: "back", label: t("f_back"), count: back.length, tone: "warning" },
            { value: "out", label: t("f_out"), count: rows.filter((r) => !backInStock(r.stock_quantity)).length },
          ]}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("f_search")} aria-label={t("f_search")} className="pl-9" />
        </div>
      </div>

      {paged.items.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{rows.length ? t("empty") : t("empty_all")}</p>
      ) : (
        <ul className="space-y-3">
          {paged.items.map((r) => (
            <li key={r.product_id}>
              <button
                type="button"
                onClick={() => onOpen(r.product_id)}
                className="flex w-full items-center gap-4 rounded-[18px] border bg-card p-3 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
              >
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {r.image ? <img src={r.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <PackageX className="m-4 h-6 w-6 text-muted-foreground" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    <StockBadge stock={r.stock_quantity} t={t} />
                    {r.waiting > 0 && backInStock(r.stock_quantity) && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{t("to_notify")}</span>}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {r.waiting === 1 ? t("waiting_one") : t("waiting_n", { n: r.waiting })} · {t("last_request", { when: relative(r.last_request) })}
                  </span>
                </span>
                <span className="hidden shrink-0 items-center text-sm font-semibold text-brand-orange-text sm:inline-flex">{t("open")}<ChevronRight className="ml-1 h-4 w-4" /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
    </div>
  );
}

function ProductAlerts({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useMessages(adminStockAlertsMessages);
  const { dateTime } = useAdminFormat();
  const { data: summary = [] } = useStockAlertSummary();
  const product = summary.find((s) => s.product_id === id);
  const { data: rows = [], isLoading } = useProductStockAlerts(id);
  const update = useUpdateStockAlerts();
  const { ask, confirmSlot } = useInlineConfirm();
  const [status, setStatus] = useState<StockAlertStatus>("waiting");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const list = rows.filter((r) => r.status === status);
  const chosen = list.filter((r) => picked.has(r.id));
  const target = chosen.length ? chosen : list;
  const allPicked = list.length > 0 && chosen.length === list.length;
  const togglePick = (rid: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(rid); else n.delete(rid); return n; });

  const run = async (next: StockAlertStatus | "delete") => {
    const ids = target.map((r) => r.id);
    if (!ids.length) return;
    if (next === "delete" && !(await ask(t("confirm_delete", { n: ids.length }), { tone: "danger", confirmLabel: t("delete") }))) return;
    try {
      await update.mutateAsync({ ids, status: next });
      setPicked(new Set());
      toast.success(t(`done_${next}`, { n: ids.length }));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(target.map((r) => r.email).join(", "));
      toast.success(t("copied", { n: target.length }));
    } catch {
      toast.error(t("copy_error"));
    }
  };
  const exportCsv = () =>
    downloadCsv(`avisos-${id}`, [t("col_email"), t("col_country"), t("col_language"), t("col_date"), t("col_status")],
      rows.map((r) => [r.email, r.country, r.locale, dateTime(r.created_at), t(`st_${r.status}`)]));

  const count = (s: StockAlertStatus) => rows.filter((r) => r.status === s).length;

  return (
    <AdminSubpage
      title={product?.name || t("product")}
      subtitle={product ? (product.waiting === 1 ? t("waiting_one") : t("waiting_n", { n: product.waiting })) : undefined}
      backLabel={t("back")}
      onBack={onBack}
      actions={<>
        <Button variant="outline" size="sm" asChild><Link to={adminHref.product(id)}><Pencil className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("edit_product")}</Link></Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="mr-1.5 h-4 w-4" strokeWidth={1.8} />CSV</Button>
      </>}
    >
      <EmailNotice t={t} />
      {product && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {t("stock_now")} <StockBadge stock={product.stock_quantity} t={t} />
          {!backInStock(product.stock_quantity) && <span>{t("stock_hint")}</span>}
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<StockAlertStatus>
          label={t("f_status")}
          value={status}
          onChange={(v) => { setStatus(v); setPicked(new Set()); }}
          options={(["waiting", "notified", "cancelled"] as const).map((s) => ({ value: s, label: t(`st_${s}`), count: count(s) }))}
        />
        <div className="flex flex-wrap gap-2">
          {status !== "notified" && <Button size="sm" onClick={() => run("notified")} disabled={!list.length || update.isPending}><CheckCheck className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{chosen.length ? t("mark_notified_n", { n: chosen.length }) : t("mark_notified_all")}</Button>}
          <Button size="sm" variant="outline" onClick={copyEmails} disabled={!list.length}><Copy className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{chosen.length ? t("copy_n", { n: chosen.length }) : t("copy_all")}</Button>
          {status !== "waiting" && <Button size="sm" variant="outline" onClick={() => run("waiting")} disabled={!list.length || update.isPending}>{t("back_to_waiting")}</Button>}
          {status === "waiting" && <Button size="sm" variant="outline" onClick={() => run("cancelled")} disabled={!list.length || update.isPending}><XCircle className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("cancel")}</Button>}
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => run("delete")} disabled={!list.length || update.isPending}><Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("delete")}</Button>
        </div>
        {confirmSlot}
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
      ) : list.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty_people")}</p>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 p-3"><Checkbox checked={allPicked} onCheckedChange={(v) => setPicked(v === true ? new Set(list.map((r) => r.id)) : new Set())} aria-label={t("pick_all")} /></th>
                <th className="p-3 font-medium">{t("col_email")}</th>
                <th className="p-3 font-medium">{t("col_country")}</th>
                <th className="p-3 font-medium">{t("col_date")}</th>
                {status === "notified" && <th className="p-3 font-medium">{t("col_notified")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="p-3"><Checkbox checked={picked.has(r.id)} onCheckedChange={(v) => togglePick(r.id, v === true)} aria-label={r.email} /></td>
                  <td className="p-3 font-medium">{r.email}{r.user_id && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("has_account")}</span>}</td>
                  <td className="p-3 text-muted-foreground">{[r.country, r.locale].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="p-3 text-muted-foreground tabular-nums">{dateTime(r.created_at)}</td>
                  {status === "notified" && <td className="p-3 text-muted-foreground tabular-nums">{dateTime(r.notified_at)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminSubpage>
  );
}
