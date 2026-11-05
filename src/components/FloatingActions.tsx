import { ArrowUp } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useMessages } from "@/i18n";
import { shellMessages } from "@/i18n/pagesShell";

// Botão "voltar ao topo": aparece depois de 400px de rolagem, acima da barra do celular.
// Fora do Admin: lá o canto é do cartão Primeiros passos e das barras de Gravar.
const FloatingActions = () => {
  const { t } = useMessages(shellMessages);
  const { pathname } = useLocation();
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 400);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  if (pathname.startsWith("/admin")) return null;

  return (
    <div
      className={`fixed bottom-20 lg:bottom-6 right-4 md:right-6 z-40 transition-[opacity,transform] duration-200 ${
        showBackToTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
      }`}
    >
      <button
        type="button"
        onClick={scrollToTop}
        aria-label={t("backToTop")}
        title={t("backToTop")}
        tabIndex={showBackToTop ? 0 : -1}
        aria-hidden={showBackToTop ? undefined : true}
        className="grid h-11 w-11 place-items-center rounded-[14px] border border-brand-card-border bg-white text-foreground shadow-[var(--shadow-card)] transition-[background-color,color,border-color,transform] duration-150 hover:border-primary hover:bg-primary hover:text-primary-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowUp className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
};

export default FloatingActions;
