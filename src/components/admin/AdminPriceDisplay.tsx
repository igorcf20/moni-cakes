// =====================================================================================
// Admin > Pagamentos e entrega > Exibição de preços (recurso price_display): preço com desconto no Pix (ou outro meio),
// parcelamento e o valor em destaque em cada lugar da loja (store_settings.price_display, src/lib/priceDisplay.ts).
// O percentual do desconto é gravado no próprio meio (payment_config.discount_percent), o mesmo que o create-order
// cobra: o site nunca mostra um preço que o pedido não cobra. Prévia ao lado com as peças do site. Sem janelas.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Heart, Loader2, Save, ShoppingBag, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { adminHref } from "./shell/adminSections";
import { usePriceDisplaySettings, useSavePriceDisplaySettings } from "@/hooks/useOfferSettings";
import { useFeature } from "@/hooks/useFeatures";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useMessages } from "@/i18n";
import { adminPriceDisplayMessages, type AdminPriceDisplayKey } from "@/i18n/adminPriceDisplay";
import { priceDisplayMessages, type PriceDisplayKey } from "@/i18n/priceDisplay";
import { countryName, useCountries } from "@/lib/countries";
import { paymentIconOf } from "@/lib/paymentMethods";
import {
  DEFAULT_PRICE_DISPLAY, PRICE_PLACES, PRICE_PRESETS, cashDiscountFor, priceView,
  type PlaceSettings, type PriceDisplaySettings, type PriceHighlight, type PricePlace,
} from "@/lib/priceDisplay";
import { PriceExtras, PriceMain, type PriceCtx } from "@/components/price/SmartPrice";
import { cn } from "@/lib/utils";

const db = supabase as any;
const PAYMENT_KEY = ["adminPaymentConfig"] as const;

type MethodRow = {
  id: string; type: string; name: string; is_active: boolean; countries: string[] | null;
  discount_percent: number | string | null; min_total: number | string | null; max_total: number | string | null;
};
type T = (k: AdminPriceDisplayKey, v?: Record<string, string | number>) => string;
type Preset = keyof typeof PRICE_PRESETS;

const VIA: Record<string, PriceDisplayKey> = {
  pix: "via_pix", transfer: "via_transfer", mbway: "via_mbway", multibanco: "via_multibanco", bizum: "via_bizum", on_delivery: "via_on_delivery",
};
const samePlaces = (a: Record<PricePlace, PlaceSettings>, b: Record<PricePlace, PlaceSettings>) =>
  PRICE_PLACES.every((k) => a[k].enabled === b[k].enabled && a[k].highlight === b[k].highlight && a[k].style === b[k].style);
const pctOf = (m?: MethodRow) => Math.min(50, Math.max(0, Number(m?.discount_percent) || 0));

export default function AdminPriceDisplay() {
  const { t: tr, locale } = useMessages(adminPriceDisplayMessages);
  const t = tr as T;
  const featureOn = useFeature("price_display");
  const qc = useQueryClient();
  const { data: saved, isLoading } = usePriceDisplaySettings();
  const save = useSavePriceDisplaySettings();
  const methods = useQuery({
    queryKey: PAYMENT_KEY,
    queryFn: async () => {
      const { data, error } = await db.from("payment_config").select("*").order("display_order");
      if (error) throw error;
      return (data ?? []) as MethodRow[];
    },
  });
  const { data: countries = [] } = useCountries();
  const { money } = useAdminFormat();

  const [form, setForm] = useState<PriceDisplaySettings>(DEFAULT_PRICE_DISPLAY);
  const [pct, setPct] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const method = methods.data?.find((m) => m.type === form.cash.method);
  useEffect(() => { setPct(method ? String(pctOf(method)) : ""); }, [method?.id, method?.discount_percent]); // eslint-disable-line react-hooks/exhaustive-deps

  const pctNum = Math.min(50, Math.max(0, Number(pct.replace(",", ".")) || 0));
  const pctDirty = !!method && pctNum !== pctOf(method);
  const dirty = (!!saved && JSON.stringify(saved) !== JSON.stringify(form)) || pctDirty;
  const preset: Preset | "custom" = (Object.keys(PRICE_PRESETS) as Preset[]).find((k) => samePlaces(PRICE_PRESETS[k], form.places)) ?? "custom";

  const setCash = <K extends keyof PriceDisplaySettings["cash"]>(k: K, v: PriceDisplaySettings["cash"][K]) => setForm((f) => ({ ...f, cash: { ...f.cash, [k]: v } }));
  const setInst = <K extends keyof PriceDisplaySettings["installments"]>(k: K, v: PriceDisplaySettings["installments"][K]) => setForm((f) => ({ ...f, installments: { ...f.installments, [k]: v } }));
  const setPlace = (p: PricePlace, patch: Partial<PlaceSettings>) => setForm((f) => ({ ...f, places: { ...f.places, [p]: { ...f.places[p], ...patch } } }));

  const submit = async () => {
    setBusy(true);
    try {
      if (pctDirty && method) {
        const { error } = await db.from("payment_config").update({ discount_percent: pctNum }).eq("id", method.id);
        if (error) throw error;
        await Promise.all([qc.invalidateQueries({ queryKey: PAYMENT_KEY }), qc.invalidateQueries({ queryKey: ["public-payment-methods"] }), qc.invalidateQueries({ queryKey: ["paymentConfigs"] })]);
      }
      await save.mutateAsync(form);
      toast.success(t("saved"));
    } catch {
      toast.error(t("save_error"));
    } finally {
      setBusy(false);
    }
  };
  const undo = () => { if (saved) setForm(saved); setPct(method ? String(pctOf(method)) : ""); };

  if (isLoading || methods.isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>;
  const rows = methods.data ?? [];

  return (
    <div className="space-y-5">
      <AdminHelp id="price-display" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      {!featureOn && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />{t("feature_off")}
          <Link to={adminHref.section("features")} className="font-semibold underline">{t("feature_link")}</Link>
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {/* Modelos prontos */}
          <section className="rounded-[18px] border bg-card p-5">
            <h2 className="flex items-center text-base font-semibold">{t("preset")}<HelpTip label={t("help")} text={t("preset_h")} /></h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(["card", "cash", "installment", "discreet"] as Preset[]).map((k) => (
                <PresetCard key={k} active={preset === k} title={t(`preset_${k}` as AdminPriceDisplayKey)} text={t(`preset_${k}_d` as AdminPriceDisplayKey)}
                  onClick={() => setForm((f) => ({ ...f, places: PRICE_PRESETS[k] }))} />
              ))}
            </div>
            {preset === "custom" && <p className="mt-3 text-xs font-medium text-muted-foreground">{t("preset_custom")}</p>}
          </section>

          {/* Desconto à vista */}
          <section className="rounded-[18px] border bg-card p-5">
            <h2 className="flex items-center text-base font-semibold">{t("cash_title")}<HelpTip label={t("help")} text={t("cash_h")} /></h2>
            <ToggleRow label={t("cash_on")} hint={t("cash_on_h")} checked={form.cash.enabled} onChange={(v) => setCash("enabled", v)} t={t} />
            <div className={cn("space-y-4", !form.cash.enabled && "pointer-events-none opacity-50")} aria-disabled={!form.cash.enabled}>
              <div>
                <p className="flex items-center text-sm font-semibold">{t("cash_method")}<HelpTip label={t("help")} text={t("cash_method_h")} /></p>
                {rows.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">{t("cash_method_none")} <Link to={adminHref.section("payment")} className="font-semibold text-brand-orange-text underline">{t("open_payments")}</Link></p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t("cash_method")}>
                    {rows.map((m) => {
                      const Icon = paymentIconOf(m.type);
                      const active = m.type === form.cash.method;
                      return (
                        <button key={m.id} type="button" role="radio" aria-checked={active} onClick={() => setCash("method", m.type)}
                          className={cn("inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "border-primary bg-accent font-semibold" : "hover:border-foreground/30", !m.is_active && "text-muted-foreground")}>
                          <Icon className="h-4 w-4" strokeWidth={1.8} />{m.name || m.type}
                          {pctOf(m) > 0 && <span className="rounded-md bg-emerald-50 px-1.5 text-[11px] font-bold text-emerald-700">-{pctOf(m)}%</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {rows.length > 0 && !method && <p className="mt-2 text-sm text-amber-800">{t("cash_method_missing")}</p>}
                {method && !method.is_active && (
                  <p className="mt-2 text-sm text-amber-800">{t("cash_method_inactive")} <Link to={adminHref.section("payment")} className="font-semibold underline">{t("open_payments")}</Link></p>
                )}
                {method && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {method.countries?.length ? t("cash_method_countries", { list: method.countries.map((c) => countryName(c, locale)).join(", ") }) : t("cash_method_all")}
                    {Number(method.min_total) > 0 && <> {t("cash_method_min", { amount: money(Number(method.min_total)) })}</>}
                  </p>
                )}
              </div>
              {method && (
                <NumberField id="pd-pct" label={t("cash_pct")} hint={t("cash_pct_h")} value={pct} onChange={setPct} step="0.5" min={0} max={50} t={t}
                  note={pctNum === 0 ? t("cash_pct_zero") : undefined} />
              )}
              <Choice title={t("cash_label")} hint={t("cash_label_h")} t={t} name="pd-label" value={form.cash.label} onChange={(v) => setCash("label", v)}
                options={[
                  { value: "method", label: t("cash_label_method"), text: t("cash_label_method_d") },
                  { value: "cash", label: t("cash_label_cash"), text: t("cash_label_cash_d") },
                ]} />
              <ToggleRow label={t("cash_badge")} hint={t("cash_badge_h")} checked={form.cash.badge} onChange={(v) => setCash("badge", v)} t={t} />
              <ToggleRow label={t("cash_savings")} hint={t("cash_savings_h")} checked={form.cash.savings} onChange={(v) => setCash("savings", v)} t={t} />
            </div>
          </section>

          {/* Parcelamento */}
          <section className="rounded-[18px] border bg-card p-5">
            <h2 className="flex items-center text-base font-semibold">{t("inst_title")}<HelpTip label={t("help")} text={t("inst_h")} /></h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("inst_h")}</p>
            <ToggleRow label={t("inst_on")} hint={t("inst_on_h")} checked={form.installments.enabled} onChange={(v) => setInst("enabled", v)} t={t} />
            <div className={cn("space-y-4", !form.installments.enabled && "pointer-events-none opacity-50")} aria-disabled={!form.installments.enabled}>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField id="pd-max" label={t("inst_max")} hint={t("inst_max_h")} value={String(form.installments.max)} min={1} max={24} step="1" t={t}
                  onChange={(v) => setInst("max", clampInt(v, 1, 24))} />
                <NumberField id="pd-free" label={t("inst_free")} hint={t("inst_free_h")} value={String(form.installments.interestFree)} min={0} max={24} step="1" t={t}
                  onChange={(v) => setInst("interestFree", clampInt(v, 0, 24))} />
                <NumberField id="pd-rate" label={t("inst_rate")} hint={t("inst_rate_h")} value={String(form.installments.monthlyRate)} min={0} max={20} step="0.01" t={t}
                  onChange={(v) => setInst("monthlyRate", clampNum(v, 0, 20))} />
                <NumberField id="pd-min" label={t("inst_min")} hint={t("inst_min_h")} value={String(form.installments.minValue)} min={0} step="0.5" t={t}
                  onChange={(v) => setInst("minValue", clampNum(v, 0, 1_000_000))} />
              </div>
              <Choice title={t("inst_show")} hint={t("inst_show_h")} t={t} name="pd-show" value={form.installments.show} onChange={(v) => setInst("show", v)}
                options={[
                  { value: "free", label: t("inst_show_free"), text: t("inst_show_free_d") },
                  { value: "max", label: t("inst_show_max"), text: t("inst_show_max_d") },
                ]} />
              <ToggleRow label={t("inst_table")} hint={t("inst_table_h")} checked={form.installments.table} onChange={(v) => setInst("table", v)} t={t} />
              <div>
                <p className="flex items-center text-sm font-semibold">{t("inst_countries")}<HelpTip label={t("help")} text={t("inst_countries_h")} /></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {countries.map((c) => {
                    const on = form.installments.countries.includes(c.code);
                    return (
                      <button key={c.code} type="button" aria-pressed={on}
                        onClick={() => setInst("countries", on ? form.installments.countries.filter((x) => x !== c.code) : [...form.installments.countries, c.code])}
                        className={cn("inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-150", on ? "border-primary bg-accent font-semibold" : "hover:border-foreground/30")}>
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}{countryName(c.code, locale)}
                      </button>
                    );
                  })}
                </div>
                {form.installments.countries.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("inst_countries_all")}</p>}
              </div>
            </div>
          </section>

          {/* Onde e como */}
          <section className="rounded-[18px] border bg-card p-5">
            <h2 className="flex items-center text-base font-semibold">{t("places_title")}<HelpTip label={t("help")} text={t("places_h")} /></h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("places_h")}</p>
            <div className="mt-3 divide-y">
              {PRICE_PLACES.map((p) => (
                <PlaceRow key={p} place={p} value={form.places[p]} onChange={(patch) => setPlace(p, patch)} t={t} />
              ))}
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            {dirty && <Button variant="ghost" onClick={undo}><Undo2 className="mr-1.5 h-4 w-4" />{t("undo")}</Button>}
            <Button onClick={() => void submit()} disabled={!dirty || busy}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
            </Button>
          </div>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start" aria-label={t("preview")}>
          <Preview form={form} method={method ? { ...method, discount_percent: pctNum, is_active: true } : undefined} t={t} countries={countries.map((c) => c.code)} />
        </aside>
      </div>
    </div>
  );
}

const clampInt = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const clampNum = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(String(v).replace(",", ".")) || 0));

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

function ToggleRow({ label, hint, checked, onChange, t }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; t: T }) {
  return (
    <label className="mt-3 flex cursor-pointer items-start justify-between gap-4 rounded-[12px] py-1">
      <span className="min-w-0">
        <span className="flex items-center text-sm font-semibold">{label}<HelpTip label={t("help")} text={hint} /></span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function NumberField({ id, label, hint, value, onChange, min, max, step, note, t }: {
  id: string; label: string; hint: string; value: string; onChange: (v: string) => void; min?: number; max?: number; step?: string; note?: string; t: T;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center text-sm font-semibold">{label}<HelpTip label={t("help")} text={hint} /></label>
      <Input id={id} type="number" inputMode="decimal" className="mt-1.5 max-w-[180px] tabular-nums" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1 text-xs text-muted-foreground">{note ?? hint}</p>
    </div>
  );
}

function Choice<V extends string>({ title, hint, value, onChange, options, t, name }: {
  title: string; hint: string; value: V; onChange: (v: V) => void; options: { value: V; label: string; text: string }[]; t: T; name: string;
}) {
  return (
    <fieldset>
      <legend className="flex items-center text-sm font-semibold">{title}<HelpTip label={t("help")} text={hint} /></legend>
      <div className="mt-1 divide-y">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-3 py-2.5">
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

function Segmented<V extends string>({ label, value, onChange, options, disabled }: {
  label: string; value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap rounded-[12px] border bg-background p-0.5", disabled && "pointer-events-none opacity-50")}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("min-h-[36px] rounded-[10px] px-3 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PlaceRow({ place, value, onChange, t }: { place: PricePlace; value: PlaceSettings; onChange: (p: Partial<PlaceSettings>) => void; t: T }) {
  const cartLike = place === "cart" || place === "checkout";
  const label = t(`place_${place}` as AdminPriceDisplayKey);
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{t(`place_${place}_d` as AdminPriceDisplayKey)}</p>
        </div>
        <Switch checked={value.enabled} onCheckedChange={(v) => onChange({ enabled: v })} aria-label={`${t("place_on")}: ${label}`} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {!cartLike && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex items-center text-xs font-semibold text-muted-foreground">{t("hl")}<HelpTip label={t("help")} text={t("hl_h")} /></span>
            <Segmented<PriceHighlight> label={`${t("hl")}: ${label}`} value={value.highlight} onChange={(v) => onChange({ highlight: v })} disabled={!value.enabled}
              options={[{ value: "card", label: t("hl_card") }, { value: "cash", label: t("hl_cash") }, { value: "installment", label: t("hl_installment") }]} />
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2">
          <span className="flex items-center text-xs font-semibold text-muted-foreground">{t("style")}<HelpTip label={t("help")} text={t("style_h")} /></span>
          <Segmented label={`${t("style")}: ${label}`} value={value.style} onChange={(v) => onChange({ style: v })} disabled={!value.enabled}
            options={[{ value: "full", label: t("style_full") }, { value: "discreet", label: t("style_discreet") }]} />
        </span>
      </div>
      {cartLike && <p className="mt-2 text-xs text-muted-foreground">{t("hl_cart_note")}</p>}
    </div>
  );
}

/** Prévia com as peças reais do site (PriceMain / PriceExtras), alimentadas pelo formulário ainda por gravar. */
function Preview({ form, method, t, countries }: { form: PriceDisplaySettings; method?: MethodRow; t: T; countries: string[] }) {
  const { money } = useAdminFormat();
  const { t: ts, locale } = useMessages(priceDisplayMessages);
  const [place, setPlace] = useState<PricePlace>("product");
  const [amount, setAmount] = useState("89.90");
  const [country, setCountry] = useState(countries[0] ?? "BR");
  useEffect(() => { if (countries.length && !countries.includes(country)) setCountry(countries[0]); }, [countries, country]);
  const value = Math.max(0, Number(amount.replace(",", ".")) || 0);
  const via = form.cash.label === "cash" || !method ? ts("via_cash") : ts(VIA[method.type] ?? "via_cash");
  const viewFor = (p: PricePlace) => priceView(value, form, p, { cashPct: cashDiscountFor(method, country, value), countryCode: country });
  const ctxFor = (p: PricePlace): PriceCtx => ({ view: viewFor(p), settings: form, money: (v) => money(v), via, t: ts, locale });
  const ctx = useMemo(() => ctxFor(place), [form, method, place, value, country, via, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const enabled = form.places[place].enabled;

  return (
    <div className="space-y-4 rounded-[18px] border bg-background p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("preview")}</p>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("pv_place")}>
        {PRICE_PLACES.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={place === p} onClick={() => setPlace(p)}
            className={cn("min-h-[34px] rounded-full border px-3 text-xs font-semibold transition-colors duration-150", place === p ? "border-primary bg-accent" : "bg-white hover:border-foreground/30")}>
            {t(`place_${p}` as AdminPriceDisplayKey)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-muted-foreground">{t("pv_price")}
          <Input type="number" inputMode="decimal" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-9 tabular-nums" />
        </label>
        <label className="text-xs font-semibold text-muted-foreground">{t("pv_country")}
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm text-foreground">
            {countries.map((c) => <option key={c} value={c}>{countryName(c, locale)}</option>)}
          </select>
        </label>
      </div>

      <div className="rounded-[16px] border bg-white p-4">
        {place === "card" ? (
          <div className="mx-auto max-w-[220px] overflow-hidden rounded-[16px] border">
            <div className="relative aspect-square bg-brand-alt">
              <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white shadow-sm"><Heart className="h-4 w-4" strokeWidth={1.8} /></span>
              <ShoppingBag className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-primary/50" strokeWidth={1.5} />
            </div>
            <div className="p-3">
              <p className="truncate text-[14px] font-semibold">{t("pv_sample")}</p>
              <div className="mt-2 flex flex-col leading-tight">
                {ctx.view ? <PriceMain ctx={ctx} labelClassName="text-[12px]" className="text-[17px] font-bold tabular-nums" /> : <span className="text-[17px] font-bold tabular-nums">{money(value)}</span>}
                <PriceExtras ctx={ctx} size="card" />
              </div>
            </div>
          </div>
        ) : place === "buyBar" ? (
          <div className="flex items-center gap-3 rounded-[14px] border bg-white/95 p-2.5 shadow-sm">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[18px] font-bold tabular-nums">{ctx.view ? <PriceMain ctx={ctx} labelClassName="text-[12px]" /> : money(value)}</p>
              {ctx.view && <PriceExtras ctx={ctx} size="card" className="[&>*:nth-child(n+2)]:hidden [&>*]:truncate" />}
            </div>
            <span className="flex min-h-[40px] w-[44%] items-center justify-center gap-1.5 rounded-[12px] bg-primary text-[13px] font-semibold text-primary-foreground"><ShoppingBag className="h-4 w-4" /></span>
          </div>
        ) : place === "cart" || place === "checkout" ? (
          <CartPreview ctx={ctx} amount={value} money={money} t={t} place={place} />
        ) : (
          <div>
            <p className="text-[22px] font-[780] leading-tight tracking-[-0.02em]">{t("pv_sample")}</p>
            <div className="mt-2">
              {ctx.view ? <PriceMain ctx={ctx} labelClassName="text-[14px]" className="text-[28px] font-[780] leading-none tracking-[-0.03em] tabular-nums" /> : <span className="text-[28px] font-[780] tabular-nums">{money(value)}</span>}
              <PriceExtras ctx={ctx} />
            </div>
          </div>
        )}
      </div>
      {!enabled ? <p className="text-xs text-muted-foreground">{t("pv_off")}</p>
        : ctx.view && !ctx.view.cash && !ctx.view.installment ? <p className="text-xs text-muted-foreground">{t("pv_nothing")}</p> : null}
    </div>
  );
}

function CartPreview({ ctx, amount, money, t, place }: { ctx: PriceCtx; amount: number; money: (v: number) => string; t: T; place: "cart" | "checkout" }) {
  const v = ctx.view;
  const discreet = v?.style === "discreet";
  const inst = v?.installment;
  return (
    <div>
      <div className="flex items-end justify-between gap-3 border-t pt-3">
        <p className="text-[15px] font-semibold">{t("pv_cart_total")}</p>
        <p className="text-[24px] font-extrabold leading-none tabular-nums">{money(amount)}</p>
      </div>
      {v && place === "checkout" && v.cash && <p className="mt-2 text-right text-[13px] text-emerald-700">{ctx.t("checkout_cash", { via: ctx.via, price: money(v.cash.amount) })}</p>}
      {v && place === "cart" && (
        <div className="mt-2 space-y-0.5 text-right text-[13px] tabular-nums">
          {v.cash && <p className={discreet ? "text-muted-foreground" : "font-semibold text-emerald-700"}>{ctx.t("cart_cash", { via: ctx.via })}: {money(v.cash.amount)}</p>}
          {inst && !(discreet && v.cash) && <p className="text-muted-foreground">{ctx.t(inst.free ? "cart_inst" : "cart_inst_interest", { n: inst.n, value: money(inst.value) })}</p>}
        </div>
      )}
    </div>
  );
}
