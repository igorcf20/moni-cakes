// =====================================================================================
// Moldura do painel Admin: barra lateral grafite presa ao topo no computador (marca da loja e menu em acordeão, AdminNav,
// que pode recolher para só ícones; escolha guardada neste navegador em "admin-sidebar"), barra do topo e a área
// de conteúdo. No celular, o menu abre pelo botão Menu, por baixo, na própria página.
// Usada pela página /admin (seções) e pelas páginas próprias (pedido, cliente, produto), para tudo abrir numa
// página com o menu ao lado, sem janelas por cima. Também confere se quem abre é administrador e, com a
// verificação em dois passos, mostra o passo do código (AdminMfaGate) antes do painel.
// =====================================================================================
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Loader2, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { useStoreName } from "@/hooks/useBrand";
import { adminManageMessages } from "@/i18n/adminManage";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useAdminSecurity";
import { AdminMfaGate } from "@/components/admin/AdminAccountSecurity";
import { useAdminAttention } from "@/hooks/useAdminAttention";
import AdminTopBar from "@/components/admin/AdminTopBar";
import AdminSetupHelper from "@/components/admin/AdminSetupHelper";
import { useMessages } from "@/i18n";
import { adminMessages } from "@/i18n/admin";
import { useFeatures } from "@/hooks/useFeatures";
import { sectionVisible } from "@/lib/features";
import { ADMIN_GROUPS, adminHref, sectionNameKey } from "./adminSections";
import AdminNav from "./AdminNav";

const SIDEBAR_KEY = "admin-sidebar";
const readCollapsed = () => { try { return localStorage.getItem(SIDEBAR_KEY) === "collapsed"; } catch { return false; } };

export default function AdminShell({ active, children }: { active: string; children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  // Estado de acesso do servidor: admin, admin a quem falta o código de 2 passos (ou ativar), ou não admin.
  const { data: access, isLoading: roleLoading } = useAdminAccess();
  const isAdmin = access === "ok";
  const needsMfa = access === "mfa_required" || access === "mfa_setup_required";
  const navigate = useNavigate();
  const { t } = useMessages(adminMessages);
  // Contadores do menu: o que está à espera do administrador (só depois de confirmar que é admin).
  const attention = useAdminAttention(!!isAdmin);
  // Recursos desligados em Admin > Recursos da loja tiram as suas seções do menu (a seção aberta fica visível).
  const { data: features } = useFeatures();
  const groups = ADMIN_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((s) => s.value === active || sectionVisible(features, s.value)) }))
    .filter((g) => g.items.length > 0);
  const current = groups.flatMap((g) => g.items).find((s) => s.value === active);
  const waitingTotal = groups.reduce((sum, g) => sum + g.items.reduce((n, s) => n + (s.badge?.(attention) ?? 0), 0), 0);
  // Celular: o menu abre por baixo do botão e fecha ao escolher uma seção.
  const [mobileOpen, setMobileOpen] = useState(false);
  // Computador: barra lateral aberta ou só com ícones.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = (next: boolean) => {
    setCollapsed(next);
    try { localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "open"); } catch { /* sem armazenamento: fica só nesta visita */ }
  };
  const { t: tm } = useMessages(adminManageMessages);
  const storeName = useStoreName();

  // Janelas e menus que abrem fora desta moldura (portais) também ficam com a fonte do painel.
  useEffect(() => {
    document.body.classList.add("admin-ui");
    return () => document.body.classList.remove("admin-ui");
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/shop-kodeadmin"); return; }
    if (roleLoading) return;
    if (!isAdmin && !needsMfa) navigate("/shop-kodeadmin");
  }, [user, isAdmin, needsMfa, authLoading, roleLoading, navigate]);

  if (authLoading || (user && roleLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }
  if (needsMfa) return <AdminMfaGate state={access} />;
  if (!isAdmin) return null;

  const open = (v: string) => navigate(adminHref.section(v));

  return (
    <div className="admin-ui min-h-screen bg-background lg:flex">
      {/* Computador: barra lateral grafite, presa ao topo com a altura da tela (sticky, porque a animação de
          página do site usa transform e uma posição fixa ficaria presa a ela). */}
      <aside
        className={`admin-sidebar sticky top-0 z-40 hidden h-screen shrink-0 flex-col transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex ${collapsed ? "w-[76px]" : "w-72"}`}
        aria-label={t("panel")}
      >
        <Link
          to="/admin"
          className={`flex h-16 shrink-0 items-center gap-3 border-b border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60 ${collapsed ? "justify-center px-0" : "px-5"}`}
          title={storeName}
        >
          <LogoMark className="h-9 w-9" />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-tight text-white">{storeName}</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">{tm("top_sub")}</span>
            </span>
          )}
        </Link>
        <div className={`min-h-0 flex-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-3"}`}>
          <AdminNav groups={groups} active={active} attention={attention} onPick={open} tone="dark" collapsed={collapsed} onExpand={() => toggleCollapsed(false)} />
        </div>
        <button
          type="button"
          onClick={() => toggleCollapsed(!collapsed)}
          aria-label={collapsed ? t("nav_expand") : t("nav_collapse")}
          title={collapsed ? t("nav_expand") : t("nav_collapse")}
          className={`flex h-12 shrink-0 items-center gap-3 border-t border-white/10 text-sm text-white/55 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60 ${collapsed ? "justify-center" : "px-5"}`}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" /> : <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
          {!collapsed && <span>{t("nav_collapse")}</span>}
        </button>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AdminTopBar groups={groups} attention={attention} current={current} onPick={open} />
        <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 md:px-6 lg:px-8 py-6 md:py-8">
          <aside className="mb-6 lg:hidden">
            {/* Celular: botão Menu com a seção atual; abre o mesmo acordeão por baixo, na própria página */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setMobileOpen((v) => !v)}
                aria-expanded={mobileOpen}
                aria-controls="admin-mobile-nav"
                className="w-full min-h-12 flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-left transition-colors duration-200 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg admin-sidebar text-white">
                  {current ? <current.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("nav_menu")}</span>
                  <span className="block truncate text-sm font-semibold text-foreground">{current ? t(sectionNameKey(current.value)) : t("choose_section")}</span>
                </span>
                {waitingTotal > 0 && !mobileOpen && (
                  <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-bold leading-5 text-primary-foreground tabular-nums">
                    {waitingTotal}
                    <span className="sr-only"> {t("needs_attention")}</span>
                  </span>
                )}
                <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${mobileOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              <div
                id="admin-mobile-nav"
                className={`grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none ${mobileOpen ? "grid-rows-[1fr] visible" : "grid-rows-[0fr] invisible"}`}
              >
                <div className="overflow-hidden">
                  <div className="mt-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
                    <AdminNav groups={groups} active={active} attention={attention} onPick={(v) => { setMobileOpen(false); open(v); }} />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <div className="min-w-0">{children}</div>
        </main>
      </div>
      <AdminSetupHelper openByDefault={active === "stats"} />
    </div>
  );
}
