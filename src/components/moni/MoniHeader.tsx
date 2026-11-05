// Cabeçalho da página inicial Moni Cakes: minimalista e integrado ao fundo do hero.
// Logo à esquerda, navegação ao centro, WhatsApp, carrinho e botão de encomenda à direita;
// no celular, cabeçalho compacto com menu que abre por baixo.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, ShoppingBag, User, X } from 'lucide-react';
import { useMessages } from '@/i18n';
import { moniHomeMessages } from '@/i18n/moniHome';
import { useBrand } from '@/hooks/useBrand';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';

export function WhatsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 20.5l1.3-4.1A8.5 8.5 0 1 1 8 19.4z" />
      <path d="M9 8.6c.2-.5.5-.6.9-.6h.4c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .5-.1.6l-.5.6c.6 1.2 1.6 2.2 2.8 2.8l.6-.5c.2-.1.4-.2.6-.1l1.5.6c.3.1.4.3.4.5v.4c0 .4-.2.7-.6.9-.6.3-1.4.4-2.2.1A8.6 8.6 0 0 1 8.9 11c-.3-.9-.2-1.7.1-2.4z" />
    </svg>
  );
}

function useCartCount() {
  const { user } = useAuth();
  const { itemCount } = useCart(user?.id);
  const [guest, setGuest] = useState(0);
  const load = useCallback(() => {
    if (user) return;
    try {
      const items = JSON.parse(localStorage.getItem('guest_cart') || '[]');
      setGuest(items.reduce((s: number, i: { quantity?: number }) => s + (i.quantity || 1), 0));
    } catch { setGuest(0); }
  }, [user]);
  useEffect(() => {
    load();
    window.addEventListener('guest_cart_updated', load);
    return () => window.removeEventListener('guest_cart_updated', load);
  }, [load]);
  return user ? itemCount : guest;
}

export type NavItem = { label: string; href: string };

export function MoniHeader({ order, whatsHref }: { order: { href: string; external: boolean }; whatsHref: string | null }) {
  const { t } = useMessages(moniHomeMessages);
  const brand = useBrand();
  const cartCount = useCartCount();
  const [open, setOpen] = useState(false);
  const nav: NavItem[] = [
    { label: t('navHome'), href: '/' },
    { label: t('navCakes'), href: '#nossos-bolos' },
    { label: t('navMenu'), href: '/produtos' },
    { label: t('navOrders'), href: '#encomendar' },
    { label: t('navAbout'), href: '/sobre' },
  ];
  const logo = brand.logos.wordmarkLight || brand.logos.wordmark;

  const NavLink = ({ item, onClick }: { item: NavItem; onClick?: () => void }) =>
    item.href.startsWith('#')
      ? <a href={item.href} onClick={onClick}>{item.label}</a>
      : <Link to={item.href} onClick={onClick} aria-current={item.href === '/' ? 'page' : undefined}>{item.label}</Link>;

  const OrderButton = ({ className = '' }: { className?: string }) => order.external
    ? <a href={order.href} target="_blank" rel="noopener noreferrer" className={`mc-btn mc-btn--coral ${className}`}><ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t('orderCta')}</a>
    : <Link to={order.href} className={`mc-btn mc-btn--coral ${className}`}><ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t('orderCta')}</Link>;

  return (
    <header className="mc-header" data-mc-header>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:text-foreground">{t('skip')}</a>
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:h-[104px] lg:px-12">
        <Link to="/" className="shrink-0" aria-label={brand.name}>
          {logo
            ? <img src={logo} alt={brand.name} width={480} height={310} className="h-[56px] w-auto lg:h-[88px]" />
            : <span className="mc-serif text-3xl">{brand.name}</span>}
        </Link>
        <nav aria-label={t('navAria')} className="mc-nav mx-auto hidden items-center gap-9 lg:flex">
          {nav.map((n) => <NavLink key={n.href} item={n} />)}
        </nav>
        <div className="ml-auto flex items-center gap-1 lg:ml-0 lg:gap-2">
          {whatsHref && (
            <a href={whatsHref} target="_blank" rel="noopener noreferrer" className="mc-icon-btn grid" aria-label={t('whatsAria')}>
              <WhatsIcon className="h-[22px] w-[22px]" />
            </a>
          )}
          <Link to="/dashboard" className="mc-icon-btn hidden sm:grid" aria-label={t('accountAria')}>
            <User className="h-[21px] w-[21px]" strokeWidth={1.7} />
          </Link>
          <Link to="/carrinho" className="mc-icon-btn grid" aria-label={t('cartAria', { count: cartCount })}>
            <ShoppingBag className="h-[21px] w-[21px]" strokeWidth={1.7} />
            {cartCount > 0 && (
              <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#fff5e9] px-1 text-[11px] font-bold text-primary">{cartCount}</span>
            )}
          </Link>
          <OrderButton className="ml-2 hidden lg:inline-flex" />
          <button type="button" className="mc-icon-btn grid lg:hidden" aria-expanded={open} aria-controls="mc-mobile-nav"
            aria-label={open ? t('menuClose') : t('menuOpen')} onClick={() => setOpen((v) => !v)}>
            {open ? <X className="h-6 w-6" strokeWidth={1.7} /> : <Menu className="h-6 w-6" strokeWidth={1.7} />}
          </button>
        </div>
      </div>
      {open && (
        <div id="mc-mobile-nav" className="mx-4 rounded-3xl bg-[#fff5e9] p-5 text-[hsl(var(--brand-ink-soft))] shadow-2xl lg:hidden">
          <nav aria-label={t('navAria')} className="flex flex-col gap-1 text-lg">
            {nav.map((n) => (
              <span key={n.href} className="rounded-xl px-3 py-2.5 hover:bg-primary/10"><NavLink item={n} onClick={() => setOpen(false)} /></span>
            ))}
          </nav>
          <OrderButton className="mt-4 w-full" />
        </div>
      )}
    </header>
  );
}
