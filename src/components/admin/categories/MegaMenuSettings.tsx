// Admin > Categorias > Menu de categorias (ver=menu): o menu Todas as categorias (store_settings.mega_menu,
// regras em src/lib/megaMenu.ts).
//   MegaMenuSummary   cartão no topo da lista de categorias: o que está em destaque e o botão Configurar
//   MegaMenuSettings  página: modo das categorias em destaque (automático, escolher, sem destaque), quantas ou quais
//                     (com ordem), texto no banner, cartão Novidades, atalhos e celular, com prévia dos banners
import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, ImageOff, LayoutGrid, Loader2, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminSubpage from "../AdminSubpage";
import HelpTip from "../HelpTip";
import { CategoryBanner } from "@/components/header/MegaMenu";
import { useCatalogMenu } from "@/hooks/useCatalogMenu";
import { useMegaMenuSettings, useSaveMegaMenuSettings } from "@/hooks/useOfferSettings";
import { useMessages } from "@/i18n";
import { adminOffersMessages, type AdminOffersT as T } from "@/i18n/adminOffers";
import { layoutMessages } from "@/i18n/layout";
import { mediaUrl } from "@/lib/media";
import { DEFAULT_MEGA_MENU, MEGA_MENU_MAX_FEATURED, pickFeatured, type MegaMenuSettings as Settings } from "@/lib/megaMenu";
import { cn } from "@/lib/utils";

export function MegaMenuSummary({ onOpen }: { onOpen: () => void }) {
  const { t: tr } = useMessages(adminOffersMessages);
  const t = tr as T;
  const menu = useCatalogMenu();
  const { data: s = DEFAULT_MEGA_MENU, isLoading } = useMegaMenuSettings();
  const picked = pickFeatured(menu, s);
  const line = s.featuredMode === "off" || !picked.length
    ? t("mm_summary_off")
    : s.featuredMode === "auto" ? t("mm_summary_auto", { count: picked.length }) : t("mm_summary_manual", { names: picked.map((c) => c.name).join(", ") });
  return (
    <section className="flex flex-col gap-3 rounded-[18px] border bg-card p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-brand-orange-text"><LayoutGrid className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("mm_summary_title")}</p>
        {isLoading ? <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" /> : <p className="truncate text-xs text-muted-foreground">{line}</p>}
      </div>
      <Button variant="outline" onClick={onOpen} className="shrink-0">{t("configure")}<ArrowRight className="ml-1.5 h-4 w-4" /></Button>
    </section>
  );
}

export default function MegaMenuSettings({ onBack }: { onBack: () => void }) {
  const { t: tr } = useMessages(adminOffersMessages);
  const t = tr as T;
  const { t: tl } = useMessages(layoutMessages);
  const menu = useCatalogMenu();
  const { data: saved } = useMegaMenuSettings();
  const save = useSaveMegaMenuSettings();
  const [form, setForm] = useState<Settings>(DEFAULT_MEGA_MENU);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && JSON.stringify(saved) !== JSON.stringify(form);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => save.mutate(form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });
  const preview = pickFeatured(menu, form);
  const full = form.featured.length >= MEGA_MENU_MAX_FEATURED;

  const toggle = (slug: string) => setForm((f) => {
    if (f.featured.includes(slug)) return { ...f, featured: f.featured.filter((s) => s !== slug) };
    if (f.featured.length >= MEGA_MENU_MAX_FEATURED) return f;
    return { ...f, featured: [...f.featured, slug] };
  });
  const move = (slug: string, dir: -1 | 1) => setForm((f) => {
    const i = f.featured.indexOf(slug);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= f.featured.length) return f;
    const next = [...f.featured];
    [next[i], next[j]] = [next[j], next[i]];
    return { ...f, featured: next };
  });
  // Escolhidas primeiro (na ordem), depois as outras pela ordem do menu.
  const ordered = [
    ...form.featured.map((s) => menu.find((c) => c.slug === s)).filter((c): c is NonNullable<typeof c> => !!c),
    ...menu.filter((c) => !form.featured.includes(c.slug)),
  ];

  return (
    <AdminSubpage
      title={t("mm_title")} subtitle={t("mm_sub")} backLabel={t("mm_back")} onBack={onBack}
      actions={<>
        {dirty && <Button variant="ghost" onClick={() => saved && setForm(saved)}><Undo2 className="mr-1.5 h-4 w-4" />{t("undo")}</Button>}
        <Button onClick={submit} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
        </Button>
      </>}
    >
      <section className="rounded-[18px] border bg-card p-5">
        <h4 className="flex items-center text-base font-semibold">{t("mm_featured")}<HelpTip label={t("help")} text={t("mm_featured_h")} /></h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(["auto", "manual", "off"] as const).map((m) => (
            <button key={m} type="button" onClick={() => set("featuredMode", m)} aria-pressed={form.featuredMode === m}
              className={cn("flex items-start gap-3 rounded-[14px] border p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                form.featuredMode === m ? "border-primary bg-accent" : "hover:border-foreground/30")}>
              <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border", form.featuredMode === m ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                {form.featuredMode === m && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span>
                <span className="block text-sm font-semibold">{t(`mm_mode_${m}`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`mm_mode_${m}_d`)}</span>
              </span>
            </button>
          ))}
        </div>

        {form.featuredMode === "auto" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <span className="flex items-center text-sm font-semibold">{t("mm_count")}<HelpTip label={t("help")} text={t("mm_count_h")} /></span>
            <Select value={String(form.count)} onValueChange={(v) => set("count", Number(v))}>
              <SelectTrigger className="w-24" aria-label={t("mm_count")}><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        {form.featuredMode === "manual" && (
          <div className="mt-4 border-t pt-4">
            <p className="text-xs text-muted-foreground">{full ? t("mm_pick_full", { max: MEGA_MENU_MAX_FEATURED }) : t("mm_pick", { max: MEGA_MENU_MAX_FEATURED })}</p>
            <ul className="mt-2 divide-y rounded-[14px] border">
              {ordered.map((c) => {
                const on = form.featured.includes(c.slug);
                const pos = form.featured.indexOf(c.slug);
                const photo = c.imageUrl || (c.image ? mediaUrl(c.image) : null);
                return (
                  <li key={c.slug} className="flex items-center gap-3 p-2.5">
                    <label className={cn("flex min-w-0 flex-1 cursor-pointer items-center gap-3", !on && full && "cursor-not-allowed opacity-50")}>
                      <input type="checkbox" checked={on} disabled={!on && full} onChange={() => toggle(c.slug)} className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
                      {photo
                        ? <img src={photo} alt="" className="h-10 w-14 shrink-0 rounded-lg border bg-muted object-cover" loading="lazy" />
                        : <span className="grid h-10 w-14 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground"><ImageOff className="h-4 w-4" aria-hidden="true" /></span>}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{on && <span className="mr-1.5 tabular-nums text-brand-orange-text">{pos + 1}.</span>}{c.name}</span>
                        {!photo && <span className="block text-xs text-amber-700">{t("mm_no_photo")}</span>}
                      </span>
                    </label>
                    {on && (
                      <span className="flex shrink-0">
                        <Button variant="ghost" size="icon" className="h-9 w-9" disabled={pos === 0} onClick={() => move(c.slug, -1)} aria-label={t("mm_up")} title={t("mm_up")}><ArrowUp className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9" disabled={pos === form.featured.length - 1} onClick={() => move(c.slug, 1)} aria-label={t("mm_down")} title={t("mm_down")}><ArrowDown className="h-4 w-4" /></Button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!form.featured.length && <p className="mt-2 text-xs text-amber-700">{t("mm_pick_empty")}</p>}
          </div>
        )}

        {preview.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("preview")}</p>
            <div className={cn("grid gap-3", preview.length === 1 ? "grid-cols-1" : preview.length === 2 ? "grid-cols-2" : preview.length === 3 ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4")}>
              {preview.map((c) => (
                <CategoryBanner key={c.slug} c={c} onNavigate={() => undefined} showText={form.showText} see={tl("mega_see")} className={cn("pointer-events-none", preview.length === 1 ? "aspect-[5/1]" : "aspect-[16/8]")} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[18px] border bg-card p-5">
        <div className="divide-y">
          <Toggle label={t("mm_text")} hint={t("mm_text_h")} checked={form.showText} onChange={(v) => set("showText", v)} disabled={form.featuredMode === "off"} t={t} />
          <Toggle label={t("mm_mobile")} hint={t("mm_mobile_h")} checked={form.mobile} onChange={(v) => set("mobile", v)} disabled={form.featuredMode === "off"} t={t} />
          <Toggle label={t("mm_side")} hint={t("mm_side_h")} checked={form.sideCard === "news"} onChange={(v) => set("sideCard", v ? "news" : "off")} t={t} />
          <Toggle label={t("mm_quick")} hint={t("mm_quick_h")} checked={form.quickLinks} onChange={(v) => set("quickLinks", v)} t={t} />
        </div>
      </section>
    </AdminSubpage>
  );
}

function Toggle({ label, hint, checked, onChange, disabled, t }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; t: T }) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-3 py-3", disabled && "cursor-not-allowed opacity-50")}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">{checked && !disabled ? t("on") : t("off")}</span>
        <Switch checked={checked && !disabled} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
      </span>
    </label>
  );
}
