// =====================================================================================
// Admin > Outras formas de vender > Pré-venda (recurso preorders): produtos com pré-venda configurada, estado
// (em pré-venda, limite atingido, terminada, desligada), vendidas e pedidos. Configura-se na aba Pré-venda do produto.
// =====================================================================================
import { Link } from "react-router-dom";
import { CalendarClock, Loader2, Package, ReceiptText, Settings2 } from "lucide-react";
import AdminHelp from "./AdminHelp";
import { AdminStatCard } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { adminPreordersMessages } from "@/i18n/adminPreorders";
import { useAdminPreorders, type AdminPreorderRow } from "@/hooks/usePreorders";
import { formatReleaseDate } from "@/lib/preorders";
import { cn } from "@/lib/utils";

type State = "running" | "full" | "ended" | "off";
const stateOf = (r: AdminPreorderRow): State =>
  !r.is_active ? "off" : !r.running ? "ended" : r.max_units != null && r.sold >= r.max_units ? "full" : "running";
const STATE_STYLE: Record<State, string> = {
  running: "bg-brand-orange-soft text-brand-orange-text",
  full: "bg-amber-50 text-amber-800",
  ended: "bg-muted text-muted-foreground",
  off: "bg-muted text-muted-foreground",
};

export default function AdminPreorders() {
  const { t, locale } = useMessages(adminPreordersMessages);
  const list = useAdminPreorders();
  const rows = list.data ?? [];
  const nf = new Intl.NumberFormat(locale);
  const running = rows.filter((r) => stateOf(r) === "running" || stateOf(r) === "full").length;
  const sold = rows.reduce((s, r) => s + r.sold, 0);
  const orders = rows.reduce((s, r) => s + r.orders, 0);
  const label: Record<State, string> = { running: t("s_running"), full: t("s_full"), ended: t("s_ended"), off: t("s_off") };

  return (
    <div className="space-y-6">
      <AdminHelp id="preorders" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <AdminStatCard icon={CalendarClock} label={t("st_running")} value={nf.format(running)} />
        <AdminStatCard icon={Package} label={t("st_sold")} value={nf.format(sold)} />
        <AdminStatCard icon={ReceiptText} label={t("st_orders")} value={nf.format(orders)} />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t("list_title")}</h2>
        {list.isLoading
          ? <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
          : list.isError
            ? <p className="rounded-[18px] border border-dashed p-6 text-center text-sm text-destructive">{t("load_error")}</p>
            : rows.length === 0
              ? <p className="rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
              : (
                <ul className="divide-y overflow-hidden rounded-[18px] border bg-card">
                  {rows.map((r) => {
                    const st = stateOf(r);
                    return (
                      <li key={r.product_id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                        {r.product_image
                          ? <img src={r.product_image} alt="" className="h-12 w-12 shrink-0 rounded-lg border object-cover" loading="lazy" />
                          : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground"><Package className="h-4 w-4" aria-hidden="true" /></span>}
                        <span className="min-w-0 flex-1">
                          <Link to={adminHref.productStats(r.product_id)} className="block truncate text-sm font-semibold hover:text-brand-orange-text">{r.product_name}</Link>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", STATE_STYLE[st])}>{label[st]}</span>
                            <span>{t("col_release")}: {r.release_date ? formatReleaseDate(r.release_date, locale) : t("no_date")}</span>
                            <span className="tabular-nums">{r.max_units != null ? t("sold_of", { sold: nf.format(r.sold), max: nf.format(r.max_units) }) : t("sold_only", { sold: nf.format(r.sold) })}</span>
                            <span className="tabular-nums">{t("orders", { n: nf.format(r.orders) })}</span>
                          </span>
                        </span>
                        <Link to={`${adminHref.product(r.product_id)}?tab=preorder`}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted">
                          <Settings2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("edit")}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
      </section>
    </div>
  );
}
