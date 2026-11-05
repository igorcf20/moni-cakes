// =====================================================================================
// Aba "Quando e onde aparece" da página do pop-up: posição na tela, fundo escurecido, animação, modo discreto
// (canto sem escurecer + botão para reabrir), gatilho, páginas, aparelhos, público, frequência, países, idiomas,
// datas e prioridade. Regras em src/lib/leadPopups.ts (popupBlocked, pageAllowed).
// =====================================================================================
import { Clock, Eye, Globe2, LayoutGrid, MousePointer2, Sparkles, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorPick, Field, Group, L10nField, NumberSlider, Segmented, SwitchRow, type PT } from "./fields";
import type { SetContent } from "./PopupBuilder";
import { LOCALE_NAMES } from "@/i18n";
import { countryName, useCountries } from "@/lib/countries";
import {
  POPUP_LOCALES, type Device, type PopupContent, type PopupLocale, type PopupRules, type ScreenPosition, type Trigger,
} from "@/lib/leadPopups";
import { cn } from "@/lib/utils";

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const lines = (v: string) => v.split(/\n+/).map((s) => s.trim()).filter(Boolean);

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors duration-150",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50")}>
      {children}
    </button>
  );
}

export default function PopupDisplay({ t, content, setContent, rules, setRules, startsAt, endsAt, setDates, priority, setPriority, locale }: {
  t: PT;
  content: PopupContent;
  setContent: SetContent;
  rules: PopupRules;
  setRules: (r: PopupRules) => void;
  startsAt: string | null;
  endsAt: string | null;
  setDates: (s: string | null, e: string | null) => void;
  priority: number;
  setPriority: (n: number) => void;
  locale: PopupLocale;
}) {
  const { data: countries = [] } = useCountries();
  const set = (patch: Partial<PopupRules>) => setRules({ ...rules, ...patch });
  const setC = (patch: Partial<PopupContent>) => setContent((c) => ({ ...c, ...patch }), { checkpoint: true });
  const discreet = !content.backdrop.show && content.position.desktop !== "center" && content.teaser.enabled;
  const positions: { value: ScreenPosition; label: string }[] = [
    { value: "center", label: t("pos_center") }, { value: "bottom-right", label: t("pos_bottom_right") }, { value: "bottom-left", label: t("pos_bottom_left") },
    { value: "bottom", label: t("pos_bottom") }, { value: "top", label: t("pos_top") },
  ];
  const triggers: { value: Trigger; label: string; hint: string }[] = [
    { value: "delay", label: t("trigger_delay"), hint: t("trigger_delay_d") },
    { value: "scroll", label: t("trigger_scroll"), hint: t("trigger_scroll_d") },
    { value: "exit", label: t("trigger_exit"), hint: t("trigger_exit_d") },
    { value: "immediate", label: t("trigger_immediate"), hint: t("trigger_immediate_d") },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Group title={t("g_screen")} tip={t("g_screen_tip")} icon={LayoutGrid}>
          <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3", discreet ? "border-primary bg-accent" : "bg-background/60")}>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">{t("discreet")}</p>
              <p className="text-xs text-muted-foreground">{t("discreet_d")}</p>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setC({
                position: { desktop: "bottom-right", mobile: "bottom" }, backdrop: { ...content.backdrop, show: false }, animation: "slide",
                teaser: { ...content.teaser, enabled: true },
              })} className={cn("h-8 rounded-lg px-3 text-xs font-semibold", discreet ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-muted")}>{t("discreet_on")}</button>
              <button type="button" onClick={() => setC({
                position: { desktop: "center", mobile: "center" }, backdrop: { ...content.backdrop, show: true }, animation: "zoom",
              })} className={cn("h-8 rounded-lg px-3 text-xs font-semibold", !discreet && content.position.desktop === "center" ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-muted")}>{t("highlight_on")}</button>
            </div>
          </div>
          {(["desktop", "mobile"] as Device[]).map((d) => (
            <Field key={d} label={t(d === "desktop" ? "position_desktop" : "position_mobile")} tip={t("position_tip")}>
              <Select value={content.position[d]} onValueChange={(v) => setC({ position: { ...content.position, [d]: v as ScreenPosition } })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{positions.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          ))}
          <SwitchRow label={t("backdrop_show")} hint={t("backdrop_show_d")} checked={content.backdrop.show} onChange={(show) => setC({ backdrop: { ...content.backdrop, show } })} />
          {content.backdrop.show && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <ColorPick label={t("backdrop_color")} value={content.backdrop.color} allowEmpty={false} onChange={(color) => setC({ backdrop: { ...content.backdrop, color } })} />
                <NumberSlider label={t("backdrop_opacity")} value={content.backdrop.opacity} min={0} max={95} onChange={(opacity) => setContent((c) => ({ ...c, backdrop: { ...c.backdrop, opacity } }))} suffix="%" />
              </div>
              <SwitchRow label={t("backdrop_blur")} hint={t("backdrop_blur_d")} checked={content.backdrop.blur} onChange={(blur) => setC({ backdrop: { ...content.backdrop, blur } })} />
              <SwitchRow label={t("backdrop_click")} hint={t("backdrop_click_d")} checked={content.backdrop.closeOnClick} onChange={(closeOnClick) => setC({ backdrop: { ...content.backdrop, closeOnClick } })} />
            </>
          )}
          <Field label={t("animation")} tip={t("animation_tip")}>
            <Segmented label={t("animation")} full size="sm" value={content.animation} onChange={(animation) => setC({ animation })} options={[
              { value: "zoom", label: t("anim_zoom") }, { value: "fade", label: t("anim_fade") }, { value: "slide", label: t("anim_slide") }, { value: "none", label: t("anim_none") },
            ]} />
          </Field>
        </Group>

        <Group title={t("g_teaser")} tip={t("g_teaser_tip")} icon={Sparkles}>
          <SwitchRow label={t("teaser_on")} hint={t("teaser_on_d")} checked={content.teaser.enabled} onChange={(enabled) => setC({ teaser: { ...content.teaser, enabled } })} />
          {content.teaser.enabled && (
            <>
              <L10nField label={t("teaser_text")} value={content.teaser.text} onChange={(text) => setContent((c) => ({ ...c, teaser: { ...c.teaser, text } }))} locale={locale} max={60} />
              <Field label={t("teaser_side")}>
                <Segmented label={t("teaser_side")} size="sm" value={content.teaser.side} onChange={(side) => setC({ teaser: { ...content.teaser, side } })} options={[
                  { value: "left", label: t("side_left") }, { value: "right", label: t("side_right") },
                ]} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <ColorPick label={t("color_button")} value={content.teaser.bg} onChange={(bg) => setC({ teaser: { ...content.teaser, bg } })} />
                <ColorPick label={t("color_text")} value={content.teaser.color} onChange={(color) => setC({ teaser: { ...content.teaser, color } })} />
              </div>
            </>
          )}
        </Group>
      </div>

      <div className="space-y-4">
        <Group title={t("g_trigger")} tip={t("g_trigger_tip")} icon={MousePointer2}>
          <div role="radiogroup" aria-label={t("g_trigger")} className="grid gap-2 sm:grid-cols-2">
            {triggers.map((x) => (
              <button key={x.value} type="button" role="radio" aria-checked={rules.trigger === x.value} onClick={() => set({ trigger: x.value })}
                className={cn("rounded-xl border p-2.5 text-left transition-colors duration-150", rules.trigger === x.value ? "border-primary bg-accent ring-1 ring-primary" : "bg-card hover:border-primary/40")}>
                <span className="block text-[13px] font-semibold">{x.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{x.hint}</span>
              </button>
            ))}
          </div>
          {(rules.trigger === "delay" || rules.trigger === "exit") && (
            <NumberSlider label={t(rules.trigger === "exit" ? "exit_mobile_delay" : "delay_seconds")} tip={t(rules.trigger === "exit" ? "exit_mobile_delay_tip" : "delay_seconds_tip")}
              value={rules.delay} min={0} max={120} onChange={(delay) => set({ delay })} suffix="s" />
          )}
          {rules.trigger === "scroll" && <NumberSlider label={t("scroll_percent")} tip={t("scroll_percent_tip")} value={rules.scroll} min={5} max={100} step={5} onChange={(scroll) => set({ scroll })} suffix="%" />}
          <SwitchRow label={t("wait_consent")} hint={t("wait_consent_d")} checked={rules.waitConsent} onChange={(waitConsent) => set({ waitConsent })} />
        </Group>

        <Group title={t("g_pages")} tip={t("g_pages_tip")} icon={Eye}>
          <Field label={t("pages")}>
            <Select value={rules.pages} onValueChange={(v) => set({ pages: v as PopupRules["pages"] })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{(["all", "home", "catalog", "products", "custom"] as const).map((p) => <SelectItem key={p} value={p}>{t(`pages_${p}`)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {rules.pages === "custom" && (
            <Field label={t("include")} tip={t("paths_tip")} hint={t("include_hint")}>
              <Textarea rows={3} defaultValue={rules.include.join("\n")} onBlur={(e) => set({ include: lines(e.target.value) })} placeholder={"/\n/produtos*\n/categoria/decoracao"} className="font-mono text-xs" />
            </Field>
          )}
          <Field label={t("exclude")} tip={t("paths_tip")} hint={t("exclude_hint")}>
            <Textarea rows={3} defaultValue={rules.exclude.join("\n")} onBlur={(e) => set({ exclude: lines(e.target.value) })} placeholder={"/checkout*\n/carrinho*"} className="font-mono text-xs" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <SwitchRow label={t("device_desktop")} checked={rules.devices.desktop} onChange={(v) => set({ devices: { ...rules.devices, desktop: v } })} />
            <SwitchRow label={t("device_mobile")} checked={rules.devices.mobile} onChange={(v) => set({ devices: { ...rules.devices, mobile: v } })} />
          </div>
        </Group>

        <Group title={t("g_audience")} tip={t("g_audience_tip")} icon={Users}>
          <Field label={t("audience")}>
            <Segmented label={t("audience")} full size="sm" value={rules.audience} onChange={(audience) => set({ audience })} options={[
              { value: "all", label: t("aud_all") }, { value: "guests", label: t("aud_guests") }, { value: "customers", label: t("aud_customers") },
            ]} />
          </Field>
          <Field label={t("frequency")} tip={t("frequency_tip")}>
            <Select value={rules.frequency} onValueChange={(v) => set({ frequency: v as PopupRules["frequency"] })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{(["once", "session", "days", "always"] as const).map((f) => <SelectItem key={f} value={f}>{t(`freq_${f}`)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {rules.frequency === "days" && <NumberSlider label={t("freq_days_after")} value={rules.days} min={1} max={90} onChange={(days) => set({ days })} suffix={t("days_suffix")} />}
          <SwitchRow label={t("hide_after_submit")} hint={t("hide_after_submit_d")} checked={rules.hideAfterSubmit} onChange={(hideAfterSubmit) => set({ hideAfterSubmit })} />
        </Group>

        <Group title={t("g_where")} tip={t("g_where_tip")} icon={Globe2}>
          <Field label={t("countries")} hint={t("countries_hint")}>
            <div className="flex flex-wrap gap-1.5">
              {countries.map((c) => (
                <Chip key={c.code} on={rules.countries.includes(c.code)} onClick={() => set({ countries: rules.countries.includes(c.code) ? rules.countries.filter((x) => x !== c.code) : [...rules.countries, c.code] })}>
                  {countryName(c.code, locale)}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label={t("locales")} hint={t("locales_hint")}>
            <div className="flex flex-wrap gap-1.5">
              {POPUP_LOCALES.map((l) => (
                <Chip key={l} on={rules.locales.includes(l)} onClick={() => set({ locales: rules.locales.includes(l) ? rules.locales.filter((x) => x !== l) : [...rules.locales, l] })}>
                  {LOCALE_NAMES[l]}
                </Chip>
              ))}
            </div>
          </Field>
        </Group>

        <Group title={t("g_schedule")} tip={t("g_schedule_tip")} icon={Clock}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("starts_at")}>
              <Input type="datetime-local" value={toLocalInput(startsAt)} onChange={(e) => setDates(fromLocalInput(e.target.value), endsAt)} className="h-9 text-sm" />
            </Field>
            <Field label={t("ends_at")}>
              <Input type="datetime-local" value={toLocalInput(endsAt)} onChange={(e) => setDates(startsAt, fromLocalInput(e.target.value))} className="h-9 text-sm" />
            </Field>
          </div>
          <Field label={t("priority")} tip={t("priority_tip")}>
            <Input inputMode="numeric" value={String(priority)} onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && Math.abs(n) <= 1000) setPriority(n); }} className="h-9 w-28 text-sm" />
          </Field>
        </Group>
      </div>
    </div>
  );
}
