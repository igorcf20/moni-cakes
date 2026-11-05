// Blocos da Moni Cakes na página de detalhe do bolo (/produto/:id): como encomendar, em três passos, e convite
// para um bolo personalizado pelo canal real de pedidos (WhatsApp do Admin ou /contatos). Sem prazos nem
// preços inventados: o prazo real vem do produto (Prazos e entrega) e aparece no bloco de compra.
import { Link } from 'react-router-dom';
import { ArrowRight, CakeSlice, CalendarHeart, PartyPopper } from 'lucide-react';
import { useMessages } from '@/i18n';
import { moniHomeMessages } from '@/i18n/moniHome';
import { MONI_IMG } from '@/lib/moniHome';
import { WhatsIcon } from './MoniHeader';

export function MoniCakeOrder({ order }: { order: { href: string; external: boolean } }) {
  const { t } = useMessages(moniHomeMessages);
  const steps = [
    { Icon: CakeSlice, title: t('pdpStep1Title'), text: t('pdpStep1Text') },
    { Icon: CalendarHeart, title: t('pdpStep2Title'), text: t('pdpStep2Text') },
    { Icon: PartyPopper, title: t('pdpStep3Title'), text: t('pdpStep3Text') },
  ];
  const cta = (
    <>
      {order.external ? <WhatsIcon className="h-5 w-5" /> : null}
      {t('pdpTalkCta')}
      <ArrowRight className="mc-btn__arrow h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
    </>
  );
  return (
    <>
      <section className="mc-pdp-steps" aria-labelledby="mc-pdp-steps-title">
        <p className="mc-eyebrow">{t('pdpStepsEyebrow')}</p>
        <h2 id="mc-pdp-steps-title" className="mc-display mt-3 text-[36px] text-[hsl(var(--brand-ink-soft))] md:text-[48px]">{t('pdpStepsTitle')}</h2>
        <ol className="mt-10 grid gap-5 md:grid-cols-3 md:gap-6">
          {steps.map(({ Icon, title, text }, i) => (
            <li key={title} className="mc-pdp-step">
              <span className="mc-pdp-step__num mc-serif" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <span className="mc-pdp-step__icon"><Icon className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" /></span>
              <h3 className="mc-serif mt-5 text-[26px] leading-tight text-[hsl(var(--brand-ink-soft))]">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[hsl(var(--brand-ink-soft))]/80">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mc-pdp-talk" aria-labelledby="mc-pdp-talk-title">
        <div className="mc-pdp-talk__text">
          <h2 id="mc-pdp-talk-title" className="mc-display text-[38px] md:text-[54px]">{t('pdpTalkTitle')}</h2>
          <p className="mt-4 max-w-[460px] text-[16px] leading-relaxed text-[#fff5e9]/90 md:text-[17px]">{t('pdpTalkText')}</p>
          <div className="mt-7">
            {order.external
              ? <a href={order.href} target="_blank" rel="noopener noreferrer" className="mc-btn mc-btn--coral">{cta}</a>
              : <Link to={order.href} className="mc-btn mc-btn--coral">{cta}</Link>}
          </div>
        </div>
        <div className="mc-pdp-talk__art" aria-hidden="true">
          <img src={MONI_IMG.floral} alt="" width={618} height={622} loading="lazy" className="mc-pdp-talk__cake" />
          <img src={MONI_IMG.rose1} alt="" width={169} height={151} loading="lazy" className="mc-pdp-talk__rose" />
          <img src={MONI_IMG.petals[0]} alt="" width={60} height={60} loading="lazy" className="mc-pdp-talk__petal" />
        </div>
      </section>
    </>
  );
}
