// =====================================================================================
// Admin > Banners: banners de campanha da página inicial (tabela banners).
//
//   Site       src/components/home/CampaignBanners.tsx mostra os 3 primeiros ativos dentro das datas
//              (a política de leitura do banco filtra ativo + datas); some sem banners.
//   Campos     foto (image_url), título, texto curto (subtitle), botão (cta_text + cta_url: caminho
//              da loja ou https), datas de início e fim, ligado, ordem (setas).
//              Traduções em texts_i18n (título, texto e botão por idioma; vazio = texto principal).
//   Colunas antigas da loja anterior (vídeo, véu, botão secundário, posição) ficam no banco sem uso.
// Depois de gravar invalida CAMPAIGN_BANNERS_QUERY_KEY. Textos em src/i18n/adminBanners.ts.
// =====================================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import AdminHelp from "./AdminHelp";
import LinkPicker from "./LinkPicker";
import StorageImageUploader from "./StorageImageUploader";
import { CAMPAIGN_BANNERS_QUERY_KEY, isBannerLink, parseBannerTranslations, BANNER_TEXT_FIELDS, type BannerTranslations } from "@/hooks/useCampaignBanners";
import { DEFAULT_LOCALE, LOCALES, LOCALE_NAMES, useMessages, type Locale } from "@/i18n";
import { adminBannersMessages } from "@/i18n/adminBanners";
import { cn } from "@/lib/utils";

type Row = {
  id: string; title: string; subtitle: string | null; image_url: string; cta_text: string | null; cta_url: string | null;
  start_date: string | null; end_date: string | null; is_active: boolean | null; display_order: number | null;
  texts_i18n?: unknown;
};
type Draft = {
  id?: string; title: string; subtitle: string; image_url: string; cta_text: string; cta_url: string; start: string; end: string; is_active: boolean;
  texts: BannerTranslations;
};

/** Idiomas com tradução: todos menos o principal (o dos campos de cima). */
const OTHER_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);
const EMPTY_DRAFT: Draft = { title: "", subtitle: "", image_url: "", cta_text: "", cta_url: "", start: "", end: "", is_active: true, texts: {} };

const ADMIN_KEY = ["adminBanners"] as const;
const db = supabase as any;
/** Data local (AAAA-MM-DD) para o campo de data, e de volta para o banco (início e fim do dia). */
const toDay = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromDay = (day: string, endOfDay: boolean) => (day ? new Date(`${day}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString() : null);

function status(b: Row, now: number): "live" | "scheduled" | "ended" | "off" {
  if (b.is_active === false) return "off";
  if (b.start_date && new Date(b.start_date).getTime() > now) return "scheduled";
  if (b.end_date && new Date(b.end_date).getTime() < now) return "ended";
  return "live";
}

const AdminBanners = () => {
  const { t } = useMessages(adminBannersMessages);
  const { ask, confirmSlot } = useInlineConfirm();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lang, setLang] = useState<Locale>(OTHER_LOCALES[0]);
  const setText = (locale: Locale, field: (typeof BANNER_TEXT_FIELDS)[number], value: string) =>
    setDraft((d) => (d ? { ...d, texts: { ...d.texts, [locale]: { ...d.texts[locale], [field]: value } } } : d));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ADMIN_KEY });
    qc.invalidateQueries({ queryKey: CAMPAIGN_BANNERS_QUERY_KEY });
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await db.from("banners").select("*").order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        title: d.title.trim(), subtitle: d.subtitle.trim() || null, image_url: d.image_url,
        cta_text: d.cta_text.trim() || null, cta_url: d.cta_url.trim() || null, link_url: d.cta_url.trim() || null,
        start_date: fromDay(d.start, false), end_date: fromDay(d.end, true), is_active: d.is_active, position: "home",
        texts_i18n: parseBannerTranslations(d.texts, OTHER_LOCALES),
      };
      const { error } = d.id
        ? await db.from("banners").update(payload).eq("id", d.id)
        : await db.from("banners").insert({ ...payload, display_order: (rows[rows.length - 1]?.display_order ?? 0) + 1 });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success(t("saved")); setDraft(null); },
    onError: () => toast.error(t("save_error")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("banners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success(t("deleted")); },
    onError: () => toast.error(t("delete_error")),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const { error } = await db.from("banners").update({ is_active: on }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const next = [...rows];
      const [item] = next.splice(index, 1);
      next.splice(index + dir, 0, item);
      for (const [i, r] of next.entries()) {
        if (r.display_order === i + 1) continue;
        const { error } = await db.from("banners").update({ display_order: i + 1 }).eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: refresh,
  });

  const now = Date.now();
  let liveCount = 0;
  const linkError = draft?.cta_url.trim() && !isBannerLink(draft.cta_url.trim()) ? t("link_invalid") : null;
  const datesError = draft?.start && draft?.end && draft.end < draft.start ? t("dates_invalid") : null;
  const badge: Record<string, string> = {
    live: "bg-emerald-100 text-emerald-900", scheduled: "bg-amber-100 text-amber-900", ended: "bg-muted text-muted-foreground", off: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <AdminHelp id="banners" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />

      <InlinePanel open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? t("edit_banner") : t("new_banner")}>
        {draft && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.image_url) return toast.error(t("image_required"));
              if (linkError || datesError) return;
              save.mutate(draft);
            }}
          >
            <div className="space-y-1.5">
              <Label>{t("image")}</Label>
              <StorageImageUploader value={draft.image_url} onChange={(url) => setDraft({ ...draft, image_url: url })} bucket="banners" folder="home" label="" previewAspect="aspect-[21/8]" hint="JPG, PNG, WEBP" />
              <p className="text-xs text-muted-foreground">{t("image_hint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bn-title">{t("title")}</Label>
              <Input id="bn-title" value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bn-sub">{t("subtitle")}</Label>
              <Textarea id="bn-sub" rows={2} maxLength={160} value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bn-cta">{t("cta_text")}</Label>
                <Input id="bn-cta" value={draft.cta_text} maxLength={30} onChange={(e) => setDraft({ ...draft, cta_text: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bn-url">{t("cta_url")}</Label>
                <LinkPicker id="bn-url" value={draft.cta_url} onChange={(v) => setDraft({ ...draft, cta_url: v })} placeholder="/produtos" />
              </div>
            </div>
            {linkError ? <p className="text-xs text-destructive">{linkError}</p> : <p className="text-xs text-muted-foreground">{t("cta_url_hint")}</p>}
            <fieldset className="space-y-3 rounded-xl border border-border p-4">
              <legend className="px-1 text-sm font-semibold">{t("translations")}</legend>
              <p className="text-xs text-muted-foreground">{t("translations_hint")}</p>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("translations")}>
                {OTHER_LOCALES.map((l) => {
                  const filled = BANNER_TEXT_FIELDS.some((f) => draft.texts[l]?.[f]?.trim());
                  return (
                    <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)}
                      className={cn("inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors duration-150",
                        lang === l ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted")}>
                      {LOCALE_NAMES[l]}
                      <span className={cn("h-1.5 w-1.5 rounded-full", filled ? (lang === l ? "bg-primary-foreground" : "bg-primary") : "bg-muted-foreground/40")} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              <div className="space-y-3" role="tabpanel">
                <div className="space-y-1.5">
                  <Label htmlFor="bn-tr-title">{t("title")}</Label>
                  <Input id="bn-tr-title" value={draft.texts[lang]?.title ?? ""} maxLength={80} placeholder={draft.title} onChange={(e) => setText(lang, "title", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bn-tr-sub">{t("subtitle")}</Label>
                  <Textarea id="bn-tr-sub" rows={2} maxLength={160} value={draft.texts[lang]?.subtitle ?? ""} placeholder={draft.subtitle} onChange={(e) => setText(lang, "subtitle", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bn-tr-cta">{t("cta_text")}</Label>
                  <Input id="bn-tr-cta" value={draft.texts[lang]?.cta_text ?? ""} maxLength={30} placeholder={draft.cta_text} onChange={(e) => setText(lang, "cta_text", e.target.value)} />
                </div>
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bn-start">{t("start")}</Label>
                <Input id="bn-start" type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bn-end">{t("end")}</Label>
                <Input id="bn-end" type="date" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
              </div>
            </div>
            {datesError && <p className="text-xs text-destructive">{datesError}</p>}
            <div className="flex items-center gap-3">
              <Switch id="bn-active" checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
              <Label htmlFor="bn-active">{t("active")}</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>{t("cancel")}</Button>
              <Button type="submit" disabled={!draft.title.trim() || save.isPending}>{save.isPending ? t("saving") : t("save")}</Button>
            </div>
          </form>
        )}
      </InlinePanel>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">{t("list_title")}</CardTitle>
          <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            <Plus className="mr-2 h-4 w-4" />{t("new_banner")}
          </Button>
        </CardHeader>
        <CardContent>
          {confirmSlot}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((b, i) => {
                const st = status(b, now);
                const shown = st === "live" && ++liveCount <= 3;
                return (
                  <li key={b.id} className={cn("flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 sm:flex-nowrap", st !== "live" && "opacity-70")}>
                    <img src={b.image_url} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{b.title}</p>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className={cn("rounded-full px-2 py-0.5 font-medium", badge[st])}>{st === "live" && !shown ? t("extra") : t(st)}</span>
                        {(b.start_date || b.end_date) && <span>{toDay(b.start_date) || "..."} / {toDay(b.end_date) || "..."}</span>}
                      </p>
                    </div>
                    <Switch checked={b.is_active !== false} onCheckedChange={(v) => toggle.mutate({ id: b.id, on: v })} aria-label={t("active")} />
                    <div className="flex shrink-0 items-center">
                      <Button size="icon" variant="ghost" className="h-9 w-9" disabled={i === 0 || move.isPending} onClick={() => move.mutate({ index: i, dir: -1 })} aria-label={t("move_up")} title={t("move_up")}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9" disabled={i === rows.length - 1 || move.isPending} onClick={() => move.mutate({ index: i, dir: 1 })} aria-label={t("move_down")} title={t("move_down")}><ArrowDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={t("edit")} title={t("edit")}
                        onClick={() => setDraft({ id: b.id, title: b.title, subtitle: b.subtitle ?? "", image_url: b.image_url, cta_text: b.cta_text ?? "", cta_url: b.cta_url ?? "", start: toDay(b.start_date), end: toDay(b.end_date), is_active: b.is_active !== false, texts: parseBannerTranslations(b.texts_i18n, OTHER_LOCALES) })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9" onClick={async () => { if (await ask(t("confirm_delete"))) remove.mutate(b.id); }} aria-label={t("remove")} title={t("remove")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default AdminBanners;
