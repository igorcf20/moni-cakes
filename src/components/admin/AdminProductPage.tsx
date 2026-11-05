// =====================================================================================
// Admin > Aparência da loja > Página do produto: como a página de cada produto se organiza (store_settings.product_page,
// regras em src/lib/productPage.ts). Modelos Recomendado e Clássico, um bloco por área (compra, garantias, detalhes,
// barras) com explicação e dica, e uma prévia desenhada ao lado que muda na hora. Sem janelas.
// =====================================================================================
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, GitCompareArrows, Heart, Loader2, Minus, Plus, RotateCcw, Save, Share2, ShieldCheck, Truck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { useProductPageSettings, useSaveProductPageSettings } from "@/hooks/useOfferSettings";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useMessages } from "@/i18n";
import { adminProductPageMessages, type AdminProductPageT as T } from "@/i18n/adminProductPage";
import { CLASSIC_PRODUCT_PAGE, DEFAULT_PRODUCT_PAGE, sameProductPage, type ProductPageSettings } from "@/lib/productPage";
import { cn } from "@/lib/utils";

export default function AdminProductPage() {
  const { t: tr } = useMessages(adminProductPageMessages);
  const t = tr as T;
  const { data: saved, isLoading } = useProductPageSettings();
  const save = useSaveProductPageSettings();
  const [form, setForm] = useState<ProductPageSettings>(DEFAULT_PRODUCT_PAGE);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && !sameProductPage(saved, form);
  const set = <K extends keyof ProductPageSettings>(k: K, v: ProductPageSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTrust = <K extends keyof ProductPageSettings["trust"]>(k: K, v: ProductPageSettings["trust"][K]) => setForm((f) => ({ ...f, trust: { ...f.trust, [k]: v } }));
  const preset = sameProductPage(form, DEFAULT_PRODUCT_PAGE) ? "new" : sameProductPage(form, CLASSIC_PRODUCT_PAGE) ? "classic" : "custom";
  const submit = () => save.mutate(form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>;

  return (
    <div className="space-y-5">
      <AdminHelp id="product-page" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-[18px] border bg-card p-5">
            <h2 className="flex items-center text-base font-semibold">{t("preset")}<HelpTip label={t("help")} text={t("preset_h")} /></h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <PresetCard active={preset === "new"} title={t("preset_new")} text={t("preset_new_d")} onClick={() => setForm(DEFAULT_PRODUCT_PAGE)} />
              <PresetCard active={preset === "classic"} title={t("preset_classic")} text={t("preset_classic_d")} onClick={() => setForm(CLASSIC_PRODUCT_PAGE)} />
            </div>
            {preset === "custom" && <p className="mt-3 text-xs font-medium text-muted-foreground">{t("preset_custom")}</p>}
          </section>

          <Block title={t("buy")} hint={t("buy_h")} t={t}>
            <Radio name="pp-actions" title={t("actions")} hint={t("actions_h")} t={t} value={form.actions} onChange={(v) => set("actions", v)} options={[
              { value: "compact", label: t("actions_compact"), text: t("actions_compact_d") },
              { value: "full", label: t("actions_full"), text: t("actions_full_d") },
            ]} />
            <Toggle id="pp-qty" label={t("quantity_inline")} text={t("quantity_inline_d")} t={t} checked={form.quantity_inline} onChange={(v) => set("quantity_inline", v)} />
            <Toggle id="pp-av" label={t("availability")} text={t("availability_d")} t={t} checked={form.availability} onChange={(v) => set("availability", v)} />
            <Toggle id="pp-specs" label={t("quick_specs")} text={t("quick_specs_d")} t={t} checked={form.quick_specs} onChange={(v) => set("quick_specs", v)} />
            <Toggle id="pp-share" label={t("share")} text={t("share_d")} t={t} checked={form.share} onChange={(v) => set("share", v)} />
          </Block>

          <Block title={t("trust")} hint={t("trust_h")} t={t}>
            <Toggle id="pp-trust" label={t("trust_on")} text={t("trust_on_d")} t={t} checked={form.trust.on} onChange={(v) => setTrust("on", v)} />
            {form.trust.on && (
              <>
                <Radio name="pp-trust-style" title={t("format")} hint={t("trust_format_h")} t={t} value={form.trust.style} onChange={(v) => setTrust("style", v)} options={[
                  { value: "card", label: t("trust_card"), text: t("trust_card_d") },
                  { value: "list", label: t("trust_list"), text: t("trust_list_d") },
                ]} />
                <Toggle id="pp-returns" label={t("trust_returns")} text={t("trust_returns_d")} t={t} checked={form.trust.returns} onChange={(v) => setTrust("returns", v)} />
                <Toggle id="pp-pay" label={t("trust_payments")} text={t("trust_payments_d")} t={t} checked={form.trust.payments} onChange={(v) => setTrust("payments", v)} />
              </>
            )}
          </Block>

          <Block title={t("details")} hint={t("details_h")} t={t}>
            <Radio name="pp-details" title={t("format")} hint={t("details_format_h")} t={t} value={form.details} onChange={(v) => set("details", v)} options={[
              { value: "sections", label: t("details_sections"), text: t("details_sections_d") },
              { value: "tabs", label: t("details_tabs"), text: t("details_tabs_d") },
            ]} />
          </Block>

          <Block title={t("bars")} hint={t("bars_h")} t={t}>
            <Toggle id="pp-dbar" label={t("desktop_bar")} text={t("desktop_bar_d")} t={t} checked={form.desktop_bar} onChange={(v) => set("desktop_bar", v)} />
            <Toggle id="pp-mphoto" label={t("mobile_bar_photo")} text={t("mobile_bar_photo_d")} t={t} checked={form.mobile_bar_photo} onChange={(v) => set("mobile_bar_photo", v)} />
          </Block>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" asChild>
              <Link to="/produtos" target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("open_product")}</Link>
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

/** Prévia desenhada (não usa o site): área de compra, garantias, parte de baixo e barra de compra. */
function Preview({ s, t }: { s: ProductPageSettings; t: T }) {
  const { money } = useAdminFormat();
  const bar = "h-1.5 rounded-full bg-foreground/10";
  return (
    <div className="space-y-3 rounded-[18px] border bg-background p-4 text-[11px]">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("preview")}</p>
      <div className="space-y-3 rounded-[14px] border bg-white p-3">
        <div className="h-20 rounded-[10px] bg-brand-alt" />
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[13px] font-semibold leading-tight">{t("preview_name")}</p>
            {s.share && <Share2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </div>
          <p className="text-[13px] font-bold tabular-nums">{money(89.9)}</p>
          {s.availability && <p className="flex items-center gap-1 font-medium text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />{t("preview_stock")}</p>}
          {s.quick_specs && <div className="grid grid-cols-2 gap-1">{[0, 1].map((i) => <span key={i} className="h-5 rounded-md border bg-background" />)}</div>}
          {!s.quantity_inline && <Stepper />}
          <div className="flex gap-1">
            {s.quantity_inline && <Stepper />}
            <span className="flex min-w-0 flex-1 items-center justify-center truncate rounded-full bg-primary px-2 py-1.5 font-semibold text-primary-foreground">{t("preview_add")}</span>
          </div>
          <div className={cn(s.actions === "compact" ? "flex gap-1" : "space-y-1")}>
            <span className="flex flex-1 items-center justify-center gap-1 rounded-full border py-1"><Heart className="h-3 w-3" />{s.actions === "compact" ? t("preview_fav") : null}</span>
            <span className="flex flex-1 items-center justify-center gap-1 rounded-full border py-1"><GitCompareArrows className="h-3 w-3" />{t("preview_compare")}</span>
          </div>
          {s.trust.on && (s.trust.style === "card" ? (
            <div className="divide-y rounded-[8px] border">
              {[Truck, ...(s.trust.returns ? [RotateCcw] : []), ShieldCheck].map((Icon, i) => (
                <div key={i} className="flex items-center gap-1.5 p-1.5"><Icon className="h-3 w-3 shrink-0" /><span className={cn(bar, "flex-1")} /></div>
              ))}
              {s.trust.payments && <div className="flex gap-1 p-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-3 w-5 rounded-sm border" />)}</div>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 border-t pt-1.5">
              {[Truck, ShieldCheck].map((Icon, i) => <span key={i} className="flex items-center gap-1"><Icon className="h-3 w-3" /><span className={cn(bar, "flex-1")} /></span>)}
            </div>
          ))}
        </div>
      </div>
      {s.details === "sections" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-[1.4fr_1fr] gap-2">
            <div className="space-y-1 rounded-[10px] border bg-white p-2"><p className="font-semibold">{t("preview_about")}</p><span className={cn(bar, "block")} /><span className={cn(bar, "block w-3/4")} /></div>
            <div className="space-y-1 rounded-[10px] border bg-white p-2"><p className="font-semibold">{t("preview_specs")}</p><span className={cn(bar, "block")} /><span className={cn(bar, "block")} /></div>
          </div>
          <div className="rounded-[10px] border bg-white p-2"><p className="font-semibold">{t("preview_reviews")}</p></div>
        </div>
      ) : (
        <div className="rounded-[10px] border bg-white p-2">
          <div className="flex gap-3 border-b pb-1 font-semibold"><span className="border-b-2 border-primary">{t("preview_desc")}</span><span className="text-muted-foreground">{t("preview_specs")}</span><span className="text-muted-foreground">{t("preview_reviews")}</span></div>
          <span className={cn(bar, "mt-2 block")} />
        </div>
      )}
      {s.desktop_bar && (
        <div className="flex items-center gap-2 rounded-[10px] border bg-white p-1.5 shadow-sm">
          <span className="h-6 w-6 rounded-md bg-brand-alt" />
          <span className="flex-1 truncate font-semibold">{t("preview_name")}</span>
          <span className="font-bold tabular-nums">{money(89.9)}</span>
          <span className="rounded-full bg-primary px-2 py-1 font-semibold text-primary-foreground">{t("preview_add")}</span>
        </div>
      )}
    </div>
  );
}

function Stepper() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1">
      <Minus className="h-2.5 w-2.5" /><span className="font-semibold">1</span><Plus className="h-2.5 w-2.5" />
    </span>
  );
}
