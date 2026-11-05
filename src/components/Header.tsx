import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeature } from "@/hooks/useFeatures";
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Heart, Menu, Search, Shield, ShoppingBag, UserRound, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useAdminAccess } from '@/hooks/useAdminSecurity';
import { canOpenAdmin } from '@/lib/adminSecurity';
import { Logo } from '@/components/brand/Logo';
import { CountryPicker } from '@/components/CountryPicker';
import { SearchBox } from '@/components/header/SearchBox';
import { MegaMenu } from '@/components/header/MegaMenu';
import { MobileMenu } from '@/components/header/MobileMenu';
import { useMessages } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { LISTINGS } from '@/lib/catalog';
import { cn } from '@/lib/utils';

/** Ação do topo: ícone com rótulo (Ajuda, Minha conta, Favoritos, Carrinho). */
function Action({ to, Icon, label, badge, className }: { to: string; Icon: LucideIcon; label: string; badge?: number; className?: string }) {
  return (
    <Link to={to} className={cn('group flex h-11 min-w-[44px] items-center justify-center rounded-full text-foreground transition-colors duration-150 hover:bg-secondary hover:text-brand-orange-text', className)} aria-label={label} title={label}>
      <span className="relative">
        <Icon className="h-[21px] w-[21px]" strokeWidth={1.7} aria-hidden="true" />
        <AnimatePresence>
          {!!badge && (
            <motion.span
              key={badge} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }}
              className="absolute -right-2 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground ring-2 ring-background"
            >
              {badge > 99 ? '99+' : badge}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </Link>
  );
}

const Header = () => {
  const { t } = useMessages(layoutMessages);
  const wishlistOn = useFeature('wishlist');
  const menu = useCatalogMenu();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { itemCount: authItemCount } = useCart(user?.id);
  const { data: access } = useAdminAccess();
  const isAdmin = !!access && canOpenAdmin(access);
  const [menuOpen, setMenuOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const timer = useRef<number | null>(null);

  const loadGuestCount = useCallback(() => {
    if (user) return;
    try {
      const items = JSON.parse(localStorage.getItem('guest_cart') || '[]');
      setGuestCount(items.reduce((s: number, i: any) => s + (i.quantity || 1), 0));
    } catch { setGuestCount(0); }
  }, [user]);
  useEffect(() => {
    loadGuestCount();
    window.addEventListener('guest_cart_updated', loadGuestCount);
    return () => window.removeEventListener('guest_cart_updated', loadGuestCount);
  }, [loadGuestCount]);
  const cartCount = user ? authItemCount : guestCount;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { setMegaOpen(false); setMenuOpen(false); setMobileSearch(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!megaOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMegaOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [megaOpen]);

  // Abre ao passar o mouse (ou clicar); fecha com um pequeno atraso para o cursor chegar ao painel.
  const openMega = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setMegaOpen(true), 60); };
  const closeMega = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setMegaOpen(false), 160); };

  const isActive = (slug: string) => location.pathname === `/categoria/${slug}`;
  const offersActive = location.pathname + location.search === LISTINGS.offers;

  return (
    <header className={cn('sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-md transition-[box-shadow,border-color] duration-200 supports-[backdrop-filter]:bg-background/85', scrolled ? 'border-border shadow-[var(--shadow-soft)]' : 'border-transparent')}>
      {/* Uma linha só (cabeçalho editorial): logo, categorias, busca e ações. A busca abre por baixo até 1536px. */}
      <div className="relative" onMouseLeave={closeMega}>
        <div className="shell flex h-16 items-center gap-2 lg:h-[76px] lg:gap-6">
          <button type="button" onClick={() => setMenuOpen(true)} className="-ml-2 grid h-11 w-11 place-items-center rounded-xl hover:bg-secondary lg:hidden" aria-label={t('menu')}>
            <Menu className="h-6 w-6" strokeWidth={1.7} />
          </button>
          <Logo />
          <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 lg:flex xl:ml-6" aria-label={t('browse')}>
            <button
              type="button" onMouseEnter={openMega} onClick={() => setMegaOpen((v) => !v)} aria-expanded={megaOpen}
              className={cn('flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[15px] font-medium transition-colors duration-150 hover:text-brand-orange-text', megaOpen ? 'text-brand-orange-text' : 'text-foreground')}
            >
              {t('browse')}<ChevronDown className={cn('h-4 w-4 transition-transform duration-200', megaOpen && 'rotate-180')} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {/* Cabem 3 categorias a 1024px e 4 a partir de 1280px; todas estão no menu Categorias. */}
            {menu.slice(0, 4).map((c, i) => (
              <Link
                key={c.slug} to={`/categoria/${c.slug}`} aria-current={isActive(c.slug) ? 'page' : undefined} onMouseEnter={closeMega}
                className={cn('relative whitespace-nowrap px-3 py-2 text-[15px] font-medium transition-colors duration-150 hover:text-brand-orange-text', i >= 3 && 'hidden xl:block',
                  'after:absolute after:inset-x-3 after:bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-200 hover:after:scale-x-100',
                  isActive(c.slug) ? 'text-brand-orange-text after:scale-x-100' : 'text-foreground')}
              >
                {c.name}
              </Link>
            ))}
            <Link to={LISTINGS.offers} className={cn('whitespace-nowrap px-3 py-2 text-[15px] font-medium text-brand-orange-text transition-colors duration-150 hover:text-primary-hover', offersActive && 'underline underline-offset-4')}>
              {t('offers')}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-0.5 lg:ml-0">
            <div className="hidden w-[240px] 2xl:block"><SearchBox compact /></div>
            <button type="button" onClick={() => setMobileSearch((v) => !v)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-secondary 2xl:hidden" aria-label={t('search')} aria-expanded={mobileSearch}>
              {mobileSearch ? <X className="h-[21px] w-[21px]" strokeWidth={1.7} /> : <Search className="h-[21px] w-[21px]" strokeWidth={1.7} />}
            </button>
            <div className="ml-1 hidden lg:block"><CountryPicker /></div>
            {isAdmin && <Link to="/admin" className="hidden h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground lg:grid" aria-label={t('admin')} title={t('admin')}><Shield className="h-[18px] w-[18px]" strokeWidth={1.7} /></Link>}
            <Action to={user ? '/dashboard' : '/auth'} Icon={UserRound} label={user ? t('myAccount') : t('signIn')} className="hidden lg:flex" />
            {wishlistOn && <Action to="/favoritos" Icon={Heart} label={t('favorites')} className="hidden lg:flex" />}
            <Action to="/carrinho" Icon={ShoppingBag} label={t('cart')} badge={cartCount} />
          </div>
        </div>
        <AnimatePresence>
          {megaOpen && <MegaMenu onNavigate={() => setMegaOpen(false)} onMouseEnter={openMega} onMouseLeave={closeMega} />}
        </AnimatePresence>
      </div>

      {/* Busca (celular e telas até 1536px): abre por baixo do topo */}
      <AnimatePresence initial={false}>
        {mobileSearch && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="2xl:hidden">
            <div className="shell pb-3"><div className="mx-auto max-w-[720px]"><SearchBox autoFocus onDone={() => setMobileSearch(false)} /></div></div>
          </motion.div>
        )}
      </AnimatePresence>

      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} signedIn={!!user} isAdmin={isAdmin} onSignOut={() => void signOut()} />
    </header>
  );
};

export default Header;
