import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStoreName } from '@/hooks/useBrand';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { AnimatedValue } from '@/components/AnimatedValue';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { AlertCircle, Box, Check, ChevronDown, ChevronRight, Loader2, Lock, MessageCircle, Minus, Palette, Plus, Ruler, Upload } from 'lucide-react';
import * as THREE from 'three';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useVisualSettings } from '@/hooks/useVisualSettings';
import { cn } from '@/lib/utils';
import { useMessages } from '@/i18n';
import { print3dMessages } from '@/i18n/print3d';
import { countryName, useCountries, useCountry, useCountryStore } from '@/lib/countries';
import { formatMoney } from '@/lib/money';
import {
  MATERIALS, MODEL_ACCEPT, READ_MODEL_MESSAGE, StlParseError, estimate, fitsBed, measureStl, modelErrorCode, modelFormat, readModel,
  type MaterialId, type ModelFormat, type ParsedModel, type PrintSettings, type ReadModelReply, type ReadModelRequest,
} from '@/lib/print3d';

const StlViewer = lazy(() => import('@/components/print3d/StlViewer').then((m) => ({ default: m.StlViewer })));

const MAX_MB = 100;
const EASE = [0.16, 1, 0.3, 1] as const;

// Botões do sistema visual PRINT3D (raio 14px, 48px de altura, laranja com hover mais escuro).
const btnPrimary = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60';
const btnSecondary = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-5 text-[15px] font-semibold text-foreground transition-colors duration-150 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const cardTitle = 'text-[20px] font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[22px]';

const COLORS = [
  { id: 'white', hex: '#e8e8e4' }, { id: 'black', hex: '#2b2d2f' }, { id: 'red', hex: '#d94a2b' }, { id: 'yellow', hex: '#e8a31c' },
  { id: 'blue', hex: '#2f7bd1' }, { id: 'green', hex: '#3a9d5d' }, { id: 'purple', hex: '#8a5cc9' }, { id: 'gray', hex: '#9aa0a6' },
] as const;
type ColorId = (typeof COLORS)[number]['id'];

const QUALITIES = [
  { id: 'fine', layer: 0.12 }, { id: 'normal', layer: 0.2 }, { id: 'draft', layer: 0.28 },
] as const;
const SUPPORTS = [
  { id: 'none', value: 0, extra: 0 }, { id: 'some', value: 0.15, extra: 15 }, { id: 'many', value: 0.35, extra: 35 },
] as const;

/** Peça de exemplo para ver a página a funcionar sem ficheiro (nó toroidal, em mm, Z para cima). */
function samplePositions(): Float32Array {
  const g = new THREE.TorusKnotGeometry(16, 5, 160, 24, 2, 3).toNonIndexed();
  g.rotateX(Math.PI / 2);
  const out = new Float32Array(g.attributes.position.array);
  g.dispose();
  return out;
}

const numberValue = (v: string, fallback = 0) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : fallback; };

/** Maior escala (em passos de 5%) com que a peça ainda cabe na área de impressão; 0 se nem a 10% couber. */
function maxFitScale(size: readonly number[], bed: readonly number[], scale: number): number {
  const a = [...size].sort((x, y) => x - y);
  const b = [...bed].sort((x, y) => x - y);
  const r = Math.min(...a.map((x, i) => (x > 0 ? b[i] / x : Infinity)));
  const max = Math.floor((scale * r) / 5) * 5;
  return max >= 10 ? Math.min(max, 400) : 0;
}

type ReadJob = { promise: Promise<ParsedModel>; cancel: () => void };

/**
 * Lê o ficheiro num Web Worker (o próprio módulo print3d.ts), para a página continuar a responder com ficheiros grandes.
 * Se o navegador não abrir o worker, lê na thread principal. `cancel` termina o worker e rejeita a promessa.
 */
function startRead(file: File): ReadJob {
  let worker: Worker | null = null;
  let fail: (e: unknown) => void = () => {};
  const onMainThread = async () => {
    await new Promise((r) => setTimeout(r, 0)); // deixa o aviso de leitura aparecer antes da leitura (síncrona)
    return readModel(file.name, await file.arrayBuffer());
  };
  const promise = new Promise<ParsedModel>((resolve, reject) => {
    fail = reject;
    try {
      worker = new Worker(new URL('../lib/print3d.ts', import.meta.url), { type: 'module' });
    } catch {
      onMainThread().then(resolve, reject);
      return;
    }
    const w = worker;
    const fallback = () => { w.terminate(); onMainThread().then(resolve, reject); };
    w.onmessage = (e: MessageEvent<ReadModelReply>) => {
      w.terminate();
      const d = e.data;
      if ('model' in d) resolve(d.model);
      else reject(new StlParseError(d.code));
    };
    w.onerror = (e) => { e.preventDefault(); fallback(); };
    w.onmessageerror = fallback;
    const req: ReadModelRequest = { type: READ_MODEL_MESSAGE, file };
    w.postMessage(req);
  });
  return { promise, cancel: () => { worker?.terminate(); fail(new Error('cancelled')); } };
}

const appear = (delay = 0) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease: EASE, delay } });

function Section({ title, step, children, delay = 0 }: { title: string; step: number; children: ReactNode; delay?: number }) {
  return (
    <motion.section {...appear(0.1 + delay)} className="rounded-[20px] border border-brand-card-border bg-white p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby={`sec-${step}`}>
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent text-sm font-bold tabular-nums text-brand-orange-text" aria-hidden="true">{step}</span>
        <h2 id={`sec-${step}`} className={cardTitle}>{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

function FieldLabel({ children, value, htmlFor }: { children: ReactNode; value?: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Label htmlFor={htmlFor} className="text-[15px] font-semibold text-foreground">{children}</Label>
      {value !== undefined && <span className="text-sm font-semibold tabular-nums text-brand-orange-text">{value}</span>}
    </div>
  );
}

/** Opções em cartões (rádio acessível com setas do teclado, via Radix). */
function OptionCards<T extends string>({ value, onChange, options, label, cols = 'grid-cols-3' }: {
  value: T; onChange: (v: T) => void; label: string; cols?: string;
  options: { id: T; title: ReactNode; hint?: ReactNode }[];
}) {
  return (
    <RadioGroupPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)} aria-label={label} className={cn('grid gap-2', cols)}>
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.id} value={o.id}
          className={cn(
            'group relative min-h-[48px] min-w-0 rounded-[14px] border border-border bg-white px-3.5 py-3 text-left transition-[border-color,background-color,transform] duration-150',
            'hover:border-primary/50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'data-[state=checked]:border-primary data-[state=checked]:bg-accent',
          )}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 break-words text-[14px] font-semibold sm:text-[15px]">{o.title}</span>
            {/* No celular a borda laranja e o fundo já marcam a escolha: o círculo sai para o texto caber em 3 colunas. */}
            <span className="hidden h-5 w-5 shrink-0 place-items-center rounded-full border border-border bg-white transition-colors duration-150 group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary sm:grid" aria-hidden="true">
              <Check className="h-3.5 w-3.5 text-primary-foreground opacity-0 transition-opacity duration-150 group-data-[state=checked]:opacity-100" strokeWidth={2} />
            </span>
          </span>
          {o.hint && <span className="mt-1 block text-[12px] leading-snug text-muted-foreground sm:text-[13px]">{o.hint}</span>}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

function NumberField({ id, label, value, onChange, step = 1 }: { id: string; label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-[13px] text-muted-foreground">{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min={0} step={step} value={value} onChange={(e) => onChange(numberValue(e.target.value))} className="h-11 rounded-[14px] bg-white tabular-nums" />
    </div>
  );
}

export default function Orcamento3D() {
  const { t, locale } = useMessages(print3dMessages);
  const storeName = useStoreName();
  const { user } = useAuth();
  const { isAdmin } = useRole(user?.id);
  const { data: visual } = useVisualSettings();

  const sample = useMemo<ParsedModel>(() => {
    const positions = samplePositions();
    const stats = measureStl(positions);
    return { positions, stats, pieces: [stats.size] };
  }, []);
  const [model, setModel] = useState<ParsedModel>(sample);
  const { positions, stats } = model;
  const [fileName, setFileName] = useState<string | null>(null);
  const [format, setFormat] = useState<ModelFormat | null>(null);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [colorId, setColorId] = useState<ColorId>('blue');
  // País global do cliente (o mesmo do cabeçalho): moeda e custos de partida vêm dele.
  const market = useCountry();
  const { data: countries = [] } = useCountries();
  const setCountryCode = useCountryStore((st) => st.setCode);
  const [bed, setBed] = useState<[number, number, number]>([220, 220, 250]);
  const [s, setS] = useState<PrintSettings>(() => ({
    material: 'pla', scale: 100, infill: 20, layer: 0.2, supports: 0, quantity: 1,
    ...market.print3d, margin: 80, speed: 60,
  }));
  const input = useRef<HTMLInputElement>(null);
  const patch = (p: Partial<PrintSettings>) => setS((prev) => ({ ...prev, ...p }));

  // A última escolha manda: um ficheiro novo cancela a leitura em curso e o resultado antigo é descartado.
  const job = useRef<ReadJob | null>(null);
  const req = useRef(0);
  const cancelRead = useCallback(() => { req.current++; job.current?.cancel(); job.current = null; }, []);
  useEffect(() => cancelRead, [cancelRead]);

  // STL, OBJ ou 3MF: o formato vem da extensão; a leitura é feita no navegador, num Web Worker.
  const load = useCallback(async (file: File) => {
    cancelRead();
    const id = req.current;
    setError('');
    const fmt = modelFormat(file.name);
    if (!fmt) { setBusy(false); setError(t('errType')); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setBusy(false); setError(t('errTooLarge', { max: MAX_MB })); return; }
    setBusy(true);
    const current = startRead(file);
    job.current = current;
    try {
      const m = await current.promise;
      if (id !== req.current) return;
      setModel(m);
      setFileName(file.name);
      setFormat(fmt);
      setS((prev) => ({ ...prev, scale: 100 }));
    } catch (e) {
      if (id !== req.current) return;
      const code = modelErrorCode(e);
      setError(code === 'empty' ? t('errEmpty') : code === 'unsupported' ? t('errType') : code === 'tooLarge' ? t('errTooLargeModel') : t('errInvalid'));
    } finally {
      if (id === req.current) { job.current = null; setBusy(false); }
    }
  }, [t, cancelRead]);

  const resetSample = () => { cancelRead(); setBusy(false); setModel(sample); setFileName(null); setFormat(null); setError(''); patch({ scale: 100 }); };

  const est = useMemo(() => (stats ? estimate(stats, s) : null), [stats, s]);
  // Cada peça (item do 3MF, por exemplo cada placa de um projeto) é impressa à parte: todas têm de caber na mesa.
  const pieces = useMemo(() => { const k = Math.max(s.scale, 1) / 100; return model.pieces.map((p) => p.map((x) => x * k)); }, [model.pieces, s.scale]);
  const fits = pieces.every((p) => fitsBed(p, bed));
  const fitScale = fits ? 0 : Math.min(...pieces.map((p) => maxFitScale(p, bed, s.scale)));
  const bedXY = useMemo<[number, number]>(() => [bed[0], bed[1]], [bed]);
  const color = COLORS.find((c) => c.id === colorId)!;

  const money = useCallback((v: number) => formatMoney(v, market.currency, locale), [market.currency, locale]);
  const num = useCallback((v: number, digits = 1) => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v), [locale]);
  const hours = (h: number) => { const m = Math.round(h * 60); return t('hours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') }); };
  const quality = QUALITIES.find((q) => q.layer === s.layer) ?? QUALITIES[1];
  const displayName = fileName ?? t('sampleName');

  const wa = visual?.plugins?.whatsapp;
  const whatsapp = wa?.enabled === false ? '' : (wa?.phone ?? '').replace(/\D/g, '');
  const message = est ? t('waMessage', {
    file: displayName, material: s.material.toUpperCase(), color: t(`color_${colorId}`), scale: s.scale, infill: s.infill,
    quality: t(`q_${quality.id}`), qty: s.quantity, country: countryName(market.code, locale), total: money(est.total),
  }) : '';

  const setMarket = (code: string) => setCountryCode(code);
  useEffect(() => { patch({ ...market.print3d }); }, [market]);
  const setQty = (n: number) => patch({ quantity: Math.max(1, Math.min(500, Math.floor(n) || 1)) });

  const steps = [{ label: t('step1'), Icon: Upload }, { label: t('step2'), Icon: Palette }, { label: whatsapp ? t('step3') : t('step3Contact'), Icon: MessageCircle }];

  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{`${t('seoTitle')} | ${storeName}`}</title>
        <meta name="description" content={t('seoDescription')} />
        <meta property="og:title" content={t('seoTitle')} />
        <meta property="og:description" content={t('seoDescription')} />
      </Helmet>

      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">
          {/* Topo: o que é, como funciona e garantia de privacidade */}
          <section className="shell pb-8 pt-5 md:pb-10 md:pt-6">
            <nav aria-label="breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link to="/" className="rounded transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('home')}</Link>
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              <span className="text-foreground" aria-current="page">{t('seoTitle')}</span>
            </nav>

            <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-12">
              <div className="max-w-3xl">
                <motion.p {...appear(0)} className="text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text">{t('eyebrow')}</motion.p>
                <motion.h1 {...appear(0.04)} className="mt-4 text-[40px] font-[780] leading-[1.03] tracking-[-0.04em] text-foreground [text-wrap:balance] sm:text-[52px] lg:text-[60px]">
                  {t('titleA')} <span className="text-primary sm:block">{t('titleB')}</span>
                </motion.h1>
                <motion.p {...appear(0.08)} className="mt-5 max-w-2xl text-base leading-relaxed text-brand-ink-soft md:text-[18px]">{t('lead')}</motion.p>
              </div>
              <motion.div {...appear(0.12)} className="space-y-3">
                <ol className="grid grid-cols-3 gap-2 lg:grid-cols-1">
                  {steps.map(({ label, Icon }, i) => (
                    <li key={i} className="flex flex-col gap-2 rounded-[14px] border border-brand-card-border bg-white p-3 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:gap-3 sm:px-3.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-brand-orange-soft text-primary sm:h-10 sm:w-10" aria-hidden="true"><Icon className="h-5 w-5" strokeWidth={1.8} /></span>
                      <span className="min-w-0">
                        <span className="block text-[12px] font-semibold tabular-nums text-brand-orange-text" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                        <span className="block text-[13px] font-semibold leading-snug sm:text-[15px]">{label}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{t('privacy')}
                </p>
              </motion.div>
            </div>
          </section>

          <section className="shell grid gap-6 pb-12 md:pb-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
            {/* Visualizador: palco claro, arraste e largue o ficheiro */}
            <motion.div
              initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE, delay: 0.08 }}
              className="min-w-0 space-y-4 lg:sticky lg:top-[9.5rem] lg:self-start"
            >
              <div
                className={cn(
                  'relative aspect-square overflow-hidden rounded-[24px] border border-brand-card-border bg-brand-alt transition-[border-color,box-shadow] duration-200 sm:aspect-[4/3]',
                  over && 'border-primary ring-4 ring-primary/15',
                )}
                aria-busy={busy}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void load(f); }}
              >
                <Suspense fallback={(
                  <div className="grid h-full place-items-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="skeleton h-28 w-28 rounded-[24px]" aria-hidden="true" />
                      <span className="text-sm text-muted-foreground">{t('viewerLoading')}</span>
                    </div>
                  </div>
                )}>
                  <StlViewer positions={positions} color={color.hex} scale={s.scale} bed={bedXY} label={t('viewerLabel')} className="relative h-full w-full cursor-grab active:cursor-grabbing" />
                </Suspense>

                {est && (
                  <div className="pointer-events-none absolute left-3 top-3 rounded-[14px] border border-brand-card-border bg-white/90 px-3 py-2 shadow-[var(--shadow-card)] backdrop-blur">
                    <p className="text-[12px] font-medium text-muted-foreground">{t('total')}</p>
                    <AnimatedValue value={est.total} format={money} className="block text-lg font-bold tabular-nums tracking-[-0.02em] text-foreground" />
                  </div>
                )}
                <span
                  className={cn(
                    'pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-[13px] font-semibold backdrop-blur transition-colors duration-200',
                    fits ? 'border-emerald-600/20 bg-emerald-50/95 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300' : 'border-destructive/25 bg-white/95 text-destructive',
                  )}
                  role="status"
                >
                  {fits ? <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" /> : <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />}
                  {fits ? t('fits') : t('tooBig')}
                </span>
                <span className="pointer-events-none absolute inset-x-3 bottom-3 text-center text-[12px] text-muted-foreground">{t('viewerHint')}</span>
                {/* Região viva sempre presente: o aviso de leitura é anunciado pelos leitores de ecrã quando começa. */}
                <span className="sr-only" role="status">{busy ? t('reading') : ''}</span>

                <AnimatePresence>
                  {over && (
                    <motion.div
                      key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                      className="absolute inset-3 grid place-items-center rounded-[18px] border-2 border-dashed border-primary bg-white/90 backdrop-blur-sm"
                    >
                      <div className="flex flex-col items-center gap-3 px-6 text-center">
                        <span className="grid h-14 w-14 place-items-center rounded-[16px] bg-accent text-primary"><Upload className="h-7 w-7" strokeWidth={1.8} aria-hidden="true" /></span>
                        <p className="text-[22px] font-bold tracking-[-0.02em]">{t('drop')}</p>
                        <p className="text-[13px] text-muted-foreground">{t('formats', { max: MAX_MB })}</p>
                      </div>
                    </motion.div>
                  )}
                  {busy && (
                    <motion.div
                      key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                      className="absolute inset-0 grid place-items-center bg-brand-alt/75 backdrop-blur-sm"
                    >
                      <p className="flex items-center gap-2 rounded-[14px] border border-brand-card-border bg-white px-4 py-2.5 text-sm font-semibold shadow-[var(--shadow-card)]" aria-hidden="true">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />{t('reading')}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  ref={input} type="file" accept={MODEL_ACCEPT} className="sr-only" id="model-file" tabIndex={-1} aria-hidden="true"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void load(f); }}
                />
                <button type="button" className={btnPrimary} onClick={() => input.current?.click()} disabled={busy} aria-describedby="model-formats">
                  {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <Upload className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />}
                  {fileName ? t('replace') : t('upload')}
                </button>
                {fileName && (
                  <button type="button" className={btnSecondary} onClick={resetSample}><Box className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t('sample')}</button>
                )}
                <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground sm:ml-1" aria-live="polite">
                  {format && <span className="shrink-0 rounded-[6px] bg-accent px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-brand-orange-text">{format.toUpperCase()}</span>}
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-foreground">{displayName}</span>
                    {positions && <> · {t('fileInfo', { count: (positions.length / 9).toLocaleString(locale) })}</>}
                  </span>
                </p>
              </div>
              <p id="model-formats" className="text-[13px] text-muted-foreground">{t('formats', { max: MAX_MB })}</p>
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                    className="flex items-start gap-2 rounded-[14px] border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm text-destructive" role="alert"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />{error}
                  </motion.p>
                )}
              </AnimatePresence>

              {est && (
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-brand-card-border bg-brand-card-border sm:grid-cols-4">
                  {([['width', `${num(est.size[0])} mm`], ['depth', `${num(est.size[1])} mm`], ['height', `${num(est.size[2])} mm`], ['volume', `${num(est.volumeCm3)} cm³`]] as const).map(([k, v]) => (
                    <div key={k} className="min-w-0 bg-white px-4 py-3">
                      <dt className="flex items-center gap-1.5 text-[13px] text-muted-foreground">{k !== 'volume' && <Ruler className="h-3.5 w-3.5 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />}{t(k)}</dt>
                      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </motion.div>

            {/* Configuração e orçamento */}
            <div className="min-w-0 space-y-5">
              <Section step={1} title={t('sectionMaterial')}>
                <div className="space-y-6">
                  <div className="space-y-2.5">
                    <FieldLabel>{t('materialLabel')}</FieldLabel>
                    <OptionCards<MaterialId>
                      label={t('materialLabel')} value={s.material} onChange={(v) => patch({ material: v })} cols="grid-cols-1 sm:grid-cols-2"
                      options={MATERIALS.map((m) => ({ id: m.id, title: m.id.toUpperCase(), hint: t(`mat_${m.id}`) }))}
                    />
                  </div>
                  <div className="space-y-2.5">
                    <FieldLabel value={<span className="font-medium text-foreground">{t(`color_${colorId}`)}</span>}>{t('colorLabel')}</FieldLabel>
                    <RadioGroupPrimitive.Root value={colorId} onValueChange={(v) => setColorId(v as ColorId)} aria-label={t('colorLabel')} className="flex flex-wrap gap-2.5">
                      {COLORS.map((c) => (
                        <RadioGroupPrimitive.Item
                          key={c.id} value={c.id} aria-label={t(`color_${c.id}`)} title={t(`color_${c.id}`)}
                          className="grid h-11 w-11 place-items-center rounded-full border border-black/10 shadow-inner transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:ring-2 data-[state=checked]:ring-primary data-[state=checked]:ring-offset-2 data-[state=checked]:ring-offset-white"
                          style={{ background: c.hex }}
                        >
                          <RadioGroupPrimitive.Indicator>
                            <Check className={cn('h-[18px] w-[18px]', ['white', 'yellow', 'gray'].includes(c.id) ? 'text-black/70' : 'text-white')} strokeWidth={2} aria-hidden="true" />
                          </RadioGroupPrimitive.Indicator>
                        </RadioGroupPrimitive.Item>
                      ))}
                    </RadioGroupPrimitive.Root>
                  </div>
                </div>
              </Section>

              <Section step={2} title={t('sectionSize')} delay={0.04}>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <FieldLabel value={`${s.scale}%`}>{t('scale')}</FieldLabel>
                    <Slider min={10} max={400} step={5} value={[s.scale]} onValueChange={([v]) => patch({ scale: v })} aria-label={t('scale')} className="py-3" />
                    <AnimatePresence initial={false}>
                      {!fits && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: EASE }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
                            <span>{fitScale ? t('tooBigHelp', { max: fitScale }) : t('tooBigNone')}</span>
                            {fitScale > 0 && (
                              <button type="button" className="inline-flex min-h-[44px] items-center rounded-[12px] border border-destructive/30 bg-white px-3.5 text-sm font-semibold transition-colors duration-150 hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => patch({ scale: fitScale })}>
                                {t('applyScale', { max: fitScale })}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel value={`${s.infill}%`}>{t('infill')}</FieldLabel>
                    <Slider min={5} max={100} step={5} value={[s.infill]} onValueChange={([v]) => patch({ infill: v })} aria-label={t('infill')} className="py-3" />
                    <p className="text-[13px] text-muted-foreground">{t('infillHelp')}</p>
                  </div>
                  <div className="space-y-2.5">
                    <FieldLabel>{t('quality')}</FieldLabel>
                    <OptionCards
                      label={t('quality')} value={quality.id} onChange={(id) => patch({ layer: QUALITIES.find((q) => q.id === id)!.layer })}
                      options={QUALITIES.map((q) => ({ id: q.id, title: t(`q_${q.id}`), hint: t('layerMm', { mm: num(q.layer, 2) }) }))}
                    />
                  </div>
                  <div className="space-y-2.5">
                    <FieldLabel>{t('supports')}</FieldLabel>
                    <OptionCards
                      label={t('supports')} value={(SUPPORTS.find((o) => o.value === s.supports) ?? SUPPORTS[0]).id}
                      onChange={(id) => patch({ supports: SUPPORTS.find((o) => o.id === id)!.value })}
                      options={SUPPORTS.map((o) => ({ id: o.id, title: t(`sup_${o.id}`), hint: o.extra ? `+${o.extra}%` : undefined }))}
                    />
                    <p className="text-[13px] text-muted-foreground">{t('supportsHelp')}</p>
                  </div>
                  <div className="space-y-2.5">
                    <FieldLabel htmlFor="qty">{t('quantity')}</FieldLabel>
                    <div className="inline-flex items-center rounded-[14px] border border-border bg-white p-1">
                      <button type="button" className="grid h-11 w-11 place-items-center rounded-[10px] transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40" onClick={() => setQty(s.quantity - 1)} disabled={s.quantity <= 1} aria-label={t('decrease')}><Minus className="h-4 w-4" strokeWidth={2} aria-hidden="true" /></button>
                      <Input id="qty" type="number" inputMode="numeric" min={1} max={500} value={s.quantity} onChange={(e) => setQty(numberValue(e.target.value, 1))} className="h-11 w-16 border-0 bg-transparent text-center text-base font-semibold tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                      <button type="button" className="grid h-11 w-11 place-items-center rounded-[10px] transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40" onClick={() => setQty(s.quantity + 1)} disabled={s.quantity >= 500} aria-label={t('increase')}><Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" /></button>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Orçamento: cartão branco destacado, total grande e CTA laranja */}
              <motion.section {...appear(0.18)} className="rounded-[20px] border border-primary/25 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="quote-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary text-sm font-bold tabular-nums text-primary-foreground" aria-hidden="true">3</span>
                    <h2 id="quote-title" className={cardTitle}>{t('sectionQuote')}</h2>
                  </div>
                  <Select value={market.code} onValueChange={setMarket}>
                    <SelectTrigger className="h-11 w-auto gap-2 rounded-[12px] border-border bg-white px-3 text-sm" aria-label={t('country')}>
                      <span className="text-muted-foreground">{t('country')}</span><SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {countries.map((m) => <SelectItem key={m.code} value={m.code}>{countryName(m.code, locale)} ({m.currency})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {est ? (
                  <>
                    <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-[14px] border border-border bg-border">
                      {([['weight', `${num(est.grams)} g`], ['time', hours(est.hours)], ['unitPrice', money(est.unit)]] as const).map(([k, v]) => (
                        <div key={k} className="min-w-0 bg-white px-3 py-3">
                          <dt className="text-[12px] leading-tight text-muted-foreground sm:text-[13px]">{t(k)}</dt>
                          <dd className="mt-1 text-sm font-semibold leading-snug tabular-nums sm:text-[15px]">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-4 flex items-end justify-between gap-4 rounded-[16px] bg-brand-orange-soft px-4 py-4 sm:px-5">
                      <div>
                        <p className="text-[15px] font-semibold text-foreground">{t('total')}</p>
                        <p className="text-[13px] text-brand-ink-soft">{t('units', { count: s.quantity })}</p>
                      </div>
                      <AnimatedValue value={est.total} format={money} className="text-[34px] font-[780] leading-none tracking-[-0.03em] tabular-nums text-foreground sm:text-[44px]" />
                    </div>
                    {whatsapp ? (
                      <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={cn(btnPrimary, 'mt-4 min-h-[52px] w-full')}>
                        <MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />{t('cta')}
                      </a>
                    ) : (
                      <Link to="/contatos" className={cn(btnPrimary, 'mt-4 min-h-[52px] w-full')}>
                        <MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />{t('ctaContact')}
                      </Link>
                    )}
                    <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{t('disclaimer', { solid: Math.round(est.solid * 100) })}</p>
                  </>
                ) : <p className="mt-4 text-sm text-muted-foreground">{t('emptyQuote')}</p>}
              </motion.section>

              {isAdmin && est && (
                <details className="group rounded-[20px] border border-dashed border-border bg-white p-5">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <span className="text-[18px] font-bold tracking-[-0.01em]">{t('adminTitle')}</span>
                    <span className="flex items-center gap-2">
                      <span className="rounded-[8px] bg-accent px-2 py-0.5 text-xs font-semibold text-brand-orange-text">{t('adminBadge')}</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" strokeWidth={2} aria-hidden="true" />
                    </span>
                  </summary>
                  <div className="mt-5 space-y-5">
                    <dl className="space-y-1.5 text-sm tabular-nums">
                      {([['costMaterial', est.material], ['costMachine', est.machine], ['costFinishing', est.finishing], ['costMarkup', est.markup]] as const).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{t(k)}</dt><dd>{money(v)}</dd></div>
                      ))}
                    </dl>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <NumberField id="kg" label={t('filamentPerKg', { cur: market.currency })} value={s.filamentPerKg} onChange={(n) => patch({ filamentPerKg: n })} />
                      <NumberField id="hr" label={t('machinePerHour', { cur: market.currency })} value={s.machinePerHour} step={0.1} onChange={(n) => patch({ machinePerHour: n })} />
                      <NumberField id="fin" label={t('finishingCost', { cur: market.currency })} value={s.finishing} step={0.5} onChange={(n) => patch({ finishing: n })} />
                      <NumberField id="mar" label={t('margin')} value={s.margin} step={5} onChange={(n) => patch({ margin: n })} />
                      <NumberField id="spd" label={t('speed')} value={s.speed} step={5} onChange={(n) => patch({ speed: Math.max(10, n) })} />
                      <NumberField id="fee" label={t('fee')} value={s.fee} step={0.5} onChange={(n) => patch({ fee: n })} />
                      <NumberField id="bx" label={t('bedX')} value={bed[0]} onChange={(n) => setBed([n, bed[1], bed[2]])} />
                      <NumberField id="by" label={t('bedY')} value={bed[1]} onChange={(n) => setBed([bed[0], n, bed[2]])} />
                      <NumberField id="bz" label={t('bedZ')} value={bed[2]} onChange={(n) => setBed([bed[0], bed[1], n])} />
                    </div>
                    <p className="text-[13px] text-muted-foreground">{t('adminHelp')}</p>
                  </div>
                </details>
              )}
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
