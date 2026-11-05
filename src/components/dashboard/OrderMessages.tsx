// Mensagens que a loja deixou num pedido (order_notes visíveis ao cliente), dentro dos detalhes do pedido em
// Meus pedidos. Sem mensagens, não mostra nada.
import { MessageSquareText } from "lucide-react";
import { useCustomerOrderMessages } from "@/hooks/useOrderNotes";
import { useMessages } from "@/i18n";
import { orderNotesMessages } from "@/i18n/orderNotes";

export default function OrderMessages({ orderId }: { orderId: string }) {
  const { t, locale } = useMessages(orderNotesMessages);
  const { data = [] } = useCustomerOrderMessages(orderId);
  if (!data.length) return null;
  const when = (v: string) => new Date(v).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <section className="rounded-[16px] border border-primary/20 bg-accent p-4">
      <h4 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-orange-text">
        <MessageSquareText className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("customer_title")}
      </h4>
      <ul className="mt-3 space-y-3">
        {data.map((m) => (
          <li key={m.id} className="rounded-[12px] bg-white p-3 text-[14px]">
            <p className="whitespace-pre-line leading-relaxed">{m.body}</p>
            <p className="mt-1.5 text-[12px] text-muted-foreground"><time dateTime={m.created_at}>{when(m.created_at)}</time></p>
          </li>
        ))}
      </ul>
    </section>
  );
}
