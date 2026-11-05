// Preço do grupo do cliente na página do produto (recurso customer_groups, Admin > Grupos de clientes).
// Só aparece com sessão, num grupo ativo e quando o preço do grupo é menor; o carrinho cobra com a mesma conta
// (src/lib/customerGroups.ts) e o servidor confere no pedido.
import { UsersRound } from "lucide-react";
import { useMyGroupPricing } from "@/hooks/useCustomerGroups";
import { groupDisplayName, groupUnitPrice } from "@/lib/customerGroups";
import { useMessages } from "@/i18n";
import { customerGroupsMessages } from "@/i18n/customerGroups";

export default function GroupPriceHint({ productId, quantity, unit, modifier, fmt }: {
  productId: string;
  quantity: number;
  /** preço unitário líquido do catálogo para a quantidade e as opções (com cor e tamanho) */
  unit: number;
  modifier: number;
  fmt: (net: number) => string;
}) {
  const { t, locale } = useMessages(customerGroupsMessages);
  const { data } = useMyGroupPricing([productId]);
  if (!data?.group) return null;
  const group = groupUnitPrice(data, { productId, quantity: Math.max(1, quantity), base: unit - modifier, modifier });
  if (group.source === "catalog" || group.unit >= unit - 1e-9) return null;
  const name = groupDisplayName(data.group, locale);
  return (
    <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-orange-soft px-3 py-2 text-[15px] text-foreground">
      <UsersRound className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
      <span className="font-semibold">{t("store_price", { group: name })}:</span>
      <span className="font-bold tabular-nums">{fmt(group.unit)}</span>
      <span className="sr-only">{t("store_price_hint", { group: name })}</span>
    </p>
  );
}
