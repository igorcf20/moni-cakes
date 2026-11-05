// =====================================================================================
// Admin > Páginas da loja: Sobre, Contato, Termos, Privacidade e Devoluções com texto próprio da loja, por idioma.
//   lista    as cinco páginas com o estado de cada idioma (publicada, rascunho, texto padrão)
//   página   ver=pagina&id=<page>&aba=<idioma>: título, abertura, texto rico, descrição para o Google, publicar,
//            "Começar do texto padrão" (texto atual do site em HTML) e voltar ao texto padrão
// Grava site_pages (src/hooks/useSitePages.ts); o site mostra a versão publicada do idioma do visitante.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, ExternalLink, FileText, Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import RichTextEditor from "./RichTextEditor";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { LOCALE_NAMES, useMessages, type Locale } from "@/i18n";
import { adminSitePagesMessages } from "@/i18n/adminSitePages";
import { aboutMessages } from "@/i18n/pages";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { usePrivacySettings } from "@/hooks/usePrivacySettings";
import { useAdminSitePages, useDeleteSitePage, useSaveSitePage, type SitePageDraft } from "@/hooks/useSitePages";
import { STORE_DEFAULTS } from "@/config/store";
import { LEGAL_PACKS } from "@/legal";
import { isEU, jurisdictionOf } from "@/legal/shared";
import { countryName, useCountries, useCountry } from "@/lib/countries";
import { activeTools } from "@/lib/privacy";
import {
  SITE_PAGES, SITE_PAGE_LOCALES, SITE_PAGE_PATHS, legalDocToHtml, sectionsToHtml,
  type SitePage, type SitePageKind, type SitePageLocale,
} from "@/lib/sitePages";
import { cn } from "@/lib/utils";

/** País cujo texto legal padrão serve de base para cada idioma. */
const LOCALE_COUNTRY: Record<SitePageLocale, string> = { "pt-BR": "BR", "pt-PT": "PT", es: "ES", en: "US" };

export default function AdminSitePages() {
  const page = useAdminPage();
  if (page.view === "pagina" && page.id && (SITE_PAGES as readonly string[]).includes(page.id)) {
    return <SitePageEditor kind={page.id as SitePageKind} onBack={page.close} />;
  }
  return <SitePageList onOpen={(k) => page.open("pagina", k)} />;
}

function SitePageList({ onOpen }: { onOpen: (k: SitePageKind) => void }) {
  const { t } = useMessages(adminSitePagesMessages);
  const { data: rows = [], isLoading, error } = useAdminSitePages();
  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <AdminHelp id="paginas-loja" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <ul className="space-y-3">
        {SITE_PAGES.map((k) => (
          <li key={k}>
            <button
              type="button"
              onClick={() => onOpen(k)}
              className="flex w-full flex-col gap-3 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand-orange-text"><FileText className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block font-semibold">{t(`page_${k}`)}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{t(`hint_${k}`)}</span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {SITE_PAGE_LOCALES.map((l) => <LocaleState key={l} locale={l} row={rows.find((r) => r.page === k && r.locale === l)} />)}
                  </span>
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center text-sm font-semibold text-brand-orange-text">{t("edit")}<ChevronRight className="ml-1 h-4 w-4" /></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocaleState({ locale, row }: { locale: SitePageLocale; row?: SitePage }) {
  const { t } = useMessages(adminSitePagesMessages);
  const state = !row ? "st_default" : row.published ? "st_published" : "st_draft";
  return (
    <Badge variant="outline" className={cn("font-normal", row?.published && "border-emerald-300 bg-emerald-50 text-emerald-800", row && !row.published && "border-amber-300 bg-amber-50 text-amber-800")}>
      {LOCALE_NAMES[locale as Locale]}: {t(state)}
    </Badge>
  );
}

const emptyDraft = (kind: SitePageKind, locale: SitePageLocale, row?: SitePage): SitePageDraft => ({
  page: kind,
  locale,
  title: row?.title ?? "",
  intro: row?.intro ?? "",
  body: row?.body ?? "",
  seo_description: row?.seo_description ?? "",
  published: row?.published ?? false,
});

/** Texto padrão da página em HTML, para começar a editar a partir dele. */
function useDefaultHtml(kind: SitePageKind, locale: SitePageLocale) {
  const { data: info } = useStoreInfo();
  const privacy = usePrivacySettings();
  const { data: countries = [] } = useCountries();
  const current = useCountry();
  return useMemo(() => {
    if (kind === "contact") return null;
    if (kind === "about") {
      const m = aboutMessages[locale as Locale];
      return sectionsToHtml([
        { title: m.storyTitle, paragraphs: [m.storyP1, m.storyP2, m.storyP3] },
        { title: m.processTitle, paragraphs: [`${m.step1Title}: ${m.step1Text}`, `${m.step2Title}: ${m.step2Text}`, `${m.step3Title}: ${m.step3Text}`, `${m.step4Title}: ${m.step4Text}`] },
        { title: m.valuesTitle, paragraphs: [`${m.valDesignTitle}: ${m.valDesignText}`, `${m.valQualityTitle}: ${m.valQualityText}`, `${m.valCustomTitle}: ${m.valCustomText}`] },
      ]);
    }
    const code = LOCALE_COUNTRY[locale];
    const country = countries.find((c) => c.code === code) ?? { ...current, code };
    const doc = LEGAL_PACKS[jurisdictionOf(code)].docs[kind]({
      store: (info?.name || "").trim() || STORE_DEFAULTS.name,
      email: (info?.email || "").trim(),
      phone: (info?.phone || "").trim(),
      taxId: (info?.nif || "").trim(),
      country,
      eu: isEU(code),
      tools: activeTools(privacy),
      consentMonths: privacy.consentMonths,
    });
    return legalDocToHtml(doc);
  }, [kind, locale, info, privacy, countries, current]);
}

function SitePageEditor({ kind, onBack }: { kind: SitePageKind; onBack: () => void }) {
  const { t, locale: uiLocale } = useMessages(adminSitePagesMessages);
  const page = useAdminPage();
  const { dateTime } = useAdminFormat();
  const { data: rows = [], isLoading } = useAdminSitePages();
  const save = useSaveSitePage();
  const remove = useDeleteSitePage();
  const { ask, confirmSlot } = useInlineConfirm();
  const locale = ((SITE_PAGE_LOCALES as readonly string[]).includes(page.tab ?? "") ? page.tab : uiLocale) as SitePageLocale;
  const row = rows.find((r) => r.page === kind && r.locale === locale);
  const [draft, setDraft] = useState<SitePageDraft>(() => emptyDraft(kind, locale, row));
  const defaultHtml = useDefaultHtml(kind, locale);

  useEffect(() => { setDraft(emptyDraft(kind, locale, row)); }, [kind, locale, row]);
  const saved = emptyDraft(kind, locale, row);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof SitePageDraft>(k: K, v: SitePageDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;

  const applyDefault = async () => {
    if (!defaultHtml) return;
    if (draft.body.trim() && !(await ask(t("start_default_q"), { description: t("start_default_text"), confirmLabel: t("start_default_ok"), tone: "warning" }))) return;
    set("body", defaultHtml);
  };
  const reset = async () => {
    if (!(await ask(t("remove_q"), { description: t("remove_text"), confirmLabel: t("remove"), tone: "danger" }))) return;
    remove.mutate({ page: kind, locale }, { onSuccess: () => toast.success(t("removed")), onError: () => toast.error(t("save_error")) });
  };
  const submit = () => save.mutate(draft, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });

  return (
    <AdminSubpage
      title={t(`page_${kind}`)}
      subtitle={t(`hint_${kind}`)}
      backLabel={t("back")}
      onBack={onBack}
      actions={
        <Button asChild variant="outline" size="sm">
          <a href={SITE_PAGE_PATHS[kind]} target="_blank" rel="noopener noreferrer">{t("view_site")}<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("language")}</p>
          <Tabs value={locale} onValueChange={page.setTab}>
            <TabsList className="h-auto flex-wrap">
              {SITE_PAGE_LOCALES.map((l) => {
                const r = rows.find((x) => x.page === kind && x.locale === l);
                return (
                  <TabsTrigger key={l} value={l} className="gap-1.5 px-3">
                    {LOCALE_NAMES[l as Locale]}
                    {r && <span className={cn("h-1.5 w-1.5 rounded-full", r.published ? "bg-emerald-500" : "bg-amber-500")} aria-hidden="true" />}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">{row ? t("updated", { date: dateTime(row.updated_at) }) : t("never_saved")}</p>
        </div>

        <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sp-title">{t("f_title")}</Label>
              <Input id="sp-title" value={draft.title} maxLength={160} placeholder={t("f_title_ph")} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-seo">{t("f_seo")}</Label>
              <Input id="sp-seo" value={draft.seo_description} maxLength={300} onChange={(e) => set("seo_description", e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("f_seo_hint")}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-intro">{t("f_intro")}</Label>
            <Textarea id="sp-intro" rows={2} value={draft.intro} maxLength={600} onChange={(e) => set("intro", e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("f_intro_hint")}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label>{t("f_body")}</Label>
              {defaultHtml && (
                <Button type="button" variant="outline" size="sm" onClick={applyDefault}>
                  <Sparkles className="mr-1.5 h-4 w-4" />{t("start_default")}
                </Button>
              )}
            </div>
            {defaultHtml && kind !== "about" && (
              <p className="text-xs text-muted-foreground">{t("start_default_hint", { country: countryName(LOCALE_COUNTRY[locale], uiLocale) })}</p>
            )}
            {confirmSlot}
            <RichTextEditor key={`${kind}-${locale}`} value={draft.body} onChange={(v) => set("body", v)} placeholder={t("f_body_ph")} className="[&_.ProseMirror]:min-h-[320px]" />
          </div>
        </section>

        <section className="flex items-start justify-between gap-4 rounded-[18px] border bg-card p-4">
          <div>
            <Label htmlFor="sp-published" className="text-sm font-semibold">{t("f_published")}</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">{draft.published ? t("f_published_on") : t("f_published_off")}</p>
          </div>
          <Switch id="sp-published" checked={draft.published} onCheckedChange={(v) => set("published", v)} />
        </section>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          {row ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={reset} disabled={remove.isPending}>
              <RotateCcw className="mr-1.5 h-4 w-4" />{t("remove")}
            </Button>
          ) : <span />}
          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs text-muted-foreground">{t("unsaved")}</span>}
            <Button onClick={submit} disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
              {save.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      </div>
    </AdminSubpage>
  );
}
