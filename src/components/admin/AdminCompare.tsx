// =====================================================================================
// Admin > Catálogo > Comparar produtos (recurso compare): como o botão Comparar aparece na loja
// (store_settings.compare, regras em src/lib/compare.ts). Atalhos Em destaque / Discreto, três escolhas (cartão,
// página do produto, barra) com explicação e uma prévia ao lado que muda na hora. Sem janelas.
// =====================================================================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, GitCompareArrows, Heart, Loader2, Save, ShoppingBag, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { adminHref } from "./shell/adminSections";
import { useCompareSettings, useSaveCompareSettings } from "@/hooks/useOfferSettings";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useMessages } from "@/i18n";
import { adminOffersMessages, type AdminOffersT as T } from "@/i18n/adminOffers";
import {
  DEFAULT_COMPARE_SETTINGS, DISCREET_COMPARE_SETTINGS, isDiscreetCompare,
  type CompareBarStyle, type CompareCardButton, type CompareProductButton, type CompareSettings,
} from "@/lib/compare";
import { cn } from "@/lib/utils";

const same = (a: CompareSettings, b: CompareSettings) => a.card === b.card && a.product === b.product && a.bar === b.bar;

export default function AdminCompare() {
  const { t: tr } = useMessages(adminOffersMessages);
  const t = tr as T;
  const { data: saved, isLoading } = useCompareSettings();
  const save = useSaveCompareSettings();
  const [form, setForm] = useState<CompareSettings>(DEFAULT_COMPARE_SETTINGS);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && !same(saved, form);
  const set = <K extends keyof CompareSettings>(k: K, v: CompareSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const preset = same(form, DEFAULT_COMPARE_SETTINGS) ? "standard" : isDiscreetCompare(form) ? "discreet" : "custom";
  const submit = () => save.mutate(form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>;

  return (
    <div className="space-y-5">
      <AdminHelp id="compare" title={t("cmp_help_title")} steps={[t("cmp_help_1"), t("cmp_help_2"), t("cmp_help_3")]} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="rounded-[18px] border bg-card p-5">
            <h2 className="flex items-center text-base font-semibold">{t("cmp_preset")}<HelpTip label={t("help")} text={t("cmp_preset_h")} /></h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <PresetCard active={preset === "standard"} title={t("cmp_preset_standard")} text={t("cmp_preset_standard_d")} onClick={() => setForm(DEFAULT_COMPARE_SETTINGS)} />
              <PresetCard active={preset === "discreet"} title={t("cmp_preset_discreet")} text={t("cmp_preset_discreet_d")} onClick={() => setForm(DISCREET_COMPARE_SETTINGS)} />
            </div>
            {preset === "custom" && <p className="mt-3 text-xs font-medium text-muted-foreground">{t("cmp_preset_custom")}</p>}
          </section>

          <Choice<CompareCardButton>
            title={t("cmp_card")} hint={t("cmp_card_h")} t={t} value={form.card} onChange={(v) => set("card", v)}
            options={[
              { value: "icon", label: t("cmp_card_icon"), text: t("cmp_card_icon_d") },
              { value: "heart", label: t("cmp_card_heart"), text: t("cmp_card_heart_d") },
              { value: "text", label: t("cmp_card_text"), text: t("cmp_card_text_d") },
              { value: "off", label: t("cmp_card_off"), text: t("cmp_card_off_d") },
            ]}
          />
          <Choice<CompareProductButton>
            title={t("cmp_product")} hint={t("cmp_product_h")} t={t} value={form.product} onChange={(v) => set("product", v)}
            options={[
              { value: "button", label: t("cmp_product_button"), text: t("cmp_product_button_d") },
              { value: "text", label: t("cmp_product_text"), text: t("cmp_product_text_d") },
              { value: "off", label: t("cmp_product_off"), text: t("cmp_product_off_d") },
            ]}
          />
          <Choice<CompareBarStyle>
            title={t("cmp_bar")} hint={t("cmp_bar_h")} t={t} value={form.bar} onChange={(v) => set("bar", v)}
            options={[
              { value: "full", label: t("cmp_bar_full"), text: t("cmp_bar_full_d") },
              { value: "compact", label: t("cmp_bar_compact"), text: t("cmp_bar_compact_d") },
            ]}
          />
          {form.card === "off" && form.product === "off" && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t("cmp_both_off")} <Link to={adminHref.section("features")} className="font-semibold underline">{t("cmp_feature")}</Link>
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {dirty && <Button variant="ghost" onClick={() => saved && setForm(saved)}><Undo2 className="mr-1.5 h-4 w-4" />{t("undo")}</Button>}
            <Button onClick={submit} disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
            </Button>
          </div>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start" aria-label={t("preview")}>
          <Preview s={form} t={t} />
        </aside>
      </div>
    </div>
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

function Choice<V extends string>({ title, hint, value, onChange, options, t }: {
  title: string; hint: string; value: V; onChange: (v: V) => void; options: { value: V; label: string; text: string }[]; t: T;
}) {
  return (
    <fieldset className="rounded-[18px] border bg-card p-5">
      <legend className="sr-only">{title}</legend>
      <p className="flex items-center text-base font-semibold" aria-hidden="true">{title}<HelpTip label={t("help")} text={hint} /></p>
      <div className="mt-2 divide-y">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-3 py-3">
            <input type="radio" name={title} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)}
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

/** Prévia desenhada (não usa o site): cartão de produto, botões da página do produto e a barra. */
function Preview({ s, t }: { s: CompareSettings; t: T }) {
  const { money } = useAdminFormat();
  const compareWord = t("cmp_word");
  return (
    <div className="space-y-4 rounded-[18px] border bg-background p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("preview")}</p>
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <div className="group relative overflow-hidden rounded-[16px] border bg-white">
          <div className="relative aspect-square bg-brand-alt">
            <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white shadow-sm"><Heart className="h-4 w-4" strokeWidth={1.8} /></span>
            {s.card === "icon" && <span className="absolute right-2 top-11 grid h-8 w-8 place-items-center rounded-full bg-white shadow-sm"><GitCompareArrows className="h-4 w-4" strokeWidth={1.8} /></span>}
            {s.card === "heart" && <span className="absolute right-11 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/80"><GitCompareArrows className="h-3.5 w-3.5" strokeWidth={1.8} /></span>}
            <ShoppingBag className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-primary/50" strokeWidth={1.5} />
          </div>
          <div className="space-y-1 p-2.5">
            <p className="truncate text-xs font-semibold">{t("cmp_sample")}</p>
            <p className="text-sm font-bold tabular-nums">{money(89.9)}</p>
            {s.card === "text" && <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><span className="h-3 w-3 rounded-[3px] border bg-white" />{compareWord}</p>}
          </div>
        </div>
        <div className="space-y-1.5 self-center">
          <span className="flex justify-center rounded-[10px] bg-primary py-2 text-primary-foreground"><ShoppingBag className="h-3 w-3" /></span>
          <span className="flex items-center justify-center gap-1 rounded-[10px] border bg-white py-2 text-[11px] font-semibold"><Heart className="h-3 w-3" /></span>
          {s.product === "button" && <span className="flex items-center justify-center gap-1 rounded-[10px] border bg-white py-2 text-[11px] font-semibold"><GitCompareArrows className="h-3 w-3" />{compareWord}</span>}
          {s.product === "text" && <span className="flex items-center justify-center gap-1 py-1 text-[11px] text-muted-foreground"><span className="h-3 w-3 rounded-[3px] border bg-white" />{compareWord}</span>}
        </div>
      </div>
      {s.bar === "full" ? (
        <div className="flex items-center gap-2 rounded-[14px] border bg-white p-2 shadow-sm">
          {[0, 1].map((i) => <span key={i} className="h-8 w-8 rounded-lg bg-brand-alt" />)}
          <X className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex items-center gap-1 rounded-[10px] bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground">{compareWord} (2)<ArrowRight className="h-3 w-3" /></span>
        </div>
      ) : (
        <div className="flex w-fit items-center gap-1 rounded-full border bg-white p-1 shadow-sm">
          <span className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground"><GitCompareArrows className="h-3 w-3" />{compareWord} (2)</span>
          <X className="mx-1 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
