// Peças partilhadas das páginas institucionais e de avaliação (visual PRINT3D): moldura da página,
// cabeçalho com trilho, cartão de estado (carregando, sucesso, erro) e escolha de nota com estrelas acessível.
import { useId, useState, type ReactNode } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Star, type LucideIcon } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { CatalogBreadcrumb } from '@/components/catalog/CatalogBreadcrumb';
import { useMessages } from '@/i18n';
import { reviewMessages } from '@/i18n/pages';
import { cn } from '@/lib/utils';
import { appear, card, eyebrow, h1 } from './styles';

/** Moldura das páginas: cabeçalho, conteúdo, rodapé e animações que respeitam "reduzir movimento". */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main id="conteudo" className={cn('flex-1 pb-16 md:pb-20', className)}>{children}</main>
        <Footer />
      </div>
    </MotionConfig>
  );
}

/** Trilho, eyebrow, H1 e texto de abertura das páginas internas. */
export function PageIntro({ crumbs, kicker, title, lead, children, center = false }: {
  crumbs?: { label: string; href?: string }[]; kicker?: ReactNode; title: ReactNode; lead?: ReactNode; children?: ReactNode; center?: boolean;
}) {
  return (
    <div className={cn('pt-5 md:pt-8', center && 'text-center')}>
      {crumbs && <div className={cn(center && 'flex justify-center')}><CatalogBreadcrumb items={crumbs} /></div>}
      <motion.div {...appear()} className={cn('mt-6 max-w-3xl md:mt-8', center && 'mx-auto')}>
        {kicker && <p className={eyebrow}>{kicker}</p>}
        <h1 className={cn(h1, kicker && 'mt-3')}>{title}</h1>
        {lead && <p className={cn('mt-4 max-w-2xl text-[17px] leading-relaxed text-brand-ink-soft md:text-lg', center && 'mx-auto')}>{lead}</p>}
        {children}
      </motion.div>
    </div>
  );
}

const TONES = {
  brand: 'bg-accent text-primary',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  error: 'bg-destructive/10 text-destructive',
  muted: 'bg-brand-alt text-brand-ink-soft',
} as const;

/** Cartão centrado para estados de página: a carregar, concluído, aviso ou erro. */
export function StatusCard({ Icon, tone = 'brand', title, text, children, busy = false, headingLevel = 1 }: {
  Icon: LucideIcon; tone?: keyof typeof TONES; title: ReactNode; text?: ReactNode; children?: ReactNode; busy?: boolean; headingLevel?: 1 | 2;
}) {
  const H = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <motion.section
      {...appear()}
      role={busy ? 'status' : undefined}
      aria-live={busy ? 'polite' : undefined}
      className={cn(card, 'mx-auto w-full max-w-xl px-6 py-10 text-center sm:px-10 sm:py-12')}
    >
      <span className={cn('mx-auto grid h-16 w-16 place-items-center rounded-[18px]', TONES[tone])}>
        <Icon className={cn('h-8 w-8', busy && 'animate-spin')} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <H className="mt-6 text-[24px] font-bold leading-tight tracking-[-0.03em] [text-wrap:balance] sm:text-[28px]">{title}</H>
      {text && <div className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-muted-foreground">{text}</div>}
      {children && <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">{children}</div>}
    </motion.section>
  );
}

/** Rótulo de campo com marca de opcional. */
export function FieldLabel({ htmlFor, children, optional, hint }: { htmlFor?: string; children: ReactNode; optional?: string; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold text-foreground">
      {children}
      {optional && <span className="text-[13px] font-normal text-muted-foreground">({optional})</span>}
      {hint && <span className="text-[13px] font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

/**
 * Nota de 1 a 5 estrelas como grupo de rádio (Radix): Tab entra no grupo, as setas mudam a nota,
 * cada estrela tem 44px de toque e um nome acessível ("4 estrelas"); o texto da nota é anunciado.
 */
export function StarRatingInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label?: string }) {
  const { t } = useMessages(reviewMessages);
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const shown = hover ?? value;
  const words = [t('r1'), t('r2'), t('r3'), t('r4'), t('r5')];
  return (
    <div>
      <span id={`${id}-label`} className="mb-1.5 block text-[15px] font-semibold text-foreground">{label ?? t('rating')}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RadioGroupPrimitive.Root
          value={String(value)}
          onValueChange={(v) => onChange(Number(v))}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          orientation="horizontal"
          loop={false}
          className="-ml-1.5 flex items-center"
          onMouseLeave={() => setHover(null)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <RadioGroupPrimitive.Item
              key={n}
              value={String(n)}
              aria-label={n === 1 ? t('star_one') : t('star_other', { n })}
              onMouseEnter={() => setHover(n)}
              className="grid h-11 w-11 place-items-center rounded-[12px] transition-transform duration-150 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Star
                strokeWidth={1.7}
                aria-hidden="true"
                className={cn('h-8 w-8 transition-colors duration-150', n <= shown ? 'fill-primary text-primary' : 'fill-transparent text-muted-foreground/40')}
              />
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        {/* O texto visível segue o rato; o anúncio para leitores de tela segue só a nota escolhida. */}
        <span aria-hidden="true" className="min-w-[90px] text-[15px] font-semibold text-brand-orange-text">{words[shown - 1]}</span>
        <span aria-live="polite" className="sr-only">{words[value - 1]}</span>
      </div>
      <p id={`${id}-hint`} className="sr-only">{t('ratingHint')}</p>
    </div>
  );
}
