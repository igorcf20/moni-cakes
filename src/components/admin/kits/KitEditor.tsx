// Admin > Kits > página do kit (?tab=kits&ver=kit&id=<id>; sem id = kit novo). Partes:
//   Básico      nome, endereço (/kit/<slug>), descrição curta, ativo, ordem, página inicial, período de validade
//   Desconto    tipo e valor + prévia (peças separadas, desconto, preço do kit, % por peça como kitPct)
//   Peças       KitPiecesEditor (produto, quantidade, observação, ordem, avisos de estoque)
//   Página      descrição completa (RichTextEditor), destaques, foto principal e galeria
//   Traduções   pt-PT, en, es (vazio = texto do idioma padrão)
//   SEO         título e descrição com contador e prévia do Google
// Um botão Gravar kit na barra fixa no fundo; apagar com a confirmação na página (useInlineConfirm).
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, BadgePercent, BarChart3, CalendarClock, ExternalLink, FileText, Languages, Loader2, Save, Search, Settings2, Trash2, X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminSubpage from "../AdminSubpage";
import RichTextEditor from "../RichTextEditor";
import StorageImageUploader from "../StorageImageUploader";
import HelpTip from "../HelpTip";
import { useInlineConfirm } from "../shell/useInlineConfirm";
import { supabase } from "@/integrations/supabase/client";
import { LOCALE_NAMES, useMessages } from "@/i18n";
import { adminLegacyMessages, type AdminLegacyT as T } from "@/i18n/adminLegacy";
import { useAdminFormat } from "@/hooks/useAdminList";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";
import { FieldLabel, KitSection, KitStatusChip } from "./KitParts";
import KitPiecesEditor from "./KitPiecesEditor";
import {
  EMPTY_KIT, KIT_LOCALES, fromLocalInput, statusHint, isSlugTaken, kitPreview, kitSlug, kitStatus, toLocalInput, useAdminKits, useDeleteKit, useKitProducts,
  useKitStats, useSaveKit, type AdminKit, type I18nMap, type KitDraft, type KitLocale,
} from "./kitAdmin";

type Form = KitDraft & { startsLocal: string; endsLocal: string };

const toForm = (k: AdminKit | null): Form => {
  if (!k) return { ...EMPTY_KIT, startsLocal: "", endsLocal: "" };
  const { id: _id, updated_at: _u, ...rest } = k;
  void _id; void _u;
  return {
    ...rest,
    slug: rest.slug ?? "",
    description: rest.description ?? "",
    image_url: rest.image_url ?? "",
    long_description: rest.long_description ?? "",
    highlights: rest.highlights ?? "",
    seo_title: rest.seo_title ?? "",
    seo_description: rest.seo_description ?? "",
    items: rest.items.map((i) => ({ ...i, note: i.note ?? "" })),
    startsLocal: toLocalInput(rest.starts_at),
    endsLocal: toLocalInput(rest.ends_at),
  };
};

const SEO_TITLE_MAX = 60;
const SEO_DESC_MAX = 160;
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export default function KitEditor({ id, onBack, onSaved }: { id: string | null; onBack: () => void; onSaved: () => void }) {
  const { t } = useMessages(adminLegacyMessages);
  const fmt = useAdminFormat();
  const { data: kits = [], isLoading } = useAdminKits();
  const { data: products = [] } = useKitProducts();
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories-for-kits"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any).from("categories").select("name").eq("is_active", true).order("display_order");
      if (error) throw error;
      return (data || []).map((c: { name: string }) => c.name);
    },
  });
  const save = useSaveKit();
  const del = useDeleteKit();
  const { ask, confirmSlot } = useInlineConfirm();
  const kit = id ? kits.find((k) => k.id === id) ?? null : null;
  const initial = useMemo(() => toForm(kit), [kit]);
  const [f, setF] = useState<Form>(initial);
  const [tried, setTried] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Recarrega o formulário só quando o kit muda no banco.
  useEffect(() => {
    setF(initial);
    setEditorKey((k) => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit?.id, kit?.updated_at]);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("kits_loading")}</p>;
  if (id && !kit) {
    return (
      <AdminSubpage title={t("kits_not_found")} backLabel={t("kits_back")} onBack={onBack}>
        <p className="text-sm text-muted-foreground">{t("kits_not_found_d")}</p>
      </AdminSubpage>
    );
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setI18n = (field: "name_i18n" | "description_i18n" | "long_description_i18n" | "highlights_i18n", loc: KitLocale, v: string) =>
    setF((x) => ({ ...x, [field]: { ...x[field], [loc]: v } as I18nMap }));

  const draft: KitDraft = { ...f, starts_at: fromLocalInput(f.startsLocal), ends_at: fromLocalInput(f.endsLocal) };
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const errs = {
    name: !f.name.trim(),
    items: f.items.length === 0,
    product: f.items.some((i) => !i.product_id),
    dates: !!draft.starts_at && !!draft.ends_at && new Date(draft.ends_at) <= new Date(draft.starts_at),
    pct: f.discount_type === "percentage" && (Number(f.discount_value) < 0 || Number(f.discount_value) > 100),
  };
  const invalid = Object.values(errs).some(Boolean);
  const preview = kitPreview(draft, byId);
  const status = kitStatus({ ...draft, items: draft.items }, byId);
  const slugShown = kitSlug(f.slug ?? "") || kit?.slug || kitSlug(f.name) || "...";
  const publicUrl = `${siteUrl()}/kit/${slugShown}`;
  const live = kit && kitStatus(kit, byId) === "active";

  const submit = async () => {
    setTried(true);
    if (invalid) { toast.error(t("kits_err_fix")); return; }
    try {
      await save.mutateAsync({ id, draft });
      toast.success(id ? t("kits_updated") : t("kits_created"));
      onSaved();
    } catch (e) {
      toast.error(isSlugTaken(e) ? t("kits_err_slug_taken") : t("kits_save_error"));
    }
  };
  const remove = async () => {
    if (!kit) return;
    if (!(await ask(t("kits_delete_confirm_name", { name: kit.name }), { description: t("kits_delete_d"), confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await del.mutateAsync(kit.id);
      toast.success(t("kits_deleted"));
      onBack();
    } catch {
      toast.error(t("kits_delete_error"));
    }
  };

  const fixedHelp = t("kits_h_discount_value", { currency: fmt.currency });

  return (
    <AdminSubpage
      title={kit ? kit.name : t("kits_new")}
      subtitle={kit ? t("kits_edit_d", { url: `/kit/${kit.slug ?? ""}` }) : t("kits_new_d")}
      backLabel={t("kits_back")}
      onBack={onBack}
      actions={kit && (
        <>
          {kit.slug && (
            <Button variant="outline" asChild>
              <a href={`${siteUrl()}/kit/${kit.slug}`} target="_blank" rel="noreferrer" title={live ? undefined : t("kits_view_site_hidden")}>
                <ExternalLink className="mr-1.5 h-4 w-4" />{t("kits_open_site")}
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => void remove()} disabled={del.isPending} className="text-destructive hover:text-destructive">
            <Trash2 className="mr-1.5 h-4 w-4" />{t("kits_delete_kit")}
          </Button>
        </>
      )}
    >
      {confirmSlot}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Básico */}
        <KitSection icon={Settings2} title={t("kits_sec_basic")} intro={t("kits_sec_basic_d")} className="min-w-0 lg:col-start-1 lg:row-start-1"
          actions={<KitStatusChip t={t} status={status} title={statusHint(t, status, draft, fmt.dateTime)} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel t={t} htmlFor="kit-name" label={t("kits_f_name")} help={t("kits_h_name")} />
              <Input id="kit-name" value={f.name} maxLength={120} onChange={(e) => set("name", e.target.value)} aria-invalid={tried && errs.name} className={cn(tried && errs.name && "border-destructive")} />
              {tried && errs.name && <p className="text-xs text-destructive">{t("kits_err_name")}</p>}
            </div>
            <div className="space-y-1.5">
              <FieldLabel t={t} htmlFor="kit-slug" label={t("kits_f_slug")} help={t("kits_h_slug")} />
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-sm text-muted-foreground">/kit/</span>
                <Input id="kit-slug" value={f.slug ?? ""} maxLength={80} className="font-mono" placeholder={kitSlug(f.name) || t("kits_slug_ph")}
                  onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))} />
              </div>
              <p className="break-all text-xs text-muted-foreground">
                {f.slug ? t("kits_slug_preview", { url: publicUrl }) : t("kits_slug_auto", { url: publicUrl })}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel t={t} htmlFor="kit-desc" label={t("kits_f_short")} help={t("kits_h_short")} />
            <Textarea id="kit-desc" rows={2} maxLength={300} value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder={t("kits_short_ph")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel t={t} htmlFor="kit-order" label={t("kits_f_order")} help={t("kits_h_order")} />
              <Input id="kit-order" type="number" inputMode="numeric" value={f.display_order} onChange={(e) => set("display_order", parseInt(e.target.value, 10) || 0)} className="max-w-[160px]" />
            </div>
          </div>
          <div className="divide-y rounded-[14px] border">
            <SwitchRow t={t} id="kit-active" label={t("kits_f_active")} help={t("kits_h_active")} desc={t("kits_f_active_d")} checked={f.is_active} onChange={(v) => set("is_active", v)} />
            <SwitchRow t={t} id="kit-home" label={t("kits_f_home")} help={t("kits_h_home")} desc={t("kits_f_home_d")} checked={f.show_on_home} onChange={(v) => set("show_on_home", v)} />
          </div>
          <div className="space-y-3 rounded-[14px] border bg-muted/30 p-3 sm:p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} />{t("kits_window")}</p>
            <p className="text-xs text-muted-foreground">{t("kits_window_d")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField t={t} id="kit-start" label={t("kits_f_starts")} help={t("kits_h_starts")} value={f.startsLocal} onChange={(v) => set("startsLocal", v)} />
              <DateField t={t} id="kit-end" label={t("kits_f_ends")} help={t("kits_h_ends")} value={f.endsLocal} onChange={(v) => set("endsLocal", v)} invalid={tried && errs.dates} />
            </div>
            {errs.dates && <p className="text-xs text-destructive">{t("kits_err_dates")}</p>}
          </div>
        </KitSection>

        {/* Desconto e vendas (ao lado no computador, logo a seguir ao Básico no celular) */}
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <KitSection icon={BadgePercent} title={t("kits_sec_discount")} intro={t("kits_sec_discount_d")}>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
              <div className="space-y-1.5">
                <FieldLabel t={t} htmlFor="kit-dtype" label={t("kits_f_discount_type")} help={t("kits_h_discount_type")} />
                <Select value={f.discount_type} onValueChange={(v) => set("discount_type", v === "fixed" ? "fixed" : "percentage")}>
                  <SelectTrigger id="kit-dtype"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{t("kits_percentage")}</SelectItem>
                    <SelectItem value="fixed">{t("kits_fixed", { currency: fmt.currency })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel t={t} htmlFor="kit-dval" label={t("kits_f_discount_value")} help={fixedHelp} />
                <Input id="kit-dval" type="number" inputMode="decimal" step="0.01" min={0} max={f.discount_type === "percentage" ? 100 : undefined}
                  value={f.discount_value} onChange={(e) => set("discount_value", parseFloat(e.target.value) || 0)} aria-invalid={errs.pct} className={cn(errs.pct && "border-destructive")} />
              </div>
            </div>
            {errs.pct && <p className="text-xs text-destructive">{t("kits_err_pct")}</p>}
            <div className="rounded-[14px] border bg-background p-3">
              <p className="mb-2 flex items-center text-sm font-semibold">{t("kits_pv_title")}<HelpTip label={t("help")} text={t("kits_pv_h")} /></p>
              {preview.list <= 0 ? (
                <p className="text-sm text-muted-foreground">{t("kits_pv_empty")}</p>
              ) : (
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("kits_pv_list")}</dt><dd className="tabular-nums line-through decoration-muted-foreground/60">{fmt.money(preview.list)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("kits_pv_discount")}</dt><dd className="tabular-nums text-emerald-700">- {fmt.money(preview.discount)}</dd></div>
                  <div className="flex justify-between gap-3 border-t pt-1.5 text-base font-bold"><dt>{t("kits_pv_total")}</dt><dd className="tabular-nums">{fmt.money(preview.total)}</dd></div>
                  <p className="pt-1 text-xs font-medium text-brand-orange-text">{t("kits_pv_pct", { pct: `${(Math.round(preview.pct * 1000) / 10).toLocaleString(fmt.locale)}%` })}</p>
                  {preview.pct >= 1 && <p className="text-xs font-medium text-destructive">{t("kits_pv_capped")}</p>}
                </dl>
              )}
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t("kits_pv_note")}</p>
            </div>
          </KitSection>
          {kit && <KitSales t={t} kitId={kit.id} money={fmt.money} dateTime={fmt.dateTime} />}
        </aside>

        <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-2">
          <KitPiecesEditor t={t} items={f.items} onChange={(items) => set("items", items)} products={products} categories={categories} money={fmt.money}
            showErrors={tried && (errs.items || errs.product)} />
          {tried && (errs.items || errs.product) && <p className="-mt-3 text-sm text-destructive">{errs.items ? t("kits_err_items") : t("kits_err_product")}</p>}

          {/* Página do kit */}
          <KitSection icon={FileText} title={t("kits_sec_page")} intro={t("kits_sec_page_d")}>
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <FieldLabel t={t} label={t("kits_f_image")} help={t("kits_h_image")} />
                <StorageImageUploader value={f.image_url ?? ""} onChange={(url) => set("image_url", url)} bucket="product-images" folder="kits" label="" previewAspect="aspect-square" />
              </div>
              <Gallery t={t} urls={f.gallery} onChange={(g) => set("gallery", g)} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel t={t} label={t("kits_f_long")} help={t("kits_h_long")} />
              <RichTextEditor key={`pt-${editorKey}`} value={f.long_description ?? ""} onChange={(v) => set("long_description", v)} placeholder={t("kits_long_ph")} className="[&_.ProseMirror]:min-h-[200px]" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel t={t} htmlFor="kit-hl" label={t("kits_f_highlights")} help={t("kits_h_highlights")} />
              <Textarea id="kit-hl" rows={4} value={f.highlights ?? ""} onChange={(e) => set("highlights", e.target.value)} placeholder={t("kits_highlights_ph")} />
              <p className="text-xs text-muted-foreground">{t("kits_highlights_n", { n: (f.highlights ?? "").split(/\r?\n/).filter((l) => l.trim()).length })}</p>
            </div>
          </KitSection>

          {/* Traduções */}
          <KitSection icon={Languages} title={t("kits_sec_tr")} intro={t("kits_sec_tr_d")}>
            <Tabs defaultValue={KIT_LOCALES[0]}>
              <TabsList className="h-auto flex-wrap justify-start">
                {KIT_LOCALES.map((loc) => {
                  const n = [f.name_i18n, f.description_i18n, f.long_description_i18n, f.highlights_i18n].filter((m) => stripHtml(m[loc] ?? "")).length;
                  return (
                    <TabsTrigger key={loc} value={loc} className="gap-1.5">
                      {LOCALE_NAMES[loc]}
                      <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", n ? "bg-primary/10 text-brand-orange-text" : "bg-muted text-muted-foreground")}>{n}/4</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {KIT_LOCALES.map((loc) => (
                <TabsContent key={loc} value={loc} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <FieldLabel t={t} htmlFor={`kit-tn-${loc}`} label={t("kits_tr_name")} help={t("kits_tr_h_name")} />
                    <Input id={`kit-tn-${loc}`} value={f.name_i18n[loc] ?? ""} maxLength={120} placeholder={f.name} onChange={(e) => setI18n("name_i18n", loc, e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel t={t} htmlFor={`kit-td-${loc}`} label={t("kits_tr_short")} help={t("kits_tr_h_short")} />
                    <Textarea id={`kit-td-${loc}`} rows={2} maxLength={300} value={f.description_i18n[loc] ?? ""} placeholder={f.description ?? ""} onChange={(e) => setI18n("description_i18n", loc, e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel t={t} label={t("kits_tr_long")} help={t("kits_tr_h_long")} />
                    <RichTextEditor key={`${loc}-${editorKey}`} value={f.long_description_i18n[loc] ?? ""} onChange={(v) => setI18n("long_description_i18n", loc, v)} placeholder={t("kits_tr_empty")} className="[&_.ProseMirror]:min-h-[160px]" />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel t={t} htmlFor={`kit-th-${loc}`} label={t("kits_tr_highlights")} help={t("kits_tr_h_highlights")} />
                    <Textarea id={`kit-th-${loc}`} rows={3} value={f.highlights_i18n[loc] ?? ""} placeholder={f.highlights || t("kits_tr_empty")} onChange={(e) => setI18n("highlights_i18n", loc, e.target.value)} />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </KitSection>

          {/* SEO */}
          <KitSection icon={Search} title={t("kits_sec_seo")} intro={t("kits_sec_seo_d")}>
            <div className="rounded-xl border bg-white p-3" aria-label={t("kits_seo_preview")}>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("kits_seo_preview")}</p>
              <p className="truncate text-xs text-emerald-700">{publicUrl.replace(/^https?:\/\//, "")}</p>
              <p className="truncate text-[17px] text-[#1a0dab]">{(f.seo_title || f.name || t("kits_new")).slice(0, 70)}</p>
              <p className="line-clamp-2 text-sm text-[#4d5156]">{(f.seo_description || f.description || stripHtml(f.long_description ?? "") || t("kits_seo_empty")).slice(0, 170)}</p>
            </div>
            <div className="space-y-1.5">
              <FieldLabel t={t} htmlFor="kit-seo-t" label={t("kits_f_seo_title")} help={t("kits_h_seo_title")} />
              <Input id="kit-seo-t" value={f.seo_title ?? ""} maxLength={120} placeholder={f.name} onChange={(e) => set("seo_title", e.target.value)} />
              <Counter t={t} n={(f.seo_title ?? "").length} max={SEO_TITLE_MAX} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel t={t} htmlFor="kit-seo-d" label={t("kits_f_seo_desc")} help={t("kits_h_seo_desc")} />
              <Textarea id="kit-seo-d" rows={2} maxLength={300} value={f.seo_description ?? ""} placeholder={f.description ?? ""} onChange={(e) => set("seo_description", e.target.value)} />
              <Counter t={t} n={(f.seo_description ?? "").length} max={SEO_DESC_MAX} />
            </div>
          </KitSection>
        </div>
      </div>

      {/* Barra de gravar (fica presa ao fundo da tela enquanto rola) */}
      <div className="sticky bottom-0 z-30 -mx-1 flex flex-wrap items-center justify-start gap-3 rounded-t-[18px] sm:justify-end border border-b-0 bg-card/95 px-4 py-3 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.25)] backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <p className={cn("hidden text-sm sm:mr-auto sm:block", tried && invalid ? "font-medium text-destructive" : dirty ? "font-semibold text-brand-orange-text" : "text-muted-foreground")}>
          {tried && invalid ? t("kits_err_fix") : dirty ? t("kits_unsaved") : id ? t("kits_saved_state") : t("kits_new_hint")}
        </p>
        <Button variant="outline" onClick={onBack}>{t("cancel")}</Button>
        <Button onClick={() => void submit()} disabled={save.isPending || (!!id && !dirty)} className="order-first sm:order-last">
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          {save.isPending ? t("kits_saving") : t("kits_save")}
        </Button>
      </div>
    </AdminSubpage>
  );
}

function SwitchRow({ t, id, label, help, desc, checked, onChange }: { t: T; id: string; label: string; help: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 p-3">
      <div className="min-w-0">
        <FieldLabel t={t} htmlFor={id} label={label} help={help} className="text-sm font-semibold" />
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-1" />
    </div>
  );
}

function DateField({ t, id, label, help, value, onChange, invalid }: { t: T; id: string; label: string; help: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel t={t} htmlFor={id} label={label} help={help} />
      <div className="flex items-center gap-1.5">
        <Input id={id} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} className={cn("min-w-0 flex-1", invalid && "border-destructive")} />
        {value && <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label={t("kits_clear_date", { label })} onClick={() => onChange("")}><X className="h-4 w-4" /></Button>}
      </div>
      <p className="text-xs text-muted-foreground">{value ? "" : t("kits_date_empty")}</p>
    </div>
  );
}

function Counter({ t, n, max }: { t: T; n: number; max: number }) {
  return <p className={cn("text-xs tabular-nums", n > max ? "font-medium text-amber-700" : "text-muted-foreground")}>{n > max ? t("kits_seo_over", { n, max }) : t("kits_seo_count", { n, max })}</p>;
}

function Gallery({ t, urls, onChange }: { t: T; urls: string[]; onChange: (u: string[]) => void }) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= urls.length) return;
    const next = [...urls];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <FieldLabel t={t} label={t("kits_f_gallery")} help={t("kits_h_gallery")} />
      {urls.length === 0 ? (
        <p className="rounded-[14px] border border-dashed p-3 text-center text-xs text-muted-foreground">{t("kits_gallery_empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {urls.map((u, i) => (
            <li key={`${u}-${i}`} className="overflow-hidden rounded-xl border bg-muted">
              <img src={u} alt={t("kits_gallery_photo", { n: i + 1 })} className="aspect-square w-full object-cover" loading="lazy" />
              <div className="flex items-center justify-between bg-card px-1 py-0.5">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("kits_gallery_up", { n: i + 1 })} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("kits_gallery_down", { n: i + 1 })} disabled={i === urls.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("kits_gallery_remove", { n: i + 1 })} onClick={() => onChange(urls.filter((_, n) => n !== i))}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <StorageImageUploader key={urls.length} value="" onChange={(url) => url && onChange([...urls, url])} bucket="product-images" folder="kits" label="" previewAspect="aspect-[3/1]" hint={t("kits_gallery_add")} />
    </div>
  );
}

function KitSales({ t, kitId, money, dateTime }: { t: T; kitId: string; money: (v: number) => string; dateTime: (v: string) => string }) {
  const { data, isLoading, error } = useKitStats("all");
  const s = data?.[kitId];
  return (
    <KitSection icon={BarChart3} title={t("kits_sec_sales")} intro={t("kits_sec_sales_d")}>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : error ? <p className="text-sm text-destructive">{t("kits_stats_error")}</p>
        : !s ? <p className="text-sm text-muted-foreground">{t("kits_no_sales")}</p>
        : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">{t("kits_col_orders")}</dt><dd className="text-lg font-bold tabular-nums">{s.orders}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("kits_col_sold")}</dt><dd className="text-lg font-bold tabular-nums">{s.kits_sold}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("kits_col_revenue")}</dt><dd className="font-semibold tabular-nums">{money(s.revenue)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("kits_col_given")}</dt><dd className="font-semibold tabular-nums">{money(s.discount)}</dd></div>
            {s.last_order_at && <p className="col-span-2 text-xs text-muted-foreground">{t("kits_last_sale", { when: dateTime(s.last_order_at) })}</p>}
          </dl>
        )}
    </KitSection>
  );
}
