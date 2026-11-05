// Painel Devoluções da página do pedido no Admin: pedidos de devolução deste pedido, com link para a página de cada
// um (Admin > Devoluções). Só aparece quando há algum.
import { Link } from "react-router-dom";
import { ChevronRight, RotateCcw } from "lucide-react";
import { AdminPanel } from "../shell/AdminPageParts";
import { adminHref } from "../shell/adminSections";
import { ReturnBadge } from "../returns/ReturnPage";
import { useMessages } from "@/i18n";
import { adminReturnsMessages } from "@/i18n/adminReturns";
import { returnsMessages } from "@/i18n/returns";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useOrderReturns } from "@/hooks/useReturns";

export default function OrderReturnsPanel({ orderId }: { orderId: string }) {
  const { t } = useMessages(adminReturnsMessages);
  const { t: tr } = useMessages(returnsMessages);
  const { date } = useAdminFormat();
  const { data = [] } = useOrderReturns(orderId);
  if (!data.length) return null;
  return (
    <AdminPanel title={t("panel_title")} icon={RotateCcw}>
      <ul className="divide-y rounded-[14px] border">
        {data.map((r) => (
          <li key={r.id}>
            <Link to={adminHref.returnRequest(r.id)} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2"><ReturnBadge status={r.status} /><span className="font-medium">{tr(`action_${r.action}`)}</span></span>
                <span className="mt-1 block text-xs text-muted-foreground">{tr(`reason_${r.reason}`)} · {date(r.created_at)} · {r.items.map((i) => `${i.quantity} x ${i.name}`).join(", ")}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}
