// /vendedor/<slug>: página pública de um vendedor do marketplace (recurso marketplace): logo, nome, descrição no
// idioma e os produtos dele, com os mesmos cartões e a mesma grelha das listagens. Vendedor pausado ou inexistente
// mostra "não encontrado". Dados: vendors_public (usePublicVendors) e useCatalogProducts filtrado pelo vendorId.
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Store } from "lucide-react";
import { ListingShell } from "@/components/catalog/CatalogLayout";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import { GridSkeleton, ProductResults } from "@/components/catalog/CatalogGrid";
import { useCatalogProducts } from "@/hooks/useCatalogProducts";
import { usePublicVendors } from "@/hooks/useMarketplace";
import { useStoreName } from "@/hooks/useBrand";
import { useMessages } from "@/i18n";
import { marketplaceMessages } from "@/i18n/marketplace";
import { vendorDescription } from "@/lib/marketplace";

export default function VendorPage() {
  const { slug = "" } = useParams();
  const { t, locale } = useMessages(marketplaceMessages);
  const storeName = useStoreName();
  const { data: vendors = [], isLoading } = usePublicVendors();
  const catalog = useCatalogProducts("");
  const v = vendors.find((x) => x.slug === slug) ?? null;
  const items = v ? catalog.items.filter((i) => i.vendorId === v.id) : [];
  const desc = v ? vendorDescription(v, locale) : "";

  if (!isLoading && !v) {
    return (
      <ListingShell>
        <div className="mx-auto max-w-xl py-16 text-center">
          <Store className="mx-auto h-10 w-10 text-brand-orange-text" strokeWidth={1.7} aria-hidden="true" />
          <h1 className="mt-4 text-[32px] font-[780] tracking-[-0.03em]">{t("vendor_not_found")}</h1>
          <p className="mt-2 text-brand-ink-soft">{t("vendor_not_found_d")}</p>
          <Link to="/produtos" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary-hover">{t("see_all")}</Link>
        </div>
      </ListingShell>
    );
  }

  return (
    <ListingShell>
      <Helmet>
        <title>{`${v?.name ?? t("vendor")} | ${storeName}`}</title>
        {desc && <meta name="description" content={desc.slice(0, 160)} />}
      </Helmet>
      <CatalogBreadcrumb items={[{ label: t("home"), href: "/" }, { label: t("products"), href: "/produtos" }, { label: v?.name ?? "" }]} />
      <header className="mt-4 flex flex-col gap-5 rounded-[24px] border border-brand-card-border bg-white p-5 sm:flex-row sm:items-center sm:p-7">
        <span className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[20px] bg-brand-alt">
          {v?.logo_url
            ? <img src={v.logo_url} alt="" className="max-h-[80%] max-w-[80%] object-contain" />
            : <span className="text-[30px] font-[780] tracking-[-0.03em] text-brand-ink-soft">{(v?.name ?? "").slice(0, 2).toUpperCase()}</span>}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text">{t("vendor")}</p>
          <h1 className="mt-1 text-[34px] font-[780] leading-[1.05] tracking-[-0.035em] sm:text-[44px]">{v?.name}</h1>
          <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-brand-ink-soft">{desc || t("vendor_lead", { name: v?.name ?? "", store: storeName })}</p>
          {!catalog.isLoading && <p className="mt-2 text-[14px] text-muted-foreground">{items.length === 1 ? t("products_one") : t("products_n", { n: items.length })}</p>}
        </div>
      </header>
      <div className="mt-8">
        {catalog.isLoading || isLoading ? <GridSkeleton /> : items.length ? <ProductResults items={items} /> : (
          <p className="rounded-[20px] border border-dashed border-brand-card-border p-10 text-center text-brand-ink-soft">{t("vendor_empty")}</p>
        )}
      </div>
    </ListingShell>
  );
}
