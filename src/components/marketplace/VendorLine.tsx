// "Vendido e enviado por <vendedor>" na página do produto (recurso marketplace e regra show_vendor em
// Admin > Vendedores > Regras). Some quando o produto é da própria loja ou o vendedor está pausado.
import { Link } from "react-router-dom";
import { Store } from "lucide-react";
import { useFeature } from "@/hooks/useFeatures";
import { useMarketplaceSettings, usePublicVendors } from "@/hooks/useMarketplace";
import { useMessages } from "@/i18n";
import { marketplaceMessages } from "@/i18n/marketplace";

export function VendorLine({ vendorId }: { vendorId: string | null | undefined }) {
  const on = useFeature("marketplace");
  const { t } = useMessages(marketplaceMessages);
  const { data: settings } = useMarketplaceSettings();
  const { data: vendors = [] } = usePublicVendors(on && !!vendorId);
  const v = vendorId ? vendors.find((x) => x.id === vendorId) : null;
  if (!on || !v || settings?.show_vendor === false) return null;
  return (
    <p className="mt-4 flex items-center gap-2 text-[15px] text-brand-ink-soft" data-vendor-line>
      <Store className="h-[18px] w-[18px] shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
      <span>
        {t("sold_by")}{" "}
        <Link to={`/vendedor/${v.slug}`} className="font-semibold text-foreground underline-offset-4 hover:text-brand-orange-text hover:underline">{v.name}</Link>
      </span>
    </p>
  );
}
