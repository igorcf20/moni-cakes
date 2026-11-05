// =====================================================================================
// Admin > Aparência da loja > Área do cliente: como a conta (/dashboard) aparece para quem compra
// (store_settings.account_page, regras em src/lib/accountPage.ts). Modelos Recomendado e Clássico, um bloco por
// área (topo e menu, resumo, pedidos e favoritos) com explicação e dica, e uma prévia desenhada que muda na hora.
// =====================================================================================
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ExternalLink, Heart, LifeBuoy, Loader2, MapPin, Package, RotateCcw, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { useAccountPageSettings, useSaveAccountPageSettings } from "@/hooks/useAccountPage";
import { useMessages } from "@/i18n";
import { adminAccountPageMessages, type AdminAccountPageT as T } from "@/i18n/adminAccountPage";
import { CLASSIC_ACCOUNT_PAGE, DEFAULT_ACCOUNT_PAGE, sameAccountPage, type AccountPageSettings } from "@/lib/accountPage";
import { cn } from "@/lib/utils";

export default function AdminAccountPage() {
  const { t: tr } = useMessages(adminAccountPageMessages);
  const t = tr as T;
  const { data: saved, isLoading } = useAccountPageSettings();
  const save = useSaveAccountPageSettings();
  const [form, setForm] = useState<AccountPageSettings>(DEFAULT_ACCOUNT_PAGE);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && !sameAccountPage(saved, form);
  const set = <K extends keyof AccountPageSettings>(k: K, v: AccountPageSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setSummary = <K extends keyof AccountPageSettings["summary"]>(k: K, v: boolean) => setForm((f) => ({ ...f, summary: { ...f.summary, [k]: v } }));
  const preset = sameAccountPage(form, DEFAULT_ACCOUNT_PAGE) ? "new" : sameAccountPage(form, CLASSIC_ACCOUNT_PAGE) ? "classic" : "custom";
  const submit = () => save.mutate(form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>;

  return (
    <div className="space-y-5">
      <AdminHelp id="account-page" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-[18px] border bg-card p-5">
            <h2 className="flex items-center text-base font-semibold">{t("preset")}<HelpTip label={t("help")} text={t("preset_h")} /></h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <PresetCard active={preset === "new"} title={t("preset_new")} text={t("preset_new_d")} onClick={() => setForm(DEFAULT_ACCOUNT_PAGE)} />
              <PresetCard active={preset === "classic"} title={t("preset_classic")} text={t("preset_classic_d")} onClick={() => setForm(CLASSIC_ACCOUNT_PAGE)} />
            </div>
            {preset === "custom" && <p className="mt-3 text-xs font-medium text-muted-foreground">{t("preset_custom")}</p>}
          </section>

          <Block title={t("top")} hint={t("top_h")} t={t}>
            <Radio name="ap-header" title={t("header")} hint={t("header_h")} t={t} value={form.header} onChange={(v) => set("header", v)} options={[
              { value: "compact", label: t("header_compact"), text: t("header_compact_d") },
              { value: "large", label: t("header_large"), text: t("header_large_d") },
            ]} />
            <Toggle id="ap-counts" label={t("nav_counts")} text={t("nav_counts_d")} t={t} checked={form.nav_counts} onChange={(v) => set("nav_counts", v)} />
            <Toggle id="ap-hints" label={t("nav_hints")} text={t("nav_hints_d")} t={t} checked={form.nav_hints} onChange={(v) => set("nav_hints", v)} />
            <Toggle id="ap-help" label={t("help_card")} text={t("help_card_d")} t={t} checked={form.help_card} onChange={(v) => set("help_card", v)} />
          </Block>

          <Block title={t("summary")} hint={t("summary_h")} t={t}>
            <Radio name="ap-stats" title={t("stats")} hint={t("stats_h")} t={t} value={form.stats} onChange={(v) => set("stats", v)} cols={3} options={[
              { value: "strip", label: t("stats_strip"), text: t("stats_strip_d") },
              { value: "cards", label: t("stats_cards"), text: t("stats_cards_d") },
              { value: "off", label: t("stats_off"), text: t("stats_off_d") },
            ]} />
            <Radio name="ap-ready" title={t("readiness")} hint={t("readiness_h")} t={t} value={form.readiness} onChange={(v) => set("readiness", v)} cols={3} options={[
              { value: "auto", label: t("readiness_auto"), text: t("readiness_auto_d") },
              { value: "always", label: t("readiness_always"), text: t("readiness_always_d") },
              { value: "off", label: t("readiness_off"), text: t("readiness_off_d") },
            ]} />
            <Toggle id="ap-active" label={t("active_orders")} text={t("active_orders_d")} t={t} checked={form.summary.active_orders} onChange={(v) => setSummary("active_orders", v)} />
            <Toggle id="ap-again" label={t("buy_again")} text={t("buy_again_d")} t={t} checked={form.summary.buy_again} onChange={(v) => setSummary("buy_again", v)} />
            <Toggle id="ap-foryou" label={t("for_you")} text={t("for_you_d")} t={t} checked={form.summary.for_you} onChange={(v) => setSummary("for_you", v)} />
            <Toggle id="ap-create" label={t("create")} text={t("create_d")} t={t} checked={form.summary.create} onChange={(v) => setSummary("create", v)} />
          </Block>

          <Block title={t("orders")} hint={t("orders_h")} t={t}>
            <Radio name="ap-items" title={t("order_items")} hint={t("order_items_h")} t={t} value={form.order_items} onChange={(v) => set("order_items", v)} options={[
              { value: "list", label: t("order_items_list"), text: t("order_items_list_d") },
              { value: "thumbs", label: t("order_items_thumbs"), text: t("order_items_thumbs_d") },
            ]} />
            <Toggle id="ap-rebuy" label={t("order_buy_again")} text={t("order_buy_again_d")} t={t} checked={form.order_buy_again} onChange={(v) => set("order_buy_again", v)} />
            <Toggle id="ap-fav" label={t("favorites_tools")} text={t("favorites_tools_d")} t={t} checked={form.favorites_tools} onChange={(v) => set("favorites_tools", v)} />
          </Block>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" asChild>
              <Link to="/dashboard" target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />{t("open_account")}</Link>
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

function Radio<V extends string>({ name, title, hint, value, onChange, options, t, cols = 2 }: {
  name: string; title: string; hint: string; value: V; onChange: (v: V) => void; options: { value: V; label: string; text: string }[]; t: T; cols?: 2 | 3;
}) {
  return (
    <fieldset className="py-3">
      <legend className="flex items-center text-sm font-semibold">{title}<HelpTip label={t("help")} text={hint} /></legend>
      <div className={cn("mt-2 grid gap-2 sm:grid-cols-2", cols === 3 && "lg:grid-cols-3")}>
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

/** Prévia desenhada (não usa o site): topo, menu, resumo e um pedido entregue. */
function Preview({ s, t }: { s: AccountPageSettings; t: T }) {
  const bar = "h-1.5 rounded-full bg-foreground/10";
  const nav = [
    { label: t("preview_orders"), Icon: Package, n: 1 },
    { label: t("preview_favorites"), Icon: Heart, n: 5 },
    { label: t("preview_addresses"), Icon: MapPin, n: 2 },
  ];
  const stats = [{ label: t("preview_orders"), n: 4 }, { label: t("preview_favorites"), n: 5 }, { label: t("preview_addresses"), n: 2 }];
  return (
    <div className="space-y-3 rounded-[18px] border bg-background p-4 text-[11px]">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("preview")}</p>
      {s.header === "compact" ? (
        <div className="flex items-center gap-2 rounded-[12px] border bg-white p-2">
          <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-primary text-[10px] font-bold text-primary-foreground">A</span>
          <span className="min-w-0 flex-1"><span className="block text-[13px] font-bold leading-tight">{t("preview_hello")}</span><span className="block truncate text-muted-foreground">{t("preview_since")}</span></span>
          <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"><ArrowRight className="h-3 w-3" /></span>
        </div>
      ) : (
        <div className="space-y-2 rounded-[14px] border bg-white p-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary text-xs font-bold text-primary-foreground">A</span>
          <p className="font-editorial text-[24px] leading-none">{t("preview_hello")}</p>
          <span className="block h-6 rounded-full bg-primary" />
        </div>
      )}
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
        <div className="space-y-1 self-start">
          <div className="space-y-0.5 rounded-[10px] border bg-white p-1">
            {nav.map(({ label, Icon, n }) => (
              <div key={label} className="flex items-center gap-1 rounded-[6px] px-1 py-1">
                <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{label}</span>{s.nav_hints && <span className={cn(bar, "mt-0.5 block w-4/5")} />}</span>
                {s.nav_counts && <span className="rounded-full bg-brand-alt px-1 text-[9px] font-semibold">{n}</span>}
              </div>
            ))}
          </div>
          {s.help_card && <div className="flex items-center gap-1 rounded-[10px] bg-brand-alt p-1.5 font-semibold"><LifeBuoy className="h-3 w-3 text-primary" />{t("preview_help")}</div>}
        </div>
        <div className="min-w-0 space-y-1.5">
          {s.stats === "strip" && (
            <div className="grid grid-cols-3 divide-x rounded-[10px] border bg-white">
              {stats.map((x) => <div key={x.label} className="p-1.5"><p className="text-[13px] font-bold leading-none">{x.n}</p><p className="truncate text-[9px]">{x.label}</p></div>)}
            </div>
          )}
          {s.stats === "cards" && (
            <div className="space-y-1">{stats.map((x) => <div key={x.label} className="flex items-center gap-1 rounded-[10px] border bg-white p-1.5"><span className="h-4 w-4 rounded-md bg-accent" /><b>{x.n}</b><span className="truncate">{x.label}</span></div>)}</div>
          )}
          {s.readiness !== "off" && <div className="rounded-[10px] border bg-white p-1.5"><p className="truncate font-semibold">{t("preview_ready")}</p><span className="mt-1 block h-1 rounded-full bg-primary/70" /></div>}
          {s.summary.active_orders && <Row label={t("preview_active")} />}
          {s.summary.buy_again && <Tiles label={t("preview_again")} />}
          {s.summary.for_you && <Tiles label={t("preview_for_you")} />}
          {s.summary.create && <Row label={t("preview_create")} />}
        </div>
      </div>
      <div className="space-y-1.5 rounded-[12px] border bg-white p-2">
        <div className="flex items-center justify-between"><b>#A1B2C3</b><span className="grid h-4 w-4 place-items-center rounded bg-emerald-50 text-emerald-700"><Check className="h-3 w-3" /></span></div>
        {s.order_items === "list" ? (
          <div className="divide-y rounded-[8px] border">
            {[0, 1].map((i) => <div key={i} className="flex items-center gap-1.5 p-1"><span className="h-5 w-5 rounded bg-brand-alt" /><span className={cn(bar, "flex-1")} /><b className="tabular-nums">R$</b></div>)}
          </div>
        ) : (
          <div className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-6 w-6 rounded bg-brand-alt" />)}</div>
        )}
        {s.order_buy_again && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 font-semibold text-primary-foreground"><RotateCcw className="h-2.5 w-2.5" />{t("preview_rebuy")}</span>}
      </div>
    </div>
  );
}

function Row({ label }: { label: string }) {
  return <div className="rounded-[10px] border bg-white p-1.5 font-semibold">{label}</div>;
}

function Tiles({ label }: { label: string }) {
  return (
    <div>
      <p className="mb-0.5 font-semibold">{label}</p>
      <div className="grid grid-cols-4 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className="aspect-[3/4] rounded-[6px] bg-foreground/15" />)}</div>
    </div>
  );
}
