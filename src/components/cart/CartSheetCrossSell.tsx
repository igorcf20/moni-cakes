// Linha "Combina com" no carrinho lateral (recurso cross_sell, regra "Mostrar no carrinho lateral" em
// Admin > Venda cruzada). Só as ligações "Combina com" dos produtos do carrinho, até 3, sem completar com destaques.
// Produto simples entra no carrinho com um toque; com cores, tamanhos ou personalização abre a página do produto.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatures";
import { fetchCartSuggestionRows, useCrossSellSettings } from "@/hooks/useCrossSell";
import { useCurrency } from "@/hooks/use-currency";
import { useMessages } from "@/i18n";
import { crossSellMessages } from "@/i18n/crossSell";
import { SIDE_CART_LIMIT } from "@/lib/crossSell";
import { useCountry } from "@/lib/countries";
import { formatPrice } from "@/utils/currency";
import { withVat } from "@/utils/pricing";
import { getProductPromo } from "@/utils/promo";

type AddFn = (item: { productId: string; quantity: number; designData: Record<string, unknown> }) => Promise<unknown>;

export default function CartSheetCrossSell({ cartIds, onNavigate, add }: { cartIds: string[]; onNavigate: () => void; add: AddFn }) {
  const { t } = useMessages(crossSellMessages);
  const on = useFeature("cross_sell");
  const { data: settings } = useCrossSellSettings();
  const { currentCurrency, convert } = useCurrency();
  const country = useCountry();
  const enabled = on && !!settings?.sideCart && cartIds.length > 0;

  const { data = [] } = useQuery({
    queryKey: ["sheet-cross-sell", cartIds.join(",")],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const rows = await fetchCartSuggestionRows(cartIds, { ...settings!, fillWithFeatured: false }, SIDE_CART_LIMIT);
      if (!rows.length) return [];
      const sb = supabase as any;
      const ids = rows.map((r) => r.id);
      const [vars, sizes] = await Promise.all([
        sb.from("product_variations").select("product_id").in("product_id", ids).eq("is_active", true),
        sb.from("product_sizes").select("product_id").in("product_id", ids).eq("is_active", true),
      ]);
      const unknown = !!(vars.error || sizes.error);
      const withOptions = new Set<string>([...(vars.data ?? []), ...(sizes.data ?? [])].map((r: any) => String(r.product_id)));
      return rows.map((r) => ({ row: r, options: unknown || !!r.customizable || withOptions.has(String(r.id)) }));
    },
  });

  if (!enabled || !data.length) return null;
  void country; // withVat segue o país atual

  return (
    <section className="px-4 pb-4" aria-labelledby="sheet-cross-title">
      <h3 id="sheet-cross-title" className="mb-2 text-[15px] font-bold tracking-[-0.01em] text-foreground">{t("sheet_title")}</h3>
      <ul className="space-y-2">
        {data.map(({ row, options }) => {
          const promo = getProductPromo(row);
          const base = Number(row.price || 0);
          const effective = promo?.isActive ? promo.effectivePrice : base;
          const href = `/produto/${row.slug || row.id}`;
          const addOne = () => add({
            productId: row.id,
            quantity: 1,
            designData: {
              name: row.name,
              image: row.image || "",
              weight: Number(row.weight) || 0.5,
              price: effective,
              selectionPricing: { version: 1, basePrice: effective, modifier: 0, tierRatio: base > 0 ? effective / base : 1 },
            },
          });
          return (
            <li key={row.id} className="flex items-center gap-3 rounded-[14px] border border-brand-card-border bg-white p-2.5">
              <Link to={href} onClick={onNavigate} tabIndex={-1} aria-hidden="true" className="shrink-0">
                {row.image
                  ? <img src={row.image} alt="" className="h-12 w-12 rounded-[10px] border border-brand-card-border object-cover" loading="lazy" />
                  : <span className="block h-12 w-12 rounded-[10px] border border-brand-card-border bg-brand-alt" />}
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={href} onClick={onNavigate} className="line-clamp-1 text-[14px] font-semibold text-foreground transition-colors duration-150 hover:text-brand-orange-text">{row.name}</Link>
                <p className="text-[13px] tabular-nums text-brand-ink-soft">{formatPrice(convert(withVat(effective, row.vat_rate)), currentCurrency)}</p>
              </div>
              {options ? (
                <Link to={href} onClick={onNavigate} aria-label={t("sheet_choose", { name: row.name })}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border text-foreground transition-colors duration-150 hover:border-primary hover:text-brand-orange-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : (
                <button type="button" onClick={() => { void addOne(); }} aria-label={t("sheet_add", { name: row.name })}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
