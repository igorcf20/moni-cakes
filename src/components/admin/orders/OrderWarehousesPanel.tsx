// =====================================================================================
// Bloco Armazéns na página do pedido no Admin (recurso warehouses): de que armazém saiu cada item. Some com o
// recurso desligado ou quando nada do pedido saiu de um armazém. Dados: admin_order_allocations.
// =====================================================================================
import { MapPin, Warehouse as WarehouseIcon } from "lucide-react";
import { AdminPanel } from "@/components/admin/shell/AdminPageParts";
import { useMessages } from "@/i18n";
import { adminWarehousesMessages } from "@/i18n/adminWarehouses";
import { useFeature } from "@/hooks/useFeatures";
import { useOrderAllocations } from "@/hooks/useWarehouses";
import { slotLabel } from "@/lib/warehouses";

const Code = ({ children }: { children: string }) => (
  <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{children}</span>
);

/** De que armazém saiu cada item do pedido (só com o recurso ligado e com armazéns). */
export default function OrderWarehousesPanel({ orderId }: { orderId: string }) {
  const on = useFeature("warehouses");
  const { t } = useMessages(adminWarehousesMessages);
  const { data: rows = [], isLoading } = useOrderAllocations(orderId, on);
  if (!on || isLoading || !rows.length) return null;
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.warehouse_id, [...(groups.get(r.warehouse_id) ?? []), r]);
  return (
    <AdminPanel title={t("order_title")} icon={WarehouseIcon}>
      <p className="mb-3 text-sm text-muted-foreground">{t("order_d")}</p>
      <ul className="space-y-3">
        {[...groups.values()].map((g) => (
          <li key={g[0].warehouse_id} className="rounded-xl border p-3">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <MapPin className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
              {g[0].warehouse_name}
              {g[0].warehouse_code && <Code>{g[0].warehouse_code}</Code>}
              {g[0].warehouse_city && <span className="text-sm font-normal text-muted-foreground">{g[0].warehouse_city}</span>}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-sm">
              {g.map((r) => (
                <li key={`${r.product_id}-${r.variation_name}-${r.size_label}`} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{[r.product_name ?? t("removed"), slotLabel(r)].filter(Boolean).join(" / ")}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{t("qty_n", { n: r.quantity })}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}
