import { Home, LayoutGrid, ShoppingCart, HelpCircle, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useMessages } from "@/i18n";
import { shellMessages } from "@/i18n/pagesShell";

// Barra de navegação fixa no celular (escondida no Admin e na entrada). Ativo em laranja.
const MobileTabBar = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { itemCount } = useCart(user?.id);
  const { t } = useMessages(shellMessages);

  if (
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/shop-kode") ||
    location.pathname === "/auth"
  ) {
    return null;
  }

  const items = [
    { key: "home", label: t("tabHome"), icon: Home, path: "/", match: ["/"] },
    { key: "products", label: t("tabProducts"), icon: LayoutGrid, path: "/produtos", match: ["/produtos", "/categoria", "/produto/"] },
    {
      key: "cart", label: t("tabCart"), icon: ShoppingCart, path: "/carrinho", match: ["/carrinho", "/checkout"], badge: itemCount,
      aria: itemCount > 0 ? (itemCount === 1 ? t("tabCartCountOne") : t("tabCartCount", { count: itemCount })) : undefined,
    },
    { key: "help", label: t("tabHelp"), icon: HelpCircle, path: "/ajuda", match: ["/ajuda", "/faq", "/contatos", "/rastrear"] },
    { key: "account", label: user ? t("tabAccount") : t("tabSignIn"), icon: User, path: user ? "/dashboard" : "/auth", match: ["/dashboard", "/minhas-compras", "/favoritos"] },
  ];

  const isActive = (match: string[]) =>
    match.some((m) => (m === "/" ? location.pathname === "/" : location.pathname.startsWith(m)));

  return (
    <nav
      aria-label={t("tabNav")}
      className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-white/95 backdrop-blur-xl supports-[backdrop-filter]:bg-white/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.18)]"
    >
      <ul className="flex items-stretch justify-around h-16 px-1">
        {items.map((item) => {
          const active = isActive(item.match);
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex-1 min-w-0">
              <Link
                to={item.path}
                aria-current={active ? "page" : undefined}
                aria-label={item.aria}
                className="relative h-full flex flex-col items-center justify-center gap-1 px-1 group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 bg-primary rounded-b-full" aria-hidden="true" />
                )}
                <span
                  className={`relative inline-flex items-center justify-center h-9 w-9 rounded-[12px] transition-colors duration-150 ${
                    active
                      ? "bg-accent text-primary"
                      : "text-brand-ink-soft group-hover:text-foreground"
                  }`}
                >
                  <Icon className="h-[19px] w-[19px]" strokeWidth={1.8} aria-hidden="true" />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none tabular-nums" aria-hidden="true">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`text-[11px] font-medium truncate max-w-full transition-colors duration-150 ${
                    active ? "text-brand-orange-text font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MobileTabBar;
