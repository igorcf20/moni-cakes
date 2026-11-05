// Peças do pedido de orçamento na loja: quantidade fixa e selo das linhas de orçamento no carrinho (Cart.tsx e
// CartSheet.tsx), convite Pedir orçamento no resumo do carrinho e link na página do produto.
import { Link } from "react-router-dom";
import { ClipboardList, FileCheck2 } from "lucide-react";
import { useFeature } from "@/hooks/useFeatures";
import { useQuoteSettings } from "@/hooks/useQuotes";
import { useMessages } from "@/i18n";
import { quotesMessages } from "@/i18n/quotes";
import { QUOTE_PATH } from "@/lib/quotes";

/** Quantidade fixa no lugar do seletor (o servidor só aceita a quantidade da proposta). */
export function QuoteLineQty({ qty }: { qty: number }) {
  const { t } = useMessages(quotesMessages);
  return (
    <span className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] border border-brand-card-border bg-brand-alt px-3 text-[14px] font-semibold tabular-nums">
      <FileCheck2 className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{t("cart_fixed", { n: qty })}
    </span>
  );
}

export function QuoteLineBadge() {
  const { t } = useMessages(quotesMessages);
  return <span className="rounded-md bg-brand-orange-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand-orange-text">{t("cart_line")}</span>;
}

/** Convite no resumo do carrinho: pedir orçamento com os itens do carrinho (recurso quotes, regra cart_button). */
export function QuoteCartPrompt({ hasItems }: { hasItems: boolean }) {
  const { t } = useMessages(quotesMessages);
  const on = useFeature("quotes");
  const { data: settings } = useQuoteSettings();
  if (!on || !hasItems || !settings?.cart_button) return null;
  return (
    <Link to={`${QUOTE_PATH}?carrinho=1`}
      className="mt-3 flex items-center gap-3 rounded-[18px] border border-brand-card-border bg-white p-4 transition-colors duration-150 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-brand-orange-soft text-primary"><ClipboardList className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{t("cart_btn")}</span>
        <span className="block text-[13px] text-brand-ink-soft">{t("cart_btn_d")}</span>
      </span>
    </Link>
  );
}

/** Link discreto na página do produto (regra product_button), com a quantidade, cor e tamanho escolhidos. */
export function QuoteProductLink({ productId, quantity, variationId, sizeLabel }: { productId: string; quantity: number; variationId?: string | null; sizeLabel?: string | null }) {
  const { t } = useMessages(quotesMessages);
  const on = useFeature("quotes");
  const { data: settings } = useQuoteSettings();
  if (!on || !settings?.product_button) return null;
  const q = new URLSearchParams({ produto: productId, qtd: String(Math.max(1, quantity)) });
  if (variationId) q.set("cor", variationId);
  if (sizeLabel) q.set("tam", sizeLabel);
  return (
    <Link to={`${QUOTE_PATH}?${q.toString()}`}
      className="inline-flex min-h-11 items-center gap-2 rounded-[12px] px-1 text-[14px] font-semibold text-brand-orange-text transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ClipboardList className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("product_btn")}
    </Link>
  );
}
