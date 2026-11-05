// Admin > Frete e entrega > Calculadora no site: como a calculadora de frete aparece na página do produto
// (store_settings.shipping_estimate, src/lib/shippingEstimate.ts; loja em src/components/product/ShippingEstimate.tsx).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import HelpTip from "./HelpTip";
import { adminHref } from "./shell/adminSections";
import { useShippingEstimateSettings, useSaveShippingEstimateSettings } from "@/hooks/useOfferSettings";
import { useFeature } from "@/hooks/useFeatures";
import { useHasShippingServices } from "@/hooks/useShippingQuote";
import { useMessages } from "@/i18n";
import { shippingEstimateMessages } from "@/i18n/shippingEstimate";
import { DEFAULT_SHIPPING_ESTIMATE, type ShippingEstimateSettings as Settings, type ShippingEstimateStyle } from "@/lib/shippingEstimate";
import { cn } from "@/lib/utils";

export default function ShippingEstimateSettings() {
  const { t } = useMessages(shippingEstimateMessages);
  const on = useFeature("shipping_estimate");
  const { data: hasServices } = useHasShippingServices();
  const { data: saved, isLoading } = useShippingEstimateSettings();
  const save = useSaveShippingEstimateSettings();
  const [form, setForm] = useState<Settings>(DEFAULT_SHIPPING_ESTIMATE);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && JSON.stringify(saved) !== JSON.stringify(form);
  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>;

  const styles: { value: ShippingEstimateStyle; label: string; text: string }[] = [
    { value: "box", label: t("a_style_box"), text: t("a_style_box_d") },
    { value: "link", label: t("a_style_link"), text: t("a_style_link_d") },
    { value: "off", label: t("a_style_off"), text: t("a_style_off_d") },
  ];

  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">{t("a_title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("a_help")}</p>
      </div>
      {!on && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />{t("a_feature_off")}
          <Link to={adminHref.section("features")} className="font-semibold underline">{t("a_feature_link")}</Link>
        </p>
      )}
      {hasServices === false && <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />{t("a_no_services")}</p>}

      <fieldset>
        <legend className="flex items-center text-sm font-semibold">{t("a_style")}<HelpTip label={t("a_help_label")} text={t("a_style_h")} /></legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {styles.map((o) => (
            <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 transition-colors duration-150", form.product === o.value ? "border-primary bg-accent" : "hover:border-foreground/30")}>
              <input type="radio" name="ship-est-style" checked={form.product === o.value} onChange={() => setForm((f) => ({ ...f, product: o.value }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
              <span><span className="block text-sm font-semibold">{o.label}</span><span className="block text-xs text-muted-foreground">{o.text}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="flex items-center text-sm font-semibold">{t("a_days")}<HelpTip label={t("a_help_label")} text={t("a_days_h")} /></span>
          <span className="block text-xs text-muted-foreground">{t("a_days_h")}</span>
        </span>
        <Switch checked={form.showDays} onCheckedChange={(v) => setForm((f) => ({ ...f, showDays: v }))} aria-label={t("a_days")} />
      </label>

      <div>
        <label htmlFor="ship-est-max" className="flex items-center text-sm font-semibold">{t("a_max")}<HelpTip label={t("a_help_label")} text={t("a_max_h")} /></label>
        <Input id="ship-est-max" type="number" min={1} max={6} step={1} value={form.maxOptions} className="mt-1.5 max-w-[120px]"
          onChange={(e) => setForm((f) => ({ ...f, maxOptions: Math.min(6, Math.max(1, Math.round(Number(e.target.value) || 1))) }))} />
        <p className="mt-1 text-xs text-muted-foreground">{t("a_max_h")}</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate(form, { onSuccess: () => toast.success(t("a_saved")), onError: () => toast.error(t("a_save_error")) })} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("a_save")}
        </Button>
      </div>
    </section>
  );
}
