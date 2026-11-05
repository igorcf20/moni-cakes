// =====================================================================================
// Admin > Venda cruzada (recurso cross_sell): regras (store_settings.cross_sell) e a lista de produtos com quantas
// ligações cada um tem. As ligações editam-se na aba Venda cruzada de cada produto (ProductLinksEditor).
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ImageOff, Link2, Loader2, PackageSearch, Save, Search, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminHelp from "./AdminHelp";
import { AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { crossSellMessages } from "@/i18n/crossSell";
import { useAllProductLinks, useCrossSellSettings, useLinkProductOptions, useSaveCrossSellSettings } from "@/hooks/useCrossSell";
import { DEFAULT_CROSS_SELL, linkCounts, type CrossSellSettings } from "@/lib/crossSell";

type Filter = "all" | "with" | "without";

export default function AdminCrossSell() {
  const { t, locale } = useMessages(crossSellMessages);
  const { data: settings } = useCrossSellSettings();
  const saveSettings = useSaveCrossSellSettings();
  const { data: links = [], isLoading } = useAllProductLinks();
  const { data: products = [], isLoading: loadingProducts } = useLinkProductOptions();
  const [form, setForm] = useState<CrossSellSettings>(DEFAULT_CROSS_SELL);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const counts = useMemo(() => linkCounts(links), [links]);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const withLinks = products.filter((p) => counts.has(p.id)).length;
  const dirty = !!settings && JSON.stringify(settings) !== JSON.stringify(form);

  const shown = products.filter((p) => {
    if (filter === "with" && !counts.has(p.id)) return false;
    if (filter === "without" && counts.has(p.id)) return false;
    const s = q.trim().toLowerCase();
    return !s || [p.name, p.id, p.sku ?? ""].some((v) => v.toLowerCase().includes(s));
  });

  const save = () => saveSettings.mutate(form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });
  const set = <K extends keyof CrossSellSettings>(k: K, v: CrossSellSettings[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <AdminHelp id="cross-sell" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <AdminStatCard icon={Link2} label={t("st_products")} value={nf.format(withLinks)} active={filter === "with"} onClick={() => setFilter("with")} />
        <AdminStatCard icon={PackageSearch} label={t("st_links")} value={nf.format(links.length)} />
        <AdminStatCard icon={Unlink} label={t("st_without")} value={nf.format(products.length - withLinks)} tone={products.length - withLinks ? "warning" : "default"} active={filter === "without"} onClick={() => setFilter("without")} />
      </div>

      <section className="space-y-4 rounded-[18px] border bg-card p-5">
        <h2 className="text-base font-semibold">{t("rules")}</h2>
        <div className="grid gap-1.5 sm:max-w-xs">
          <label htmlFor="cs-limit" className="text-sm font-semibold">{t("cart_limit")}</label>
          <Select value={String(form.cartLimit)} onValueChange={(v) => set("cartLimit", Number(v))}>
            <SelectTrigger id="cs-limit"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("cart_limit_hint")}</p>
        </div>
        <div className="divide-y">
          <Toggle label={t("fill")} hint={t("fill_hint")} checked={form.fillWithFeatured} onChange={(v) => set("fillWithFeatured", v)} />
          <Toggle label={t("side_cart")} hint={t("side_cart_hint")} checked={form.sideCart} onChange={(v) => set("sideCart", v)} />
          <Toggle label={t("related_on")} hint={t("related_on_hint")} checked={form.relatedOnProduct} onChange={(v) => set("relatedOnProduct", v)} />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={!dirty || saveSettings.isPending}>
            {saveSettings.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">{t("list_title")}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
          </div>
          <FilterChips<Filter> label={t("filter_label")} value={filter} onChange={setFilter} options={[
            { value: "all", label: t("all"), count: products.length },
            { value: "with", label: t("with_links"), count: withLinks },
            { value: "without", label: t("without_links"), count: products.length - withLinks },
          ]} />
        </div>
        {isLoading || loadingProducts
          ? <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
          : shown.length === 0
            ? <p className="rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
            : (
              <ul className="divide-y overflow-hidden rounded-[18px] border bg-card">
                {shown.map((p) => {
                  const c = counts.get(p.id) ?? { cross_sell: 0, related: 0 };
                  return (
                    <li key={p.id}>
                      <Link to={`${adminHref.product(p.id)}?tab=links`} className="flex items-center gap-3 p-3 transition-colors duration-150 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                        {p.image
                          ? <img src={p.image} alt="" className="h-11 w-11 shrink-0 rounded-lg border bg-muted object-cover" loading="lazy" />
                          : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground"><ImageOff className="h-4 w-4" aria-hidden="true" /></span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {t("col_cross")}: {c.cross_sell} · {t("col_related")}: {c.related}
                            {!p.is_active && <span className="ml-1 text-amber-700">{t("hidden")}</span>}
                          </span>
                        </span>
                        <span className="hidden text-sm font-medium text-brand-orange-text sm:block">{t("open")}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
      </section>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}
