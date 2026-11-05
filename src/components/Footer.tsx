import PaymentMethods from "@/components/PaymentMethods";
import { STORE_DEFAULTS } from "@/config/store";
import { useHrefOn } from "@/hooks/useFeatures";
import { useState } from "react";
import { openConsentPreferences } from "@/lib/consent";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Instagram, Mail, MapPin, Phone, Facebook, MessageCircle, Music2, ArrowRight, Check, Loader2 } from "lucide-react";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useHomePage } from "@/hooks/useHomePage";
import kodemiLogo from "@/assets/kodemi-logo.png.asset.json";
import { Logo } from "@/components/brand/Logo";
import { useLocale, useMessages } from "@/i18n";
import { layoutMessages } from "@/i18n/layout";
import { useCountry } from "@/lib/countries";
import { jurisdictionOf } from "@/legal/shared";
import { useKitSettings } from "@/hooks/useOfferSettings";
import { DEFAULT_KIT_SETTINGS } from "@/lib/kits";

/** Newsletter: grava o e-mail em newsletter_subscriptions (e-mail repetido conta como sucesso). */
function Newsletter() {
  // Textos do i18n, com os do Admin > Conteúdo da página inicial (bloco Newsletter) por cima.
  const { t, isVisible } = useHomePage();
  const locale = useLocale((s) => s.locale);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return toast.error(t("newsletter_invalid"));
    setState("sending");
    const { error } = await (supabase as any).from("newsletter_subscriptions").insert({ email: value, locale });
    if (error && error.code !== "23505") { setState("idle"); return toast.error(t("newsletter_error")); }
    setState("done");
    setEmail("");
    toast.success(t("newsletter_ok"));
  };
  return (
    // No celular os dois ficam um sobre o outro: flex-1 só a partir de sm, senão o campo encolhe para a altura do texto.
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <label htmlFor="newsletter-email" className="sr-only">{t("newsletter_placeholder")}</label>
      <input
        id="newsletter-email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setState("idle"); }}
        placeholder={t("newsletter_placeholder")}
        className="h-[52px] w-full min-w-0 shrink-0 rounded-[14px] sm:w-auto sm:flex-1 border border-white/15 bg-white/[0.06] px-4 text-[15px] text-white outline-none transition-colors duration-150 placeholder:text-white/45 focus:border-primary"
      />
      <button type="submit" disabled={state === "sending"} className="inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:opacity-70">
        {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : state === "done" ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
        {t("newsletter_cta")}
      </button>
    </form>
  );
}

const Footer = () => {
  const { settings } = useStoreSettings();
  const { data: storeInfo } = useStoreInfo();
  // Textos do i18n, com os do Admin > Conteúdo da página inicial (bloco Newsletter) por cima.
  const { t, isVisible } = useHomePage();
  const hrefOn = useHrefOn();
  const { data: kitSettings = DEFAULT_KIT_SETTINGS } = useKitSettings();
  const country = useCountry();
  const social = (settings?.social_links as any) || {};
  const info = storeInfo || ({} as any);
  const contactEmail = info.email;
  const contactPhone = info.phone;
  const contactAddress = info.address;
  const footerText = info.footer_text;
  const storeName = info.name || STORE_DEFAULTS.name;

  const instagramUrl = social.instagram
    ? (social.instagram.startsWith("http") ? social.instagram : `https://instagram.com/${String(social.instagram).replace(/^@/, "")}`)
    : null;
  const facebookUrl = social.facebook
    ? (social.facebook.startsWith("http") ? social.facebook : `https://facebook.com/${social.facebook}`)
    : null;
  const tiktokUrl = social.tiktok
    ? (social.tiktok.startsWith("http") ? social.tiktok : `https://tiktok.com/@${String(social.tiktok).replace(/^@/, "")}`)
    : null;
  const whatsappRaw = (social.whatsapp || "").toString().trim();
  const whatsappUrl = whatsappRaw
    ? (whatsappRaw.startsWith("http") ? whatsappRaw : `https://wa.me/${whatsappRaw.replace(/\D/g, "")}`)
    : null;

  const socials: Array<{ href: string; label: string; Icon: any }> = [];
  if (instagramUrl) socials.push({ href: instagramUrl, label: "Instagram", Icon: Instagram });
  if (facebookUrl) socials.push({ href: facebookUrl, label: "Facebook", Icon: Facebook });
  if (tiktokUrl) socials.push({ href: tiktokUrl, label: "TikTok", Icon: Music2 });
  if (whatsappUrl) socials.push({ href: whatsappUrl, label: "WhatsApp", Icon: MessageCircle });

  const linkCls = "text-[15px] text-white/60 transition-colors duration-150 [@media(hover:hover)]:hover:text-white";
  const columns = [
    { title: t("col_buy"), links: [[t("link_new"), "/produtos?ordem=novidades"], [t("link_best"), "/produtos?ordem=mais-vendidos"], [t("link_offers"), "/produtos?promo=1"], [t("link_custom"), "/contatos"], [t("link_kits"), "/kits"]].filter(([, href]) => hrefOn(href) && (href !== "/kits" || kitSettings.footerLink)) },
    { title: t("col_help"), links: [[t("link_faq"), "/faq"], [t("link_shipping"), "/faq#envios"], [t("link_returns"), "/devolucoes"], [t("link_contact"), "/contatos"]] },
    { title: t("col_about"), links: [[t("link_story"), "/sobre"], [t("link_reviews"), "/avaliacoes"], [t("link_blog"), "/blog"], [t("link_polls"), "/enquetes"], [t("link_forum"), "/forum"]].filter(([, href]) => hrefOn(href)) },
  ];

  return (
    <footer className="bg-brand-ink text-white">
      {/* Newsletter (pode ser escondida no Admin) */}
      {isVisible("newsletter") && <div className="border-b border-white/10">
        <div className="shell flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between md:py-12">
          <div>
            <p className="text-[24px] font-bold leading-tight tracking-[-0.03em] text-white md:text-[28px]">{t("newsletter_title")}</p>
            <p className="mt-1.5 text-[15px] text-white/60">{t("newsletter_sub")}</p>
          </div>
          <Newsletter />
        </div>
      </div>}

      <div className="shell grid grid-cols-2 gap-x-6 gap-y-10 py-12 md:grid-cols-4 lg:grid-cols-12">
        <div className="col-span-2 space-y-5 md:col-span-4 lg:col-span-5">
          <Logo tone="light" />
          <p className="max-w-sm text-[15px] leading-relaxed text-white/60">{footerText || t("footer_about")}</p>
          <ul className="space-y-2.5 text-sm">
            {contactPhone && <li className="flex items-center gap-3"><Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><a href={`tel:${String(contactPhone).replace(/\s+/g, "")}`} className={linkCls}>{contactPhone}</a></li>}
            {contactEmail && <li className="flex items-center gap-3"><Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><a href={`mailto:${contactEmail}`} className={`${linkCls} break-all`}>{contactEmail}</a></li>}
            {contactAddress && <li className="flex items-center gap-3"><MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span className="text-white/60">{contactAddress}</span></li>}
          </ul>
          {socials.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              {socials.map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-white/80 transition-colors duration-150 [@media(hover:hover)]:hover:border-primary [@media(hover:hover)]:hover:bg-primary [@media(hover:hover)]:hover:text-white">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </a>
              ))}
            </div>
          )}
        </div>

        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title} className="space-y-4 lg:col-span-2 lg:first-of-type:col-start-7">
            <h4 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white">{col.title}</h4>
            <ul className="space-y-2.5">
              {col.links.map(([label, to]) => <li key={to}><Link to={to} className={linkCls}>{label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>

      {/* Meios de pagamento aceitos no país escolhido (só os ligados no Admin > Pagamentos) */}
      <div className="shell pb-6">
        <PaymentMethods tone="dark" className="justify-center sm:justify-start" />
      </div>

      <div className="border-t border-white/10">
        <div className="shell flex flex-col items-center justify-between gap-3 py-5 pr-20 text-xs text-white/45 sm:flex-row sm:pr-24">
          <p className="text-center sm:text-left">{t("rights", { year: new Date().getFullYear(), name: storeName })}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link to="/termos" className="hover:text-white">{t("link_terms")}</Link>
            <Link to="/politica-privacidade" className="hover:text-white">{t("link_privacy")}</Link>
            <button type="button" onClick={() => openConsentPreferences()} className="hover:text-white">{t("link_cookies")}</button>
            {/* Portugal: o link do Livro de Reclamações Eletrónico tem de estar visível no site (DL 156/2005, art. 5.º-B) */}
            {jurisdictionOf(country.code) === "PT" && (
              <a href="https://www.livroreclamacoes.pt/" target="_blank" rel="noopener noreferrer" className="hover:text-white">{t("link_complaints")}</a>
            )}
            <a href="https://kodemi.pt/" target="_blank" rel="noopener noreferrer" aria-label="KodeMI" className="group inline-flex items-center">
              <img src={kodemiLogo.url} alt="KodeMI" loading="lazy" className="h-7 w-auto object-contain opacity-60 brightness-0 invert transition-opacity group-hover:opacity-100" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
