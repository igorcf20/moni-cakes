// =====================================================================================
// Admin > Marketing > Feed de produtos (recurso product_feed): endereço do feed por país (Google Merchant Center,
// Meta, TikTok, Pinterest), regras (store_settings.product_feed), categoria do Google por categoria da loja, produtos
// fora do feed ou com avisos e a pré-visualização das linhas. O arquivo é gerado pela função product-feed com as
// mesmas regras (src/lib/productFeed.ts = _shared/productFeed.ts).
// =====================================================================================
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Copy, ExternalLink, ImageOff, Layers, Loader2, PackageCheck, PackageX, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag } from "@/components/Flag";
import AdminHelp from "./AdminHelp";
import { AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { adminProductFeedMessages, type AdminProductFeedKey } from "@/i18n/adminProductFeed";
import { countryName, useCountries, type Country } from "@/lib/countries";
import { siteUrl } from "@/lib/siteUrl";
import { useFeature } from "@/hooks/useFeatures";
import { useStoreName } from "@/hooks/useBrand";
import { useFeedSettings, useFeedSource, useSaveFeedSettings, type FeedSource } from "@/hooks/useProductFeed";
import {
  BLOCKING_ISSUES, buildFeedItems, DEFAULT_FEED_SETTINGS, FEED_CONDITIONS, feedCountryOn, feedCurrency, feedVariants,
  normalizeFeedSettings, productIssues, type FeedCountry, type FeedIssue, type FeedItem, type FeedSettings, type FeedSkip,
} from "@/lib/productFeed";
import { cn } from "@/lib/utils";

type T = (key: AdminProductFeedKey, vars?: Record<string, string | number>) => string;
type Filter = "all" | "in" | "out" | "warn";

const GOOGLE_TAXONOMY_URL = "https://support.google.com/merchants/answer/6324436";
/** Avisos que contam no número "Com avisos" (sem código de barras é normal em fabricação própria). */
const WARNINGS: FeedIssue[] = ["no_description", "no_brand", "title_long"];

const feedUrl = (code: string) => `${siteUrl()}/functions/v1/product-feed?pais=${code}`;
const toFeedCountry = (c: Country): FeedCountry => ({ code: c.code, currency: c.currency, taxMode: c.taxMode, taxRate: c.defaultTaxRate });

export default function AdminProductFeed() {
  const { t, locale } = useMessages(adminProductFeedMessages);
  const brandsOn = useFeature("brands");
  const colorStock = useFeature("variants");
  const storeName = useStoreName();
  const { data: countries = [] } = useCountries();
  const { data: saved } = useFeedSettings();
  const save = useSaveFeedSettings();
  const source = useFeedSource(brandsOn);
  const [form, setForm] = useState<FeedSettings>(DEFAULT_FEED_SETTINGS);
  const loaded = useRef(false);
  useEffect(() => { if (saved && !loaded.current) { loaded.current = true; setForm(saved); } }, [saved]);

  const [previewCode, setPreviewCode] = useState<string>("");
  const previewCountry = countries.find((c) => c.code === previewCode) ?? countries[0] ?? null;
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const dirty = !!saved && JSON.stringify(normalizeFeedSettings(form)) !== JSON.stringify(saved);

  // Linhas do país da pré-visualização, com as regras ainda por salvar (mostra o efeito antes de gravar).
  const feed = useMemo(() => {
    if (!source.data || !previewCountry) return null;
    return buildFeedItems(source.data.data, {
      siteUrl: siteUrl(), storeName, country: toFeedCountry(previewCountry), money: source.data.money,
      settings: normalizeFeedSettings(form), colorStock, brands: source.data.brands, categoryNames: source.data.categoryNames,
    });
  }, [source.data, previewCountry, storeName, form, colorStock]);

  const set = <K extends keyof FeedSettings>(k: K, v: FeedSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const saveRules = () => save.mutate(form, {
    onSuccess: (value) => { setForm(value); toast.success(t("saved")); },
    onError: () => toast.error(t("save_error")),
  });

  // Tirar ou pôr um produto grava na hora (sobre o que está salvo), sem levar as regras ainda por salvar.
  const toggleProduct = (id: string, exclude: boolean) => {
    const base = saved ?? DEFAULT_FEED_SETTINGS;
    const next = exclude ? [...base.excludedProducts, id] : base.excludedProducts.filter((x) => x !== id);
    save.mutate({ ...base, excludedProducts: next }, {
      onSuccess: (value) => { setForm((f) => ({ ...f, excludedProducts: value.excludedProducts })); toast.success(t(exclude ? "excluded_ok" : "included_ok")); },
      onError: () => toast.error(t("save_error")),
    });
  };

  if (source.isLoading || !saved) {
    return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  }
  if (source.isError || !source.data) {
    return <p className="rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground">{t("load_error")}</p>;
  }

  const src = source.data;
  const items = feed?.items ?? [];
  const skipped = feed?.skipped ?? [];
  const inFeed = new Set(items.map((i) => i.productId)).size;

  return (
    <div className="space-y-6">
      <AdminHelp id="product-feed" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <AdminStatCard icon={PackageCheck} label={t("st_products")} value={nf.format(inFeed)} />
        <AdminStatCard icon={Layers} label={t("st_items")} value={nf.format(items.length)} />
        <AdminStatCard icon={PackageX} label={t("st_out")} value={nf.format(skipped.length)} tone={skipped.length ? "warning" : "default"} />
        <AdminStatCard icon={AlertTriangle} label={t("st_warn")} value={nf.format(warningCount(src, form, colorStock))} />
      </div>

      <FeedLinks t={t} countries={countries} form={form} money={src.money} locale={locale} onToggle={(code, on) => {
        const all = countries.map((c) => c.code);
        const current = form.countries.length ? form.countries : all;
        const next = on ? [...new Set([...current, code])] : current.filter((c) => c !== code);
        set("countries", all.every((c) => next.includes(c)) ? [] : next);
      }} />

      <section className="space-y-4 rounded-[18px] border bg-card p-5">
        <h2 className="text-base font-semibold">{t("rules_title")}</h2>
        <div className="divide-y">
          <Toggle label={t("variants")} hint={t("variants_hint")} checked={form.variants} onChange={(v) => set("variants", v)} />
          <Toggle label={t("out_of_stock")} hint={t("out_of_stock_hint")} checked={form.includeOutOfStock} onChange={(v) => set("includeOutOfStock", v)} />
          <Toggle label={t("brand_fallback")} hint={t("brand_fallback_hint")} checked={form.brandFallback} onChange={(v) => set("brandFallback", v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="pf-condition" className="text-sm font-semibold">{t("condition")}</label>
            <Select value={form.condition} onValueChange={(v) => set("condition", v as FeedSettings["condition"])}>
              <SelectTrigger id="pf-condition"><SelectValue /></SelectTrigger>
              <SelectContent>{FEED_CONDITIONS.map((c) => <SelectItem key={c} value={c}>{t(`cond_${c}` as AdminProductFeedKey)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="pf-gcat" className="text-sm font-semibold">{t("google_cat")}</label>
            <Input id="pf-gcat" value={form.defaultGoogleCategory} maxLength={250} onChange={(e) => set("defaultGoogleCategory", e.target.value)} />
            <p className="text-xs text-muted-foreground">
              {t("google_cat_hint")}{" "}
              <a href={GOOGLE_TAXONOMY_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-orange-text underline-offset-2 hover:underline">{t("google_cat_link")}</a>
            </p>
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <h3 className="text-sm font-semibold">{t("cats_title")}</h3>
            <p className="text-xs text-muted-foreground">{t("cats_hint")}</p>
          </div>
          {src.categories.length === 0
            ? <p className="text-sm text-muted-foreground">{t("cats_empty")}</p>
            : (
              <ul className="divide-y rounded-[14px] border">
                {src.categories.map((c) => {
                  const on = !form.excludedCategories.includes(c.key);
                  return (
                    <li key={c.key} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{c.name}</span>
                        <span className="block text-xs text-muted-foreground">{t(c.count === 1 ? "cat_products_one" : "cat_products_other", { n: c.count })}</span>
                      </span>
                      <Input
                        aria-label={`${t("cat_google")}: ${c.name}`} placeholder={form.defaultGoogleCategory || t("cat_google")} maxLength={250}
                        value={form.categoryMap[c.key] ?? ""} disabled={!on}
                        onChange={(e) => set("categoryMap", { ...form.categoryMap, [c.key]: e.target.value })}
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={on} onCheckedChange={(v) => set("excludedCategories", v ? form.excludedCategories.filter((k) => k !== c.key) : [...form.excludedCategories, c.key])} />
                        {t("cat_in_feed")}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
        </div>

        <div className="flex justify-end">
          <Button onClick={saveRules} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
          </Button>
        </div>
      </section>

      <ProductList t={t} src={src} form={form} items={items} skipped={skipped} colorStock={colorStock} busy={save.isPending} onToggle={toggleProduct} />

      <Preview t={t} locale={locale} countries={countries} country={previewCountry} onCountry={setPreviewCode} items={items} />
    </div>
  );
}

function warningCount(src: FeedSource, form: FeedSettings, colorStock: boolean) {
  const settings = normalizeFeedSettings(form);
  return src.data.products.filter((p) => {
    const variants = feedVariants(p, (src.data.colors ?? []).filter((c) => c.product_id === p.id), (src.data.sizes ?? []).filter((s) => s.product_id === p.id), src.data.combos ?? [], colorStock);
    return productIssues(p, variants, { brands: src.brands, settings }).some((i) => WARNINGS.includes(i));
  }).length;
}

/* ---------- Endereços por país ---------- */

function FeedLinks({ t, countries, form, money, locale, onToggle }: {
  t: T; countries: Country[]; form: FeedSettings; money: FeedSource["money"]; locale: string; onToggle: (code: string, on: boolean) => void;
}) {
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success(t("copied")); } catch { /* sem permissão: o endereço continua visível para copiar à mão */ }
  };
  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">{t("links_title")}</h2>
        <p className="text-sm text-muted-foreground">{t("links_hint")}</p>
      </div>
      <ul className="space-y-3">
        {countries.map((c) => {
          const on = feedCountryOn(form, c.code);
          const cur = feedCurrency(toFeedCountry(c), money);
          const url = feedUrl(c.code);
          const rate = c.taxMode === "vat" ? c.defaultTaxRate : 0;
          return (
            <li key={c.code} className="space-y-2 rounded-[14px] border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Flag code={c.code} className="w-7" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{countryName(c.code, locale as Country["locale"])}</span>
                  <span className="block text-xs text-muted-foreground">
                    {on ? (rate ? t("currency_tax", { currency: cur.currency, rate }) : t("currency_line", { currency: cur.currency })) : t("country_off")}
                  </span>
                </span>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={on} onCheckedChange={(v) => onToggle(c.code, v)} />{t("country_on")}
                </label>
              </div>
              {on && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input readOnly value={url} aria-label={`${t("links_title")}: ${c.code}`} className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                    <Button type="button" variant="outline" size="sm" onClick={() => copy(url)}><Copy className="mr-1.5 h-4 w-4" />{t("copy")}</Button>
                    <Button asChild variant="ghost" size="sm">
                      <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("open")}</a>
                    </Button>
                  </div>
                  {c.currency !== cur.currency && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t("no_rate", { currency: c.currency, base: money.base })}</p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- Produtos ---------- */

function ProductList({ t, src, form, items, skipped, colorStock, busy, onToggle }: {
  t: T; src: FeedSource; form: FeedSettings; items: FeedItem[]; skipped: FeedSkip[]; colorStock: boolean; busy: boolean;
  onToggle: (id: string, exclude: boolean) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const settings = useMemo(() => normalizeFeedSettings(form), [form]);
  const rows = useMemo(() => {
    const lines = new Map<string, number>();
    for (const it of items) lines.set(it.productId, (lines.get(it.productId) ?? 0) + 1);
    const skip = new Map(skipped.map((s) => [s.productId, s.reason]));
    return src.data.products.map((p) => {
      const variants = feedVariants(p, (src.data.colors ?? []).filter((c) => c.product_id === p.id), (src.data.sizes ?? []).filter((s) => s.product_id === p.id), src.data.combos ?? [], colorStock);
      const issues = productIssues(p, variants, { brands: src.brands, settings });
      return { p, lines: lines.get(String(p.id)) ?? 0, reason: skip.get(String(p.id)) ?? null, issues };
    });
  }, [src, items, skipped, settings, colorStock]);

  const counts = {
    all: rows.length,
    in: rows.filter((r) => r.lines > 0).length,
    out: rows.filter((r) => r.lines === 0).length,
    warn: rows.filter((r) => r.issues.some((i) => WARNINGS.includes(i))).length,
  };
  const s = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (filter === "in" && !r.lines) return false;
    if (filter === "out" && r.lines) return false;
    if (filter === "warn" && !r.issues.some((i) => WARNINGS.includes(i))) return false;
    return !s || [r.p.name, String(r.p.id), r.p.sku ?? ""].some((v) => String(v).toLowerCase().includes(s));
  });

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">{t("list_title")}</h2>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
        </div>
        <FilterChips<Filter> label={t("f_label")} value={filter} onChange={setFilter} options={[
          { value: "all", label: t("f_all"), count: counts.all },
          { value: "in", label: t("f_in"), count: counts.in },
          { value: "out", label: t("f_out"), count: counts.out },
          { value: "warn", label: t("f_warn"), count: counts.warn },
        ]} />
      </div>
      {shown.length === 0
        ? <p className="rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        : (
          <ul className="divide-y overflow-hidden rounded-[18px] border bg-card">
            {shown.map(({ p, lines, reason, issues }) => {
              const excluded = settings.excludedProducts.includes(String(p.id));
              const blocking = issues.filter((i) => BLOCKING_ISSUES.includes(i));
              const other = issues.filter((i) => !BLOCKING_ISSUES.includes(i));
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
                  {p.image
                    ? <img src={p.image} alt="" className="h-11 w-11 shrink-0 rounded-lg border bg-muted object-cover" loading="lazy" />
                    : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground"><ImageOff className="h-4 w-4" aria-hidden="true" /></span>}
                  <span className="min-w-0 flex-1">
                    <Link to={adminHref.product(String(p.id))} className="block truncate text-sm font-semibold hover:underline">{p.name}</Link>
                    <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      {lines > 0
                        ? <Chip tone="ok">{t(lines === 1 ? "lines_one" : "lines_other", { n: lines })}</Chip>
                        : reason && !BLOCKING_ISSUES.includes(reason as FeedIssue) && <Chip tone="warn">{t(`r_${reason}` as AdminProductFeedKey)}</Chip>}
                      {blocking.map((i) => <Chip key={i} tone="bad">{t(`i_${i}` as AdminProductFeedKey)}</Chip>)}
                      {other.map((i) => <Chip key={i} tone={WARNINGS.includes(i) ? "warn" : "muted"} title={i === "no_gtin" ? t("gtin_hint") : undefined}>{t(`i_${i}` as AdminProductFeedKey)}</Chip>)}
                    </span>
                  </span>
                  <Button type="button" variant={excluded ? "default" : "outline"} size="sm" disabled={busy} onClick={() => onToggle(String(p.id), !excluded)}>
                    {t(excluded ? "include" : "exclude")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

function Chip({ tone, title, children }: { tone: "ok" | "warn" | "bad" | "muted"; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={cn("rounded-full px-2 py-0.5 font-medium", {
      "bg-emerald-50 text-emerald-800": tone === "ok",
      "bg-amber-50 text-amber-800": tone === "warn",
      "bg-red-50 text-red-700": tone === "bad",
      "bg-muted text-muted-foreground": tone === "muted",
    })}>{children}</span>
  );
}

/* ---------- Pré-visualização ---------- */

const PREVIEW = 8;

function Preview({ t, locale, countries, country, onCountry, items }: {
  t: T; locale: string; countries: Country[]; country: Country | null; onCountry: (code: string) => void; items: FeedItem[];
}) {
  const money = (v: string) => {
    const [amount, currency] = v.split(" ");
    try { return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount)); } catch { return v; }
  };
  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("preview_title")}</h2>
          <p className="text-sm text-muted-foreground">{t("preview_hint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={country?.code ?? ""} onValueChange={onCountry}>
            <SelectTrigger className="w-[200px]" aria-label={t("preview_country")}><SelectValue /></SelectTrigger>
            <SelectContent>{countries.map((c) => <SelectItem key={c.code} value={c.code}>{countryName(c.code, locale as Country["locale"])}</SelectItem>)}</SelectContent>
          </Select>
          {country && (
            <Button asChild variant="outline" size="sm">
              <a href={feedUrl(country.code)} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("view_xml")}</a>
            </Button>
          )}
        </div>
      </div>
      {items.length === 0
        ? <p className="text-sm text-muted-foreground">{t("preview_empty")}</p>
        : (
          <>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.slice(0, PREVIEW).map((it) => (
                <li key={it.id} className="flex min-w-0 gap-3 rounded-[14px] border p-3">
                  <img src={it.image_link} alt="" className="h-16 w-16 shrink-0 rounded-lg border bg-muted object-cover" loading="lazy" />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block truncate text-sm font-semibold" title={it.title}>{it.title}</span>
                    <span className="block text-sm">
                      {it.sale_price
                        ? <><span className="font-semibold text-brand-orange-text">{money(it.sale_price)}</span> <s className="text-muted-foreground">{money(it.price)}</s></>
                        : <span className="font-semibold">{money(it.price)}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className={it.availability === "in_stock" ? "text-emerald-700" : "text-amber-800"}>{t(it.availability === "in_stock" ? "in_stock" : "out_stock")}</span>
                      {" · "}{t("id_label")}: {it.id}{it.brand ? ` · ${it.brand}` : ""}
                    </span>
                    <a href={it.link} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-brand-orange-text hover:underline">{it.link}</a>
                  </span>
                </li>
              ))}
            </ul>
            {items.length > PREVIEW && <p className="text-xs text-muted-foreground">{t("more", { n: items.length - PREVIEW })}</p>}
          </>
        )}
    </section>
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
