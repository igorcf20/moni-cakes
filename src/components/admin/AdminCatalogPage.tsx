// =====================================================================================
// Admin > Aparência da loja > Página de catálogo: como /produtos e /categoria/:slug se organizam
// (store_settings.catalog_page, regras em src/lib/catalogPage.ts). Modelos Recomendado e Clássico, um bloco por área
// (cabeçalho, produtos, filtros) com explicação e dica, e uma prévia desenhada ao lado que muda na hora. Sem janelas.
// =====================================================================================
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, Heart, Loader2, Save, ShoppingBag, SlidersHorizontal, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { useCatalogPageSettings, useSaveCatalogPageSettings } from "@/hooks/useCatalogPage";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useMessages } from "@/i18n";
import { adminCatalogPageMessages, type AdminCatalogPageT as T } from "@/i18n/adminCatalogPage";
import { CLASSIC_CATALOG_PAGE, DEFAULT_CATALOG_PAGE, sameCatalogPage, type CatalogPageSettings } from "@/lib/catalogPage";
import { cn } from "@/lib/utils";

export default function AdminCatalogPage() {
  const { t: tr } = useMessages(adminCatalogPageMessages);
  const t = tr as T;
  const { data: saved, isLoading } = useCatalogPageSettings();
  const save = useSaveCatalogPageSettings();
  const [form, setForm] = useState<CatalogPageSettings>(DEFAULT_CATALOG_PAGE);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && !sameCatalogPage(saved, form);
  const set = <K extends keyof CatalogPageSettings>(k: K, v: CatalogPageSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const preset = sameCatalogPage(form, DEFAULT_CATALOG_PAGE) ? "new" : sameCatalogPage(form, CLASSIC_CATALOG_PAGE) ? "classic" : "custom";
  const submit = () => save.mutate(form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>;

  return (
    <div className="space-y-5">
      <AdminHelp id="catalog-page" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-[18px] border bg-card p-5">
            <h2 className="flex items-center text-base font-semibold">{t("preset")}<HelpTip label={t("help")} text={t("preset_h")} /></h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <PresetCard active={preset === "new"} title={t("preset_new")} text={t("preset_new_d")} onClick={() => setForm(DEFAULT_CATALOG_PAGE)} />
              <PresetCard active={preset === "classic"} title={t("preset_classic")} text={t("preset_classic_d")} onClick={() => setForm(CLASSIC_CATALOG_PAGE)} />
            </div>
            {preset === "custom" && <p className="mt-3 text-xs font-medium text-muted-foreground">{t("preset_custom")}</p>}
          </section>

          <Block title={t("header_block")} hint={t("header_block_h")} t={t}>
            <Radio name="cp-header" title={t("header")} hint={t("header_h")} t={t} value={form.header} onChange={(v) => set("header", v)} options={[
              { value: "compact", label: t("header_compact"), text: t("header_compact_d") },
              { value: "banner", label: t("header_banner"), text: t("header_banner_d") },
            ]} />
            <Toggle id="cp-lead" label={t("lead_mobile")} text={t("lead_mobile_d")} t={t} checked={form.lead_mobile} onChange={(v) => set("lead_mobile", v)} />
            <Toggle id="cp-shortcuts" label={t("shortcuts")} text={t("shortcuts_d")} t={t} checked={form.shortcuts} onChange={(v) => set("shortcuts", v)} />
          </Block>

          <Block title={t("grid_block")} hint={t("grid_block_h")} t={t}>
            <Radio name="cp-card" title={t("card")} hint={t("card_h")} t={t} value={form.card} onChange={(v) => set("card", v)} options={[
              { value: "clean", label: t("card_clean"), text: t("card_clean_d") },
              { value: "photo", label: t("card_photo"), text: t("card_photo_d") },
            ]} />
            <Radio name="cp-cols" title={t("columns")} hint={t("columns_h")} t={t} value={String(form.columns) as "3" | "4"} onChange={(v) => set("columns", v === "3" ? 3 : 4)} options={[
              { value: "4", label: t("columns_4"), text: t("columns_4_d") },
              { value: "3", label: t("columns_3"), text: t("columns_3_d") },
            ]} />
            <Toggle id="cp-featured" label={t("featured_badge")} text={t("featured_badge_d")} t={t} checked={form.featured_badge} onChange={(v) => set("featured_badge", v)} />
          </Block>

          <Block title={t("filters_block")} hint={t("filters_block_h")} t={t}>
            <Radio name="cp-filters" title={t("filters")} hint={t("filters_h")} t={t} value={form.filters} onChange={(v) => set("filters", v)} options={[
              { value: "sidebar", label: t("filters_sidebar"), text: t("filters_sidebar_d") },
              { value: "button", label: t("filters_button"), text: t("filters_button_d") },
            ]} />
          </Block>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" asChild>
              <Link to="/produtos" target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("open_catalog")}</Link>
            </Button>
            <div className="flex flex-wrap gap-2">
              {dirty && <Button variant="ghost" onClick={() => saved && setForm(saved)}><Undo2 className="mr-1.5 h-4 w-4" />{t("undo")}</Button>}
              <Button onClick={submit} disabled={!dirty || save.isPending}>
                {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
              </Button>
            </div>
          </div>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start" aria-label={t("preview")}>
          <Preview s={form} t={t} />
        </aside>
      </div>
    </div>
  );
}

function Block({ title, hint, t, children }: { title: string; hint: string; t: T; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border bg-card p-5">
      <h2 className="flex items-center text-base font-semibold">{title}<HelpTip label={t("help")} text={hint} /></h2>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-3 divide-y">{children}</div>
    </section>
  );
}

function Toggle({ id, label, text, checked, onChange, t }: { id: string; label: string; text: string; checked: boolean; onChange: (v: boolean) => void; t: T }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="flex items-center text-sm font-semibold">{label}<HelpTip label={t("help")} text={text} /></label>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

function Radio<V extends string>({ name, title, hint, value, onChange, options, t }: {
  name: string; title: string; hint: string; value: V; onChange: (v: V) => void; options: { value: V; label: string; text: string }[]; t: T;
}) {
  return (
    <fieldset className="py-3">
      <legend className="flex items-center text-sm font-semibold">{title}<HelpTip label={t("help")} text={hint} /></legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 transition-colors duration-150", value === o.value ? "border-primary bg-accent" : "hover:border-foreground/30")}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.text}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PresetCard({ active, title, text, onClick }: { active: boolean; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn("flex items-start gap-3 rounded-[14px] border p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-accent" : "hover:border-foreground/30")}>
      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border", active ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
        {active && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

/** Prévia desenhada (não usa o site): cabeçalho da categoria, filtros e uma linha da grade. */
function Preview({ s, t }: { s: CatalogPageSettings; t: T }) {
  const { money } = useAdminFormat();
  const bar = "h-1.5 rounded-full bg-foreground/10";
  const cols = s.columns + (s.filters === "button" ? 0 : -1);
  const prices = [89.9, 189.9, 69.9, 129.9];
  return (
    <div className="space-y-3 rounded-[18px] border bg-background p-4 text-[11px]">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("preview")}</p>
      {s.header === "compact" ? (
        <div className="flex items-center gap-2">
          <span className="h-9 w-9 shrink-0 rounded-[8px] bg-foreground/10" />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-tight">{t("preview_title")}</span>
            <span className="text-muted-foreground">{t("preview_count")}</span>
          </span>
        </div>
      ) : (
        <div className="flex h-16 items-end rounded-[8px] bg-brand-ink p-2 text-white">
          <span><span className="block text-[17px] font-semibold leading-tight">{t("preview_title")}</span><span className="text-white/70">{t("preview_count")}</span></span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        {s.filters === "button"
          ? <span className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 font-medium"><SlidersHorizontal className="h-3 w-3" />{t("preview_filters")}</span>
          : <span />}
        <span className="rounded-full bg-brand-ink px-2 py-1 font-medium text-white">{t("preview_sort")}</span>
      </div>
      <div className={cn("grid gap-2", s.filters === "sidebar" && "grid-cols-[52px_minmax(0,1fr)]")}>
        {s.filters === "sidebar" && (
          <div className="space-y-1.5 pt-1">
            <p className="font-semibold uppercase text-muted-foreground">{t("preview_filters")}</p>
            {[0, 1, 2, 3].map((i) => <span key={i} className={cn(bar, "block")} />)}
          </div>
        )}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, i) => (
            s.card === "clean" ? (
              <div key={i} className="min-w-0">
                <div className="relative aspect-[4/5] rounded-[6px] bg-foreground/10">
                  <Heart className="absolute right-1 top-1 h-2.5 w-2.5 text-muted-foreground" />
                  {s.featured_badge && i === 0 && <span className="absolute left-1 top-1 rounded-full bg-brand-ink px-1 text-[7px] font-semibold uppercase text-white">{t("preview_badge")}</span>}
                </div>
                <span className={cn(bar, "mt-1.5 block w-4/5")} />
                <span className="mt-1 flex items-center justify-between gap-1">
                  <span className="truncate text-[9px] font-semibold tabular-nums">{money(prices[i % 4])}</span>
                  <ShoppingBag className="h-2.5 w-2.5 shrink-0" />
                </span>
              </div>
            ) : (
              <div key={i} className="relative flex aspect-[4/5] min-w-0 flex-col justify-end rounded-[6px] bg-gradient-to-t from-brand-ink to-brand-ink/40 p-1 text-white">
                {s.featured_badge && i === 0 && <span className="absolute left-1 top-1 rounded-full bg-white/20 px-1 text-[7px] font-semibold uppercase">{t("preview_badge")}</span>}
                <span className="block h-1.5 w-4/5 rounded-full bg-white/40" />
                <span className="mt-1 truncate text-[9px] font-semibold tabular-nums">{money(prices[i % 4])}</span>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
