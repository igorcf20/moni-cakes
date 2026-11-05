// =====================================================================================
// Admin > Pagamentos e entrega > Carrinho e checkout: como o carrinho, a gaveta e o checkout aparecem
// (store_settings.checkout_page, regras em src/lib/checkoutPage.ts). Modelos Recomendado e Clássico, um bloco por
// área com explicação e dica, e uma prévia do checkout no celular ao lado que muda na hora. Sem janelas.
// =====================================================================================
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, CheckCircle2, ExternalLink, Loader2, Lock, Pencil, Save, ShieldCheck, Tag, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { useCheckoutPageQuery, useSaveCheckoutPage } from "@/hooks/useCheckoutPage";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useMessages } from "@/i18n";
import { adminCheckoutPageMessages, type AdminCheckoutPageT as T } from "@/i18n/adminCheckoutPage";
import { CLASSIC_CHECKOUT_PAGE, DEFAULT_CHECKOUT_PAGE, sameCheckoutPage, type CheckoutPageSettings } from "@/lib/checkoutPage";
import { cn } from "@/lib/utils";

export default function AdminCheckoutPage() {
  const { t: tr } = useMessages(adminCheckoutPageMessages);
  const t = tr as T;
  const { data: saved, isLoading } = useCheckoutPageQuery();
  const save = useSaveCheckoutPage();
  const [form, setForm] = useState<CheckoutPageSettings>(DEFAULT_CHECKOUT_PAGE);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && !sameCheckoutPage(saved, form);
  const set = <K extends keyof CheckoutPageSettings>(k: K, v: CheckoutPageSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const preset = sameCheckoutPage(form, DEFAULT_CHECKOUT_PAGE) ? "new" : sameCheckoutPage(form, CLASSIC_CHECKOUT_PAGE) ? "classic" : "custom";
  const submit = () => save.mutate(form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>;

  return (
    <div className="space-y-5">
      <AdminHelp id="checkout-page" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-[18px] border bg-card p-5">
            <h2 className="flex items-center text-base font-semibold">{t("preset")}<HelpTip label={t("help")} text={t("preset_h")} /></h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <PresetCard active={preset === "new"} title={t("preset_new")} text={t("preset_new_d")} onClick={() => setForm(DEFAULT_CHECKOUT_PAGE)} />
              <PresetCard active={preset === "classic"} title={t("preset_classic")} text={t("preset_classic_d")} onClick={() => setForm(CLASSIC_CHECKOUT_PAGE)} />
            </div>
            {preset === "custom" && <p className="mt-3 text-xs font-medium text-muted-foreground">{t("preset_custom")}</p>}
          </section>

          <Block title={t("checkout")} hint={t("checkout_h")} t={t}>
            <Radio name="cp-steps" title={t("steps")} hint={t("steps_h")} t={t} value={form.steps} onChange={(v) => set("steps", v)} options={[
              { value: "compact", label: t("steps_compact"), text: t("steps_compact_d") },
              { value: "open", label: t("steps_open"), text: t("steps_open_d") },
            ]} />
            <Toggle id="cp-bar" label={t("mobile_bar")} text={t("mobile_bar_d")} t={t} checked={form.mobile_bar} onChange={(v) => set("mobile_bar", v)} />
            <Radio name="cp-intro" title={t("intro")} hint={t("intro_h")} t={t} value={form.intro} onChange={(v) => set("intro", v)} options={[
              { value: "short", label: t("intro_short"), text: t("intro_short_d") },
              { value: "full", label: t("intro_full"), text: t("intro_full_d") },
            ]} />
          </Block>

          <Block title={t("cart")} hint={t("cart_h")} t={t}>
            <Radio name="cp-coupon" title={t("coupon")} hint={t("coupon_h")} t={t} value={form.coupon} onChange={(v) => set("coupon", v)} options={[
              { value: "link", label: t("coupon_link"), text: t("coupon_link_d") },
              { value: "field", label: t("coupon_field"), text: t("coupon_field_d") },
            ]} />
            <Radio name="cp-lines" title={t("cart_lines")} hint={t("cart_lines_h")} t={t} value={form.cart_lines} onChange={(v) => set("cart_lines", v)} options={[
              { value: "compact", label: t("cart_lines_compact"), text: t("cart_lines_compact_d") },
              { value: "roomy", label: t("cart_lines_roomy"), text: t("cart_lines_roomy_d") },
            ]} />
            <Toggle id="cp-trust" label={t("trust")} text={t("trust_d")} t={t} checked={form.trust} onChange={(v) => set("trust", v)} />
          </Block>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" asChild>
              <Link to="/carrinho" target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("open_checkout")}</Link>
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

/** Prévia desenhada (não usa o site): o checkout de um cliente que volta, num celular. */
function Preview({ s, t }: { s: CheckoutPageSettings; t: T }) {
  const { money } = useAdminFormat();
  const bar = "h-1.5 rounded-full bg-foreground/10";
  const compact = s.steps === "compact";
  const Folded = ({ title }: { title: string }) => (
    <div className="flex items-center gap-2 rounded-[10px] border bg-white px-2 py-1.5">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
      <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className={cn(bar, "mt-1 block w-3/4")} /></span>
      <span className="flex items-center gap-0.5 font-semibold text-brand-orange-text"><Pencil className="h-2.5 w-2.5" />{t("preview_change")}</span>
    </div>
  );
  const Open = ({ n, title, rows = 2 }: { n: number; title: string; rows?: number }) => (
    <div className="space-y-1.5 rounded-[10px] border bg-white p-2">
      <p className="flex items-center gap-1.5 font-semibold"><span className="grid h-4 w-4 place-items-center rounded-full bg-primary text-[9px] text-primary-foreground">{n}</span>{title}</p>
      {Array.from({ length: rows }, (_, i) => <span key={i} className="block h-5 rounded-md border bg-background" />)}
    </div>
  );
  return (
    <div className="space-y-3 rounded-[18px] border bg-background p-4 text-[11px]">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("preview")}</p>
      <div className="relative mx-auto w-full max-w-[260px] overflow-hidden rounded-[22px] border-4 border-foreground/80 bg-background">
        <div className="max-h-[480px] space-y-2 overflow-hidden p-2.5 pb-14">
          {s.intro === "full" && <p className="text-[9px] text-muted-foreground">{t("preview_crumb")}</p>}
          {s.intro === "full" && <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.14em] text-brand-orange-text"><Lock className="h-2.5 w-2.5" />{t("preview_title")}</p>}
          <p className="font-editorial text-[17px] leading-tight">{t("preview_title")}</p>
          {s.intro === "full" && <span className={cn(bar, "block w-5/6")} />}
          {compact ? (
            <>
              <Folded title={t("preview_contact")} />
              <Folded title={t("preview_delivery")} />
              <Folded title={t("preview_address")} />
            </>
          ) : (
            <>
              <Open n={1} title={t("preview_contact")} />
              <Open n={2} title={t("preview_delivery")} />
              <Open n={3} title={t("preview_address")} rows={3} />
            </>
          )}
          <Open n={4} title={t("preview_payment")} />
          <div className="space-y-1.5 rounded-[10px] border bg-white p-2">
            <p className="font-semibold">{t("preview_review")}</p>
            {!compact && <div className="divide-y rounded-md border">{[0, 1, 2].map((i) => <span key={i} className="flex p-1"><span className={cn(bar, "w-2/3")} /></span>)}</div>}
            {s.coupon === "link"
              ? <p className="flex items-center gap-1 font-semibold text-brand-orange-text"><Tag className="h-2.5 w-2.5" />{t("preview_coupon")}</p>
              : <span className="block h-5 rounded-md border bg-background" />}
            <span className="flex items-center justify-center gap-1 rounded-full bg-primary py-1.5 font-semibold text-primary-foreground"><Lock className="h-2.5 w-2.5" />{t("preview_finish")}</span>
            {s.trust && <p className="flex items-center gap-1 text-muted-foreground"><ShieldCheck className="h-3 w-3" /><span className={cn(bar, "flex-1")} /></p>}
          </div>
        </div>
        {s.mobile_bar && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t bg-white p-2 shadow-[0_-6px_16px_-12px_rgba(0,0,0,0.4)]">
            <span className="leading-tight"><span className="block text-[9px] text-muted-foreground">{t("preview_total")}</span><span className="font-bold tabular-nums">{money(428.02)}</span></span>
            <span className="ml-auto flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 font-semibold text-primary-foreground">{t("preview_continue")}<ArrowRight className="h-2.5 w-2.5" /></span>
          </div>
        )}
      </div>
    </div>
  );
}
