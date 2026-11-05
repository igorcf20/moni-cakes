// Respostas aos campos extra do checkout gravadas num pedido (orders.checkout_fields), com o preço de cada uma.
// Usado na página do pedido no Admin e no pedido da conta do cliente. Sem respostas, não mostra nada.
import { ListChecks } from "lucide-react";
import { useMessages } from "@/i18n";
import { checkoutFieldsMessages } from "@/i18n/checkoutFields";
import { answerText, localText, orderAnswerLines } from "@/lib/checkoutFields";
import { cn } from "@/lib/utils";

export default function OrderCheckoutFields({ value, money, className, title = true }: {
  value: unknown;
  money: (n: number) => string;
  className?: string;
  title?: boolean;
}) {
  const { t, locale } = useMessages(checkoutFieldsMessages);
  const lines = orderAnswerLines(value);
  if (!lines.length) return null;
  return (
    <div className={cn("space-y-2", className)}>
      {title && (
        <h4 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <ListChecks className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("order_title")}
        </h4>
      )}
      <dl className="space-y-1.5 text-[14px]">
        {lines.map((l) => (
          <div key={l.field_id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <dt className="text-muted-foreground">{localText(l.label, locale, l.name)}</dt>
              <dd className="whitespace-pre-line break-words font-medium">{answerText(l, locale, t("yes"))}</dd>
            </div>
            {l.price > 0 && <span className="shrink-0 tabular-nums font-medium">{money(l.price)}</span>}
          </div>
        ))}
      </dl>
    </div>
  );
}
