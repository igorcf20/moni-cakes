// Classes e animações partilhadas das páginas institucionais e de avaliação (visual PRINT3D).
// Ficam fora de ./ui.tsx para esse ficheiro exportar só componentes (Fast Refresh).
export { btnPrimary, btnSecondary } from '@/components/catalog/ui';

/** Classes comuns: cartão branco, eyebrow, títulos e campos de formulário. */
export const card = 'rounded-[20px] border border-brand-card-border bg-white shadow-[var(--shadow-card)]';
export const eyebrow = 'text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text';
export const h1 = 'text-[34px] font-extrabold leading-[1.06] tracking-[-0.035em] [text-wrap:balance] sm:text-[44px] lg:text-[52px]';
export const h2 = 'text-[26px] font-bold leading-tight tracking-[-0.03em] [text-wrap:balance] md:text-[34px]';
export const h3 = 'text-[20px] font-bold leading-snug tracking-[-0.02em] md:text-[22px]';
export const field = 'h-12 rounded-[14px] border-border bg-white text-[16px] md:text-[15px]';
export const textarea = 'min-h-[140px] rounded-[14px] border-border bg-white text-[16px] md:text-[15px]';
export const linkInline = 'font-semibold text-brand-orange-text underline-offset-4 transition-colors duration-150 hover:underline';

const EASE = [0.16, 1, 0.3, 1] as const;

/** Aparecer suave ao entrar na tela (desligado por "reduzir movimento" via MotionConfig). */
export const reveal = (i = 0) => ({
  initial: { opacity: 0, y: 10 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.25, ease: EASE, delay: i * 0.04 },
});
export const appear = (i = 0) => ({
  initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease: EASE, delay: i * 0.05 },
});
