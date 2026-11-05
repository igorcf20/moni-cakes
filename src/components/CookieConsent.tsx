// =====================================================================================
// Aviso e preferências de cookies (LGPD no Brasil, RGPD no EEE), no visual da marca.
//
//   Barra      aparece até haver uma escolha válida (src/lib/consent.ts: needsConsent). Recusar e Aceitar têm
//              o mesmo peso visual; o X fecha recusando os opcionais (fechar nunca vale como aceitar).
//   Modal      categorias que a loja usa de facto (src/lib/privacy.ts: offeredCategories), cada uma com
//              "Ver o que é guardado" (nome, quem guarda, para quê, duração: COOKIE_REGISTRY), o código e a
//              data da escolha (prova do consentimento) e a validade. No celular abre como folha no fundo.
//   Abrir      openConsentPreferences() (rodapé, política de privacidade, painel do cliente).
//   Ferramentas carregadas só com consentimento em src/components/privacy/ConsentScripts.tsx.
// Textos em src/i18n/legal.ts (cookieMessages).
// =====================================================================================
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, Cookie, Fingerprint, Globe2, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { usePrivacySettings } from "@/hooks/usePrivacySettings";
import { useMessages } from "@/i18n";
import { cookieMessages } from "@/i18n/legal";
import { isEU } from "@/legal/shared";
import { useCountry } from "@/lib/countries";
import {
  acceptAll,
  getConsent,
  hasGpcSignal,
  needsConsent,
  rejectAll,
  setConsent,
  type ConsentCategory,
  type ConsentState,
} from "@/lib/consent";
import { activeTools, offeredCategories, storageFor } from "@/lib/privacy";
import { cn } from "@/lib/utils";

type Optional = Exclude<ConsentCategory, "essential">;
type Prefs = Record<Optional, boolean>;
type CookieKey = keyof (typeof cookieMessages)["pt-BR"];
type T = (key: CookieKey, vars?: Record<string, string | number>) => string;
/** Intl.ListFormat (ES2021) fora da lib do TypeScript deste projeto. */
type ListFormatCtor = new (locale: string, o: { style: string; type: string }) => { format: (items: string[]) => string };

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const btnBase = cn(
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] px-5 text-[14px] font-semibold transition-[background-color,border-color,transform,opacity] duration-150 active:scale-[0.98]",
  focusRing,
);
/** Aceitar e Recusar: mesmo tamanho e mesmo peso (botões cheios), como pedem a ANPD e o CEPD. */
const btnAccept = cn(btnBase, "bg-primary text-primary-foreground hover:bg-primary-hover");
const btnReject = cn(btnBase, "bg-foreground text-background hover:opacity-90");
const btnOutline = cn(btnBase, "border border-border bg-white text-foreground hover:border-foreground/30");
const btnGhost = cn(btnBase, "px-3 text-foreground hover:bg-brand-alt");
const switchCls = "relative mt-0.5 shrink-0 after:absolute after:-inset-[10px] after:content-['']";
const NO_PREFS: Prefs = { analytics: false, marketing: false, preferences: false };

function prefsOf(c: ConsentState | null): Prefs {
  return c ? { analytics: c.analytics, marketing: c.marketing, preferences: c.preferences } : NO_PREFS;
}

const CookieConsent = () => {
  const { t, locale } = useMessages(cookieMessages);
  const country = useCountry();
  const privacy = usePrivacySettings();
  const titleId = useId();
  const textId = useId();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ConsentState | null>(() => getConsent());
  const [prefs, setPrefs] = useState<Prefs>(() => prefsOf(getConsent()));

  const offered = useMemo(() => offeredCategories(privacy), [privacy]);
  const tools = useMemo(() => activeTools(privacy), [privacy]);
  const offeredKey = offered.join(",");

  // A barra aparece sem escolha válida, ou quando a loja passou a usar uma categoria nova.
  useEffect(() => {
    if (!needsConsent(getConsent(), offered)) return;
    const timer = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(timer);
  }, [offeredKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => {
      const existing = getConsent();
      setCurrent(existing);
      setPrefs(prefsOf(existing));
      setOpen(true);
    };
    window.addEventListener("open-consent-preferences", handler);
    return () => window.removeEventListener("open-consent-preferences", handler);
  }, []);

  const opts = { months: privacy.consentMonths, locale, country: country.code, offered };
  const done = (state: ConsentState) => {
    setCurrent(state);
    setPrefs(prefsOf(state));
    setVisible(false);
    setOpen(false);
  };
  const handleAcceptAll = () => done(acceptAll(opts));
  const handleRejectAll = () => done(rejectAll(opts));
  const handleSave = () => {
    const only = Object.fromEntries(offered.map((c) => [c, prefs[c]])) as Partial<Prefs>;
    done(setConsent(only, { ...opts, action: "custom" }));
    toast.success(t("saved"));
  };

  const law = country.code === "BR" ? "lgpd" : isEU(country.code) ? "gdpr" : null;
  const list = useMemo(() => {
    const names = offered.map((c) => t(`cat_${c}`));
    try {
      const LF = (Intl as unknown as { ListFormat: ListFormatCtor }).ListFormat;
      return new LF(locale, { style: "long", type: "conjunction" }).format(names);
    } catch {
      return names.join(", ");
    }
  }, [offered, locale, t]);
  const text = t(law === "lgpd" ? "text_lgpd" : law === "gdpr" ? "text_gdpr" : "text_other", { list });
  const badge = law === "lgpd" ? t("badge_lgpd") : law === "gdpr" ? t("badge_gdpr") : null;
  const gpc = hasGpcSignal() && !current;
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(iso));

  const Badge = () =>
    badge ? (
      <span className="inline-flex items-center gap-1 rounded-md bg-brand-alt px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-ink-soft">
        <ShieldCheck className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        {badge}
      </span>
    ) : null;

  const PolicyLinks = ({ className }: { className?: string }) => (
    <span className={cn("inline-flex flex-wrap gap-x-3 gap-y-1", className)}>
      <Link to="/politica-privacidade#cookies" className={cn("rounded-[4px] font-semibold text-brand-orange-text underline underline-offset-2", focusRing)}>{t("more")}</Link>
      <Link to="/politica-privacidade" className={cn("rounded-[4px] font-semibold text-brand-orange-text underline underline-offset-2", focusRing)}>{t("privacy_link")}</Link>
    </span>
  );

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {visible && !open && (
          <motion.section
            key="cookie-consent"
            role="region"
            aria-labelledby={titleId}
            aria-describedby={textId}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            // z-50 como o cabeçalho: gavetas e diálogos (z-50, em portal no fim do body) ficam por cima.
            className="fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-50 md:inset-x-6 md:bottom-6"
          >
            <div className="relative mx-auto max-w-[1080px] rounded-[24px] border border-brand-card-border bg-white p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)] md:p-6">
              <button
                type="button"
                onClick={handleRejectAll}
                aria-label={t("close_reject")}
                title={t("close_reject")}
                className={cn("absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-[12px] text-muted-foreground transition-colors hover:bg-brand-alt hover:text-foreground", focusRing)}
              >
                <X className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              </button>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
                <div className="flex min-w-0 flex-1 items-start gap-4 pr-8 lg:pr-0">
                  <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-accent text-primary sm:grid">
                    <Cookie className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 id={titleId} className="text-[17px] font-bold leading-tight tracking-[-0.02em] text-foreground">{t("title")}</h2>
                      <Badge />
                    </div>
                    <p id={textId} className="mt-1.5 text-[14px] leading-relaxed text-brand-ink-soft">{text}</p>
                    <PolicyLinks className="mt-2 text-[13px]" />
                  </div>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 lg:flex lg:items-center">
                  <button type="button" onClick={() => setOpen(true)} className={cn(btnGhost, "col-span-2 order-last lg:order-none")}>
                    <SlidersHorizontal className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />
                    {t("customize")}
                  </button>
                  <button type="button" onClick={handleRejectAll} className={cn(btnReject, "lg:min-w-[150px]")}>{t("reject")}</button>
                  <button type="button" onClick={handleAcceptAll} className={cn(btnAccept, "lg:min-w-[150px]")}>{t("accept")}</button>
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-x-0 bottom-0 z-[70] flex max-h-[94vh] flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.3)] outline-none",
              "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4",
              "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[88vh] sm:w-[calc(100%-2rem)] sm:max-w-[640px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[24px] sm:border sm:border-brand-card-border sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95",
            )}
          >
            {/* Pega da folha no celular */}
            <span className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden="true" />

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-7 sm:pt-7">
              <div className="flex items-start gap-4 pr-10">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-accent text-primary">
                  <Cookie className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogPrimitive.Title className="text-[20px] font-bold leading-tight tracking-[-0.02em] text-foreground">{t("prefs_title")}</DialogPrimitive.Title>
                    <Badge />
                  </div>
                  <DialogPrimitive.Description className="mt-1.5 text-[14px] leading-relaxed text-brand-ink-soft">{t("prefs_text")}</DialogPrimitive.Description>
                  <PolicyLinks className="mt-2 text-[13px]" />
                </div>
              </div>
              <DialogPrimitive.Close
                aria-label={t("close")}
                className={cn("absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-[12px] text-muted-foreground transition-colors duration-150 hover:bg-brand-alt hover:text-foreground sm:right-4 sm:top-4", focusRing)}
              >
                <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              </DialogPrimitive.Close>

              {gpc && (
                <p className="mt-4 rounded-[14px] border border-brand-card-border bg-brand-alt px-4 py-3 text-[13px] leading-relaxed text-brand-ink-soft">{t("gpc_notice")}</p>
              )}

              <ul className="mt-5 space-y-2.5">
                <CategoryRow category="essential" t={t} privacy={privacy}>
                  <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-orange-text">{t("always_on")}</span>
                </CategoryRow>
                {offered.map((cat) => (
                  <CategoryRow key={cat} category={cat} t={t} privacy={privacy} on={prefs[cat]}>
                    <Switch
                      id={`consent-${cat}`}
                      aria-describedby={`consent-${cat}-desc`}
                      checked={prefs[cat]}
                      onCheckedChange={(v) => setPrefs((p) => ({ ...p, [cat]: !!v }))}
                      className={switchCls}
                    />
                  </CategoryRow>
                ))}
              </ul>

              {tools.length > 0 && (
                <p className="mt-4 flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                  <Globe2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                  {t("intl_transfer")}
                </p>
              )}
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{t("rights")}</p>

              {/* Comprovativo da escolha: o mesmo código fica registado no servidor. */}
              <div className="mt-4 flex items-start gap-3 rounded-[16px] bg-background px-4 py-3">
                <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
                {current?.id ? (
                  <div className="min-w-0 text-[12px] leading-relaxed text-muted-foreground">
                    <p>
                      {t("consent_id")}: <span className="break-all font-mono text-foreground">{current.id}</span>
                    </p>
                    <p>{t("consent_date", { date: date(current.timestamp), until: current.expires ? date(current.expires) : "" })}</p>
                  </div>
                ) : (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">{t("no_choice")}</p>
                )}
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-brand-card-border bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:grid-cols-3 sm:px-7 sm:pb-6 sm:pt-4">
              <button type="button" onClick={handleRejectAll} className={cn(btnReject, "whitespace-nowrap px-3")}>{t("reject_optional")}</button>
              <button type="button" onClick={handleAcceptAll} className={cn(btnAccept, "whitespace-nowrap px-3")}>{t("accept")}</button>
              <button type="button" onClick={handleSave} className={cn(btnOutline, "col-span-2 whitespace-nowrap px-3 sm:order-first sm:col-span-1")}>{t("save")}</button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </MotionConfig>
  );
};

/** Uma categoria: título, descrição, controlo à direita e a lista do que guarda (expansível). */
function CategoryRow({
  category,
  t,
  privacy,
  on,
  children,
}: {
  category: ConsentCategory;
  t: T;
  privacy: Parameters<typeof storageFor>[1];
  on?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = storageFor(category, privacy);
  const panelId = `consent-${category}-items`;
  const essential = category === "essential";
  return (
    <li className={cn("rounded-[18px] border p-4 transition-colors duration-150", essential ? "border-brand-card-border bg-background" : on ? "border-primary/40 bg-accent/40" : "border-brand-card-border")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground">
            {essential ? (
              <span id="consent-essential-label">{t("essential_title")}</span>
            ) : (
              <label htmlFor={`consent-${category}`} className="cursor-pointer">{t(`${category}_title`)}</label>
            )}
            {essential && children}
          </p>
          <p id={`consent-${category}-desc`} className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t(`${category}_text`)}</p>
        </div>
        {!essential && children}
      </div>
      {items.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
            className={cn("mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-[8px] text-[13px] font-semibold text-brand-orange-text", focusRing)}
          >
            {expanded ? t("details_hide") : t("details_show")} ({items.length})
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")} strokeWidth={2} aria-hidden="true" />
          </button>
          {expanded && (
            <dl id={panelId} className="mt-2 space-y-2">
              {items.map((item) => (
                <div key={item.name} className="grid gap-x-4 gap-y-1 rounded-[12px] border border-brand-card-border bg-white p-3 text-[12px] sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <dt className="sr-only">{t("col_name")}</dt>
                    <dd className="break-all font-mono text-[12px] font-semibold text-foreground">{item.name}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="inline font-semibold text-foreground">{t("col_purpose")}: </dt>
                    <dd className="inline text-muted-foreground">{t(item.purpose as CookieKey)}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-foreground">{t("col_provider")}: </dt>
                    <dd className="inline text-muted-foreground">{item.provider === "self" ? t("provider_self") : item.provider}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-foreground">{t("col_duration")}: </dt>
                    <dd className="inline text-muted-foreground">{t(item.duration as CookieKey, { months: privacy.consentMonths })}</dd>
                  </div>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </li>
  );
}

export default CookieConsent;
