// Aviso do checkout quando o estoque mudou depois de o item entrar no carrinho (useCartStock): lista os itens
// esgotados ou com menos unidades e ajusta o carrinho num toque (remove os esgotados, baixa a quantidade dos outros).
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMessages } from "@/i18n";
import { cartMessages } from "@/i18n/cart";
import type { LineStock } from "@/lib/cartStock";
import { cn } from "@/lib/utils";

type Problem = LineStock & { index: number; item: any };

export function CartStockNotice({ problems, onRemove, onQuantity, className }: {
  problems: Problem[];
  onRemove: (itemId: string) => unknown;
  onQuantity: (itemId: string, quantity: number) => unknown;
  className?: string;
}) {
  const { t } = useMessages(cartMessages);
  const [busy, setBusy] = useState(false);
  if (!problems.length) return null;

  const fix = async () => {
    setBusy(true);
    try {
      // Do fim para o começo: no carrinho sem conta o id da linha leva a posição.
      for (const p of [...problems].sort((a, b) => b.index - a.index)) {
        const id = String(p.item?.id ?? "");
        if (!id) continue;
        if (p.state === "out" || !p.max) await onRemove(id);
        else await onQuantity(id, p.max);
      }
      toast.success(t("stockFixed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="alert" className={cn("rounded-[16px] border border-amber-300 bg-amber-50 p-4 text-amber-900", className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" strokeWidth={1.8} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{t("stockNoticeTitle")}</p>
          <ul className="mt-1.5 space-y-1 text-[14px] leading-relaxed">
            {problems.map((p) => {
              const name = p.item?.products?.name || p.item?.design_data?.name || p.item?.name || t("productFallback");
              return (
                <li key={p.index}>
                  {p.state === "out"
                    ? t("stockNoticeOut", { name })
                    : t(p.max === 1 ? "stockNoticeShort_one" : "stockNoticeShort_other", { name, count: p.max ?? 0, qty: p.item?.quantity ?? 0 })}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void fix()}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("stockFixAll")}
            </button>
            <Link
              to="/carrinho"
              className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-amber-300 bg-white px-4 text-[14px] font-semibold text-amber-900 transition-colors duration-150 hover:border-primary hover:text-brand-orange-text"
            >
              {t("stockGoCart")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
