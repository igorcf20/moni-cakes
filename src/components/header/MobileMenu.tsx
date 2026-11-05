import { Link } from 'react-router-dom';
import { useFeature, useHrefOn } from "@/hooks/useFeatures";
import { ChevronRight, Flame, Gift, Heart, LogOut, Shield, Sparkles, Star, Upload, UserRound, Wand2, X, type LucideIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Logo } from '@/components/brand/Logo';
import { CountryPicker } from '@/components/CountryPicker';
import { useMessages } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { LISTINGS } from '@/lib/catalog';
import { useMegaMenuSettings } from '@/hooks/useOfferSettings';
import { DEFAULT_MEGA_MENU, pickFeatured } from '@/lib/megaMenu';
import { CategoryBanner } from './MegaMenu';

type Props = { open: boolean; onOpenChange: (v: boolean) => void; signedIn: boolean; isAdmin: boolean; onSignOut: () => void };

/** Menu do celular: gaveta lateral, categorias em acordeão e atalhos com alvos de toque de 44px ou mais. */
export function MobileMenu({ open, onOpenChange, signedIn, isAdmin, onSignOut }: Props) {
  const { t } = useMessages(layoutMessages);
  const wishlistOn = useFeature('wishlist');
  const hrefOn = useHrefOn();
  const menu = useCatalogMenu();
  const { data: mega = DEFAULT_MEGA_MENU } = useMegaMenuSettings();
  // Categorias em destaque (Admin > Categorias > Menu de categorias), numa faixa que rola para o lado.
  const featured = mega.mobile ? pickFeatured(menu, mega) : [];
  const close = () => onOpenChange(false);
  const shortcuts: [LucideIcon, string, string][] = [
    [Flame, t('offers'), LISTINGS.offers], [Sparkles, t('quick_new'), LISTINGS.new], [Star, t('quick_best'), LISTINGS.best],
    [Wand2, t('sub_create'), '/personalizar'], [Upload, t('sub_upload'), '/orcamento-3d'], [Gift, t('quick_gifts'), LISTINGS.gifts],
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col gap-0 overflow-y-auto bg-background p-0 [&>button]:hidden">
        <SheetTitle className="sr-only">{t('menu')}</SheetTitle>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-4 py-3">
          <Logo />
          <button type="button" onClick={close} className="grid h-11 w-11 place-items-center rounded-xl hover:bg-secondary" aria-label={t('closeMenu')}><X className="h-5 w-5" /></button>
        </div>

        {featured.length > 0 && (
          <div className="pt-4">
            <p className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('mega_featured')}</p>
            <ul className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {featured.map((c) => (
                <li key={c.slug} className="w-[72%] shrink-0 snap-start">
                  <CategoryBanner c={c} onNavigate={close} showText={mega.showText} see={t('mega_see')} className="aspect-[16/10]" />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="px-4 pt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('allCategories')}</p>
          <Accordion type="single" collapsible className="w-full">
            {menu.map((c) => (
              <AccordionItem key={c.slug} value={c.slug} className="border-border">
                <AccordionTrigger className="min-h-[52px] py-3 text-[15px] font-semibold hover:no-underline">
                  <span className="flex items-center gap-3"><c.Icon className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden="true" />{c.name}</span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-0.5 pb-1 pl-8">
                    {c.subs.map((s) => (
                      <li key={s.id}><Link to={s.href} onClick={close} className="flex min-h-[44px] items-center text-[15px] text-brand-ink-soft">{s.label}</Link></li>
                    ))}
                    <li><Link to={`/categoria/${c.slug}`} onClick={close} className="flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-brand-orange-text">{t('seeAllIn', { name: c.name })}<ChevronRight className="h-4 w-4" /></Link></li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 py-4">
          {shortcuts.filter(([, , href]) => hrefOn(href)).map(([Icon, label, href]) => (
            <Link key={href + label} to={href} onClick={close} className="flex min-h-[48px] items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium">
              <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" /><span className="truncate">{label}</span>
            </Link>
          ))}
        </div>

        <div className="mt-auto space-y-3 border-t border-border bg-white p-4">
          <CountryPicker block />
          <div className="flex gap-2">
            <Link to={signedIn ? '/dashboard' : '/auth'} onClick={close} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-ink text-sm font-semibold text-white">
              <UserRound className="h-4 w-4" aria-hidden="true" />{signedIn ? t('myAccount') : t('signIn')}
            </Link>
            {wishlistOn && <Link to="/favoritos" onClick={close} className="grid h-12 w-12 place-items-center rounded-xl border border-border" aria-label={t('favorites')}><Heart className="h-5 w-5" /></Link>}
            {isAdmin && <Link to="/admin" onClick={close} className="grid h-12 w-12 place-items-center rounded-xl border border-border" aria-label={t('admin')}><Shield className="h-5 w-5" /></Link>}
            {signedIn && <button type="button" onClick={() => { onSignOut(); close(); }} className="grid h-12 w-12 place-items-center rounded-xl border border-border" aria-label={t('signOut')}><LogOut className="h-5 w-5" /></button>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
