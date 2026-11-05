import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import FeatureLink from "@/components/FeatureLink";
import { useStoreName } from '@/hooks/useBrand';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import {
  ArrowDown, ArrowRight, Check, ChevronRight, FileText, KeyRound, Loader2, MessageCircle, Minus, Palette, Plus, Rotate3d, Ruler,
  Shapes, ShoppingBag, SquareUser, Type, Upload,
} from 'lucide-react';
import type { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { AnimatedValue } from '@/components/AnimatedValue';
import { useVisualSettings } from '@/hooks/useVisualSettings';
import { useMessages } from '@/i18n';
import { customizerMessages } from '@/i18n/customizer';
import { countryName, useCountry } from '@/lib/countries';
import { formatMoney } from '@/lib/money';
import { estimate, measureStl } from '@/lib/print3d';
import { buildModel, loadFont, mergeParts, TEMPLATES, type FontId, type Model, type SizeId, type TemplateId } from '@/lib/parametric';
import { cn } from '@/lib/utils';

const PartsViewer = lazy(() => import('@/components/print3d/PartsViewer').then((m) => ({ default: m.PartsViewer })));

const EASE = [0.16, 1, 0.3, 1] as const;
const COLORS = [
  { id: 'white', hex: '#f1ede4' }, { id: 'black', hex: '#1c1c1c' }, { id: 'gold', hex: '#d9a041' }, { id: 'red', hex: '#c8202c' },
  { id: 'blue', hex: '#1d4fbf' }, { id: 'green', hex: '#1f9d55' }, { id: 'purple', hex: '#7a4cc2' }, { id: 'pink', hex: '#e46aa0' }, { id: 'gray', hex: '#a3a6a8' },
] as const;
type ColorId = (typeof COLORS)[number]['id'];
const TWO_COLOR_PCT = 15;
const SIZES: SizeId[] = ['S', 'M', 'L'];
const TEMPLATE_ICON: Record<TemplateId, typeof KeyRound> = { keychain: KeyRound, nameplate: SquareUser };

// Botões do sistema visual PRINT3D (raio 14px, 48px de altura, laranja com hover mais escuro).
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const btnPrimary = `inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] ${focusRing}`;
const btnSecondary = `inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-5 text-[15px] font-semibold text-foreground transition-colors duration-150 hover:border-foreground/30 ${focusRing}`;
const cardTitle = 'text-[20px] font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[22px]';

const appear = (delay = 0) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease: EASE, delay } });

function Step({ n, title, children, delay = 0 }: { n: number; title: string; children: ReactNode; delay?: number }) {
  return (
    <motion.section {...appear(0.1 + delay)} className="rounded-[20px] border border-brand-card-border bg-white p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby={`step-${n}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent text-sm font-bold tabular-nums text-brand-orange-text" aria-hidden="true">{n}</span>
        <h2 id={`step-${n}`} className={cardTitle}>{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

/** Amostras de cor (rádio acessível com setas do teclado, via Radix). */
function Swatches({ value, onChange, label, names }: { value: ColorId; onChange: (c: ColorId) => void; label: string; names: (id: ColorId) => string }) {
  return (
    <RadioGroupPrimitive.Root value={value} onValueChange={(v) => onChange(v as ColorId)} aria-label={label} className="flex flex-wrap gap-2.5">
      {COLORS.map((c) => (
        <RadioGroupPrimitive.Item
          key={c.id} value={c.id} aria-label={names(c.id)} title={names(c.id)}
          className={cn('grid h-11 w-11 place-items-center rounded-full border border-black/10 shadow-inner transition-transform duration-150 hover:scale-105', focusRing, 'data-[state=checked]:ring-2 data-[state=checked]:ring-primary data-[state=checked]:ring-offset-2 data-[state=checked]:ring-offset-white')}
          style={{ background: c.hex }}
        >
          <RadioGroupPrimitive.Indicator>
            <Check className={cn('h-[18px] w-[18px]', ['white', 'gold', 'gray', 'pink'].includes(c.id) ? 'text-black/70' : 'text-white')} strokeWidth={2} aria-hidden="true" />
          </RadioGroupPrimitive.Indicator>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

function Tile({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={cn(
        'min-h-[48px] rounded-[14px] border px-3.5 py-3 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.99]', focusRing,
        active ? 'border-primary bg-accent' : 'border-border bg-white hover:border-primary/50', className,
      )}
    >
      {children}
    </button>
  );
}

export default function Personalizar() {
  const { t, locale } = useMessages(customizerMessages);
  const storeName = useStoreName();
  const country = useCountry();
  const { data: visual } = useVisualSettings();

  const [template, setTemplate] = useState<TemplateId>('keychain');
  const [text, setText] = useState(TEMPLATES[0].defaultText);
  const [fontId, setFontId] = useState<FontId>('sans');
  const [base, setBase] = useState<ColorId>('black');
  const [detail, setDetail] = useState<ColorId>('gold');
  const [twoColors, setTwoColors] = useState(true);
  const [size, setSize] = useState<SizeId>('M');
  const [qty, setQty] = useState(1);
  const [font, setFont] = useState<Font | null>(null);
  const deferredText = useDeferredValue(text);
  const tpl = TEMPLATES.find((x) => x.id === template)!;

  useEffect(() => {
    let alive = true;
    setFont(null);
    loadFont(fontId).then((f) => { if (alive) setFont(f); });
    return () => { alive = false; };
  }, [fontId]);

  const chooseTemplate = (id: TemplateId) => {
    const next = TEMPLATES.find((x) => x.id === id)!;
    setTemplate(id);
    if (!text.trim() || text === tpl.defaultText) setText(next.defaultText);
    else setText(text.slice(0, next.maxChars));
  };

  const model = useMemo<Model | null>(() => (font && deferredText.trim() ? buildModel(template, deferredText, font, size) : null), [font, deferredText, template, size]);
  const hex = (id: ColorId) => COLORS.find((c) => c.id === id)!.hex;
  const parts = useMemo(() => (model ? model.parts.map((p) => ({ positions: p.positions, color: hex(p.role === 'base' ? base : twoColors ? detail : base) })) : []), [model, base, detail, twoColors]);

  // Preço estimado com os custos do país (o servidor recalcula quando houver carrinho).
  const est = useMemo(() => {
    if (!model) return null;
    const e = estimate(measureStl(mergeParts(model.parts)), { material: 'pla', scale: 100, infill: 25, layer: 0.2, supports: 0, quantity: qty, ...country.print3d, margin: 120, speed: 60 });
    const unit = Math.max(e.unit * (twoColors ? 1 + TWO_COLOR_PCT / 100 : 1), country.print3d.finishing * 2.5);
    return { ...e, unit, total: unit * qty };
  }, [model, qty, twoColors, country.print3d]);

  const money = useCallback((v: number) => formatMoney(v, country.currency, locale), [country.currency, locale]);
  const mm = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v);
  const dims = model ? `${mm(model.size[0])} x ${mm(model.size[1])} x ${mm(model.size[2])} mm` : '';
  const hours = (h: number) => { const m = Math.max(1, Math.round(h * 60)); return t('hours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') }); };

  const wa = visual?.plugins?.whatsapp;
  const whatsapp = wa?.enabled === false ? '' : (wa?.phone ?? '').replace(/\D/g, '');
  const vars = est ? {
    template: t(`tpl_${template}`), text: text.trim(), font: t(`font_${fontId}`), base: t(`color_${base}`),
    detail: t(`color_${twoColors ? detail : base}`), size: t(`size_${size}`), dims, qty, country: countryName(country.code, locale), total: money(est.total),
  } : null;
  const waLink = (key: 'waMessage' | 'waQuote') => (vars ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(t(key, vars))}` : '');

  const flow = [
    { label: t('flow_product'), Icon: Shapes }, { label: t('flow_text'), Icon: Type }, { label: t('flow_style'), Icon: Palette },
    { label: t('flow_view'), Icon: Rotate3d }, { label: t('flow_order'), Icon: ShoppingBag },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{`${t('seoTitle')} | ${storeName}`}</title>
        <meta name="description" content={t('seoDescription')} />
      </Helmet>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">
          {/* Topo: proposta, fluxo e atalho para quem já tem o próprio ficheiro */}
          <section className="shell pb-8 pt-5 md:pb-10 md:pt-6">
            <nav aria-label="breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link to="/" className="rounded transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('home')}</Link>
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              <span className="text-foreground" aria-current="page">{t('eyebrow')}</span>
            </nav>
            <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-12">
              <div className="max-w-3xl">
                <motion.p {...appear(0)} className="text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text">{t('eyebrow')}</motion.p>
                <motion.h1 {...appear(0.04)} className="mt-4 text-[40px] font-[780] leading-[1.03] tracking-[-0.04em] text-foreground [text-wrap:balance] sm:text-[52px] lg:text-[60px]">
                  {t('titleA')} <span className="text-primary sm:block">{t('titleB')}</span>
                </motion.h1>
                <motion.p {...appear(0.08)} className="mt-5 max-w-2xl text-base leading-relaxed text-brand-ink-soft md:text-[18px]">{t('lead')}</motion.p>
                <motion.div {...appear(0.12)} className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a href="#configurador" className={btnPrimary}>{t('startCta')}<ArrowDown className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" /></a>
                  <FeatureLink to="/orcamento-3d" className={btnSecondary}>
                    <Upload className="h-[18px] w-[18px] text-primary" strokeWidth={2} aria-hidden="true" />{t('uploadCta')}
                    <span className="text-[13px] font-medium text-muted-foreground">{t('uploadFormats')}</span>
                  </FeatureLink>
                </motion.div>
              </div>
              <motion.div {...appear(0.14)} className="rounded-[20px] border border-brand-card-border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text">{t('flowTitle')}</h2>
                <ol className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 lg:grid-cols-1">
                  {flow.map(({ label, Icon }, i) => (
                    <li key={i} className="flex min-h-[44px] items-center gap-2.5 py-1 sm:gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-brand-orange-soft text-primary sm:h-9 sm:w-9" aria-hidden="true"><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
                      <span className="text-[13px] font-semibold leading-snug sm:text-[15px]">{label}</span>
                    </li>
                  ))}
                </ol>
              </motion.div>
            </div>
          </section>

          <section id="configurador" className="shell grid gap-6 pb-12 md:pb-16 lg:scroll-mt-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
            {/* Peça em 3D: palco claro, gira 360° */}
            <motion.div
              initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE, delay: 0.08 }}
              className="min-w-0 lg:sticky lg:top-[9.5rem] lg:self-start"
            >
              <div className="relative aspect-square overflow-hidden rounded-[24px] border border-brand-card-border bg-brand-alt sm:aspect-[5/4]">
                <div className="pointer-events-none absolute inset-x-[14%] bottom-[12%] h-12 rounded-[50%] bg-[radial-gradient(closest-side,hsl(28_40%_20%/0.18),transparent)] blur-md" aria-hidden="true" />
                <Suspense fallback={<div className="grid h-full place-items-center"><span className="skeleton h-28 w-28 rounded-[24px]" aria-hidden="true" /></div>}>
                  <PartsViewer parts={parts} label={t('viewerLabel')} className="relative h-full w-full cursor-grab active:cursor-grabbing" />
                </Suspense>
                <span className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-[12px] border border-brand-card-border bg-white/90 px-3 py-2 text-[13px] font-semibold shadow-[var(--shadow-card)] backdrop-blur">
                  <Rotate3d className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{t('rotate')}
                </span>
                <AnimatePresence>
                  {model && (
                    <motion.span
                      key={dims} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                      className="pointer-events-none absolute right-4 top-4 flex items-center gap-1.5 rounded-[12px] border border-brand-card-border bg-white/90 px-3 py-2 text-[13px] font-semibold tabular-nums shadow-[var(--shadow-card)] backdrop-blur"
                    >
                      <Ruler className="h-3.5 w-3.5 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{dims}
                    </motion.span>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {(!font || !text.trim()) && (
                    <motion.div key="state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 grid place-items-center">
                      <p className="flex items-center gap-2 rounded-[14px] border border-brand-card-border bg-white px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-card)]" role="status">
                        {!font && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />}{!font ? t('loading') : t('textEmpty')}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            <div className="min-w-0 space-y-5">
              <Step n={1} title={t('step_model')}>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {TEMPLATES.map((x) => {
                    const Icon = TEMPLATE_ICON[x.id];
                    const active = template === x.id;
                    return (
                      <Tile key={x.id} active={active} onClick={() => chooseTemplate(x.id)} className="flex items-center gap-3">
                        <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-[12px] transition-colors duration-150', active ? 'bg-primary text-primary-foreground' : 'bg-brand-alt text-foreground')}><Icon className="h-6 w-6" strokeWidth={1.7} aria-hidden="true" /></span>
                        <span><span className="block text-[15px] font-semibold">{t(`tpl_${x.id}`)}</span><span className="block text-[13px] text-muted-foreground">{t(`tpl_${x.id}_sub`)}</span></span>
                      </Tile>
                    );
                  })}
                </div>
              </Step>

              <Step n={2} title={t('step_text')} delay={0.03}>
                <label htmlFor="custom-text" className="flex items-baseline justify-between text-[15px] font-semibold">
                  {t('textLabel')}<span className="text-[13px] font-normal tabular-nums text-muted-foreground">{t('textCount', { count: text.length, max: tpl.maxChars })}</span>
                </label>
                <input
                  id="custom-text" value={text} maxLength={tpl.maxChars} placeholder={t('textPlaceholder')} onChange={(e) => setText(e.target.value)} autoComplete="off"
                  className={cn('mt-2 h-14 w-full rounded-[14px] border border-border bg-white px-4 text-xl font-bold outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-medium placeholder:text-muted-foreground focus:border-primary focus:shadow-[var(--shadow-ring-royal)]', fontId === 'serif' && 'font-serif')}
                />
                <p className="mt-5 text-[15px] font-semibold">{t('fontLabel')}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['sans', 'serif'] as FontId[]).map((f) => (
                    <Tile key={f} active={fontId === f} onClick={() => setFontId(f)} className="flex items-center justify-between">
                      <span className="text-[15px] font-semibold">{t(`font_${f}`)}</span>
                      <span className={cn('text-2xl font-bold leading-none', f === 'serif' && 'font-serif')} aria-hidden="true">Aa</span>
                    </Tile>
                  ))}
                </div>
              </Step>

              <Step n={3} title={t('step_colors')} delay={0.06}>
                <div className="space-y-5">
                  <div>
                    <p className="mb-2.5 flex justify-between text-[15px] font-semibold">{t('baseColor')}<span className="font-medium text-muted-foreground">{t(`color_${base}`)}</span></p>
                    <Swatches value={base} onChange={setBase} label={t('baseColor')} names={(id) => t(`color_${id}`)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Tile active={!twoColors} onClick={() => setTwoColors(false)}><span className="text-[15px] font-semibold">{t('sameColor')}</span></Tile>
                    <Tile active={twoColors} onClick={() => setTwoColors(true)}><span className="text-[15px] font-semibold">{t('twoColors', { pct: TWO_COLOR_PCT })}</span></Tile>
                  </div>
                  <AnimatePresence initial={false}>
                    {twoColors && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: EASE }} className="overflow-hidden">
                        <p className="mb-2.5 flex justify-between text-[15px] font-semibold">{t('detailColor')}<span className="font-medium text-muted-foreground">{t(`color_${detail}`)}</span></p>
                        <Swatches value={detail} onChange={setDetail} label={t('detailColor')} names={(id) => t(`color_${id}`)} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Step>

              <Step n={4} title={t('step_size')} delay={0.09}>
                <div className="grid grid-cols-3 gap-2">
                  {SIZES.map((x) => (
                    <Tile key={x} active={size === x} onClick={() => setSize(x)} className="text-center">
                      <span className="block text-lg font-bold">{t(`size_${x}`).charAt(0)}</span>
                      <span className="block text-[13px] text-muted-foreground">{t(`size_${x}`)}</span>
                    </Tile>
                  ))}
                </div>
                <p className="mt-5 text-[15px] font-semibold">{t('quantity')}</p>
                <div className="mt-2 inline-flex items-center rounded-[14px] border border-border bg-white p-1">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t('decrease')} className={cn('grid h-11 w-11 place-items-center rounded-[10px] transition-colors duration-150 hover:bg-accent disabled:opacity-40', focusRing)}><Minus className="h-4 w-4" strokeWidth={2} aria-hidden="true" /></button>
                  <span className="w-12 text-center text-base font-bold tabular-nums" aria-live="polite">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(500, q + 1))} disabled={qty >= 500} aria-label={t('increase')} className={cn('grid h-11 w-11 place-items-center rounded-[10px] transition-colors duration-150 hover:bg-accent disabled:opacity-40', focusRing)}><Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" /></button>
                </div>
              </Step>

              {/* Resumo: cartão branco destacado, total grande e CTA laranja (comprar ou pedir orçamento) */}
              <motion.section {...appear(0.18)} className="rounded-[20px] border border-primary/25 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="summary-title">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary text-sm font-bold text-primary-foreground" aria-hidden="true">5</span>
                  <h2 id="summary-title" className={cardTitle}>{t('summary')}</h2>
                </div>
                {est && model ? (
                  <>
                    <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-[14px] border border-border bg-border">
                      {([['weight', `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(est.grams)} g`], ['time', hours(est.hours)], ['unitPrice', money(est.unit)]] as const).map(([k, v]) => (
                        <div key={k} className="min-w-0 bg-white px-3 py-3">
                          <dt className="text-[12px] leading-tight text-muted-foreground sm:text-[13px]">{t(k)}</dt>
                          <dd className="mt-1 text-sm font-semibold leading-snug tabular-nums sm:text-[15px]">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-4 flex items-end justify-between gap-4 rounded-[16px] bg-brand-orange-soft px-4 py-4 sm:px-5">
                      <div><p className="text-[15px] font-semibold text-foreground">{t('total')}</p><p className="text-[13px] text-brand-ink-soft">{t('units', { count: qty })}</p></div>
                      <AnimatedValue value={est.total} format={money} className="text-[34px] font-[780] leading-none tracking-[-0.03em] tabular-nums text-foreground sm:text-[44px]" />
                    </div>
                    {whatsapp ? (
                      <div className="mt-4 grid gap-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                        <a href={waLink('waMessage')} target="_blank" rel="noopener noreferrer" className={cn(btnPrimary, 'min-h-[52px] w-full')}>
                          <ShoppingBag className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />{t('cta')}
                        </a>
                        <a href={waLink('waQuote')} target="_blank" rel="noopener noreferrer" className={cn(btnSecondary, 'min-h-[52px] w-full')}>
                          <FileText className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden="true" />{t('ctaQuote')}
                        </a>
                      </div>
                    ) : (
                      <Link to="/contatos" className={cn(btnPrimary, 'mt-4 min-h-[52px] w-full')}>
                        <MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />{t('ctaContact')}
                      </Link>
                    )}
                    <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{t('disclaimer')}</p>
                  </>
                ) : text.trim() ? (
                  // Há texto, mas a fonte ainda está a carregar: o mesmo aviso do palco, não o de texto vazio.
                  <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />{t('loading')}</p>
                ) : <p className="mt-4 text-sm text-muted-foreground">{t('textEmpty')}</p>}
              </motion.section>

              {/* Atalho para o orçamento com o ficheiro do cliente */}
              <FeatureLink
                to="/orcamento-3d"
                className={cn('group flex items-center gap-4 rounded-[20px] border border-brand-card-border bg-white p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-hover)]', focusRing)}
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand-orange-soft text-primary"><Upload className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold">{t('ownModel')}</span>
                  <span className="block text-[14px] text-muted-foreground">{t('ownModelSub')}</span>
                </span>
                <span className="hidden items-center gap-1 text-sm font-semibold text-brand-orange-text sm:flex">{t('ownModelCta')}<ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} aria-hidden="true" /></span>
                <ArrowRight className="h-5 w-5 shrink-0 text-brand-orange-text sm:hidden" strokeWidth={2} aria-hidden="true" />
              </FeatureLink>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
