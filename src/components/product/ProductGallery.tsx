// Galeria da página do produto: foto grande com zoom ao passar o mouse, miniaturas laterais (desktop) ou por baixo
// (celular), troca suave, deslizar no celular e tela cheia com setas, teclado e zoom. Sem foto, mostra LayerArt.
// Itens de mídia opcionais por produto: modelo 3D (STL, OBJ ou 3MF, girável) e vídeos (MP4/WebM). A tela cheia mostra só as fotos.
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Box, ChevronLeft, ChevronRight, Expand, Loader2, Play, Rotate3d, X, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react';
import { parseModel } from '@/lib/print3d';
import { LayerArt } from '@/components/MediaImage';
import type { GalleryImage } from '@/hooks/useProductPage';
import { useMessages } from '@/i18n';
import { productMessages } from '@/i18n/product';
import { cn } from '@/lib/utils';

function useCanHover() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const m = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setCan(m.matches);
    sync();
    m.addEventListener?.('change', sync);
    return () => m.removeEventListener?.('change', sync);
  }, []);
  return can;
}

/** Deslizar na horizontal: chama onSwipe(1) para a próxima e onSwipe(-1) para a anterior; devolve se houve gesto. */
function useSwipe(onSwipe: (dir: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  return {
    swiped,
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        const p = e.touches[0];
        start.current = { x: p.clientX, y: p.clientY };
        swiped.current = false;
      },
      onTouchEnd: (e: React.TouchEvent) => {
        const s = start.current;
        const p = e.changedTouches[0];
        start.current = null;
        if (!s || !p) return;
        const dx = p.clientX - s.x;
        const dy = p.clientY - s.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          swiped.current = true;
          onSwipe(dx < 0 ? 1 : -1);
        }
      },
    },
  };
}

const StlViewer = lazy(() => import('@/components/print3d/StlViewer').then((m) => ({ default: m.StlViewer })));
const isPhoto = (g: GalleryImage) => !g.kind || g.kind === 'image';

/** Cor principal do tema (Admin > Marca e visual) para pintar o modelo. */
function primaryColor() {
  const v = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().split(/\s+/) : [];
  return v.length >= 3 ? `hsl(${v[0]}, ${v[1]}, ${v[2]})` : '#FF5A0A';
}

/** Modelo 3D do produto: baixa o ficheiro, lê no navegador e mostra no visualizador (arrastar gira). */
function ModelView({ url, name }: { url: string; name: string }) {
  const { t } = useMessages(productMessages);
  const [model, setModel] = useState<{ positions: Float32Array; size: number } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setModel(null);
    setError(false);
    // ponytail: leitura na thread principal; modelos de vários MB podem travar um instante (usar o Worker do Orçamento 3D se acontecer).
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then((buf) => {
        const positions = parseModel(url.split('?')[0], buf);
        // Maior medida da peça (X, Y ou Z), para a câmara enquadrar como na página inicial.
        const lo = [Infinity, Infinity, Infinity];
        const hi = [-Infinity, -Infinity, -Infinity];
        for (let k = 0; k < positions.length; k++) { const ax = k % 3; lo[ax] = Math.min(lo[ax], positions[k]); hi[ax] = Math.max(hi[ax], positions[k]); }
        if (alive) setModel({ positions, size: Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) });
      })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [url]);
  return (
    <div className="absolute inset-0 bg-brand-alt">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.9),transparent_55%)]" aria-hidden="true" />
      {error ? (
        <p className="absolute inset-0 flex items-center justify-center gap-2 p-6 text-center text-sm font-medium text-brand-ink-soft" role="alert">
          <AlertCircle className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />{t('model3dError')}
        </p>
      ) : !model ? (
        <span className="absolute inset-0 grid place-items-center" role="status" aria-label={t('model3dHint')}>
          <Loader2 className="h-7 w-7 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        </span>
      ) : (
        <Suspense fallback={null}>
          <StlViewer
            positions={model.positions} color={primaryColor()} scale={100} bed={[0, 0]} frame={model.size * 1.6} variant="showcase" flat finish="matte"
            label={t('model3dLabel', { name })} className="relative h-full w-full cursor-grab active:cursor-grabbing"
          />
        </Suspense>
      )}
      <span className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold shadow-[var(--shadow-soft)] backdrop-blur">
        <Rotate3d className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{t('model3dHint')}
      </span>
    </div>
  );
}

const roundBtn =
  'grid h-11 w-11 place-items-center rounded-full bg-white/95 text-foreground shadow-[var(--shadow-soft)] backdrop-blur transition-[opacity,transform,background-color] duration-150 hover:bg-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ProductGallery({ images, name, resetKey, FallbackIcon = Box, badges }: {
  images: GalleryImage[];
  name: string;
  /** muda quando a cor muda: a galeria volta à primeira foto */
  resetKey?: string;
  FallbackIcon?: LucideIcon;
  badges?: ReactNode;
}) {
  const { t } = useMessages(productMessages);
  const total = images.length;
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const canHover = useCanHover();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const thumbsRef = useRef<HTMLDivElement | null>(null);
  const userMoved = useRef(false);

  useEffect(() => { setIndex(0); userMoved.current = false; }, [resetKey]);
  const i = total ? Math.min(index, total - 1) : 0;
  const current = images[i];

  const go = useCallback((d: number) => {
    if (total < 2) return;
    userMoved.current = true;
    setIndex((v) => (Math.min(v, total - 1) + d + total) % total);
  }, [total]);
  const pick = (n: number) => { userMoved.current = true; setIndex(n); };
  // Tela cheia: só as fotos (o modelo 3D e os vídeos ficam na galeria).
  const photos = images.filter(isPhoto);
  const goPhoto = (d: number) => {
    if (photos.length < 2) return;
    const at = Math.max(0, photos.indexOf(current));
    pick(images.indexOf(photos[(at + d + photos.length) % photos.length]));
  };

  // Mantém a miniatura ativa visível dentro da faixa (sem mexer na rolagem da página).
  useEffect(() => {
    const box = thumbsRef.current;
    if (!box || !userMoved.current) return;
    const el = box.querySelector<HTMLElement>(`[data-thumb="${i}"]`);
    if (!el) return;
    box.scrollTo({
      left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2,
      top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2,
      behavior: 'smooth',
    });
  }, [i]);

  const { swiped, handlers } = useSwipe((d) => go(d));

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!canHover || !imgRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    imgRef.current.style.transformOrigin = `${x}% ${y}%`;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  };

  if (!total) {
    return (
      <div className="relative aspect-square overflow-hidden rounded-[24px] border border-brand-card-border bg-brand-alt">
        <LayerArt Icon={FallbackIcon} size="lg" />
        {badges && <div className="absolute left-4 top-4 flex flex-col gap-1.5">{badges}</div>}
      </div>
    );
  }

  return (
    <>
      <section aria-label={t('gallery')} onKeyDown={onKeyDown} className={cn('flex flex-col gap-3 lg:grid lg:gap-4', total > 1 && 'lg:grid-cols-[84px_minmax(0,1fr)]')}>
        {/* Foto principal */}
        <div className="group relative order-1 aspect-square overflow-hidden rounded-[24px] border border-brand-card-border bg-white lg:order-2">
          {current.kind === 'model' ? <ModelView url={current.url} name={name} /> : current.kind === 'video' ? (
            <video key={current.url} src={current.url} controls playsInline preload="metadata" aria-label={t('videoLabel', { name })} className="absolute inset-0 h-full w-full bg-brand-ink object-contain" />
          ) : (
          <button
            type="button"
            className={cn('absolute inset-0 block h-full w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', canHover ? 'cursor-zoom-in' : 'cursor-pointer')}
            aria-label={`${t('zoomImage')}: ${current.alt}`}
            title={t('zoomHint')}
            onClick={() => { if (swiped.current) { swiped.current = false; return; } setOpen(true); }}
            onMouseEnter={() => canHover && setZoom(true)}
            onMouseLeave={() => setZoom(false)}
            onMouseMove={onMove}
            {...handlers}
          >
            <AnimatePresence initial={false}>
              <motion.span
                key={current.url}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <img
                  ref={(el) => { if (el) imgRef.current = el; }}
                  src={current.url}
                  alt={current.alt}
                  draggable={false}
                  decoding="async"
                  className={cn('h-full w-full select-none object-cover transition-transform duration-200 ease-out motion-reduce:transition-none', zoom ? 'scale-[2]' : 'scale-100')}
                />
              </motion.span>
            </AnimatePresence>
          </button>
          )}

          {badges && <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5">{badges}</div>}

          {isPhoto(current) && <button
            type="button" onClick={() => setOpen(true)} aria-label={t('zoomImage')} title={t('zoomImage')}
            className={cn(roundBtn, 'absolute right-4 top-4 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100', zoom && 'lg:group-hover:opacity-70')}
          >
            <Expand className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>}

          {/* Com o zoom ativo as setas e o Ampliar ficam a 70% (visíveis); por cima delas o zoom desliga e voltam a 100%. */}
          {total > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label={t('prevImage')} className={cn(roundBtn, 'absolute left-4 top-1/2 hidden -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 lg:grid', zoom && 'group-hover:opacity-70')}>
                <ChevronLeft className="h-5 w-5" strokeWidth={1.9} />
              </button>
              <button type="button" onClick={() => go(1)} aria-label={t('nextImage')} className={cn(roundBtn, 'absolute right-4 top-1/2 hidden -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 lg:grid', zoom && 'group-hover:opacity-70')}>
                <ChevronRight className="h-5 w-5" strokeWidth={1.9} />
              </button>
              <span className="pointer-events-none absolute bottom-4 right-4 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground shadow-[var(--shadow-soft)]" aria-live="polite">
                {t('imageCount', { n: i + 1, total })}
              </span>
            </>
          )}
        </div>

        {/* Miniaturas: por baixo no celular, coluna à esquerda no desktop */}
        {total > 1 && (
          <div
            ref={thumbsRef}
            className="relative order-2 -mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] lg:order-1 lg:mx-0 lg:max-h-[min(640px,calc(100vh_-_180px))] lg:flex-col lg:gap-3 lg:overflow-y-auto lg:overflow-x-hidden lg:px-0.5 [&::-webkit-scrollbar]:hidden"
          >
            {images.map((img, n) => (
              <button
                key={img.url}
                type="button"
                data-thumb={n}
                onClick={() => pick(n)}
                aria-label={img.kind === 'model' ? t('showModel') : img.kind === 'video' ? t('showVideo', { n: images.slice(0, n + 1).filter((g) => g.kind === 'video').length }) : t('showImage', { n: n + 1, total })}
                aria-current={n === i ? 'true' : undefined}
                className={cn(
                  'relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[14px] border-2 bg-white transition-[border-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-[84px] lg:w-[84px]',
                  n === i ? 'border-primary' : 'border-brand-card-border opacity-80 hover:border-primary/50 hover:opacity-100',
                )}
              >
                {img.kind === 'model' ? (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-brand-alt text-primary">
                    <Rotate3d className="h-6 w-6" strokeWidth={1.7} aria-hidden="true" /><span className="text-[11px] font-bold">3D</span>
                  </span>
                ) : img.kind === 'video' ? (
                  <span className="grid h-full w-full place-items-center bg-brand-ink text-white">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15"><Play className="h-4 w-4 fill-current" aria-hidden="true" /></span>
                  </span>
                ) : <img src={img.url} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />}
              </button>
            ))}
          </div>
        )}
      </section>
      <Lightbox
        images={photos} name={name} index={Math.max(0, photos.indexOf(current))} open={open} onOpenChange={setOpen}
        onIndex={(n) => pick(images.indexOf(photos[n]))} go={goPhoto}
      />
    </>
  );
}

/** Tela cheia: setas, teclado (Esc fecha), deslizar, miniaturas e zoom de 2x no ponto clicado. */
function Lightbox({ images, name, index, open, onOpenChange, onIndex, go }: {
  images: GalleryImage[]; name: string; index: number; open: boolean;
  onOpenChange: (o: boolean) => void; onIndex: (n: number) => void; go: (d: number) => void;
}) {
  const { t } = useMessages(productMessages);
  const total = images.length;
  const current = images[index];
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const { swiped, handlers } = useSwipe((d) => { if (!zoomed) go(d); });

  useEffect(() => { setZoomed(false); setOrigin('50% 50%'); }, [index, open]);

  const pointAt = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  };

  if (!current) return null;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[#111]/95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[60] flex flex-col text-white outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(1); }
          }}
        >
          <DialogPrimitive.Title className="sr-only">{name}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{t('lightboxHelp')}</DialogPrimitive.Description>

          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
            <span className="text-sm font-semibold tabular-nums text-white/80" aria-live="polite">{total > 1 ? t('imageCount', { n: index + 1, total }) : ''}</span>
            <div className="flex items-center gap-2">
              <button
                type="button" onClick={() => setZoomed((z) => !z)} aria-pressed={zoomed} aria-label={zoomed ? t('zoomOut') : t('zoomIn')} title={zoomed ? t('zoomOut') : t('zoomIn')}
                className="grid h-11 w-11 place-items-center rounded-full bg-white/10 transition-colors duration-150 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {zoomed ? <ZoomOut className="h-5 w-5" strokeWidth={1.8} /> : <ZoomIn className="h-5 w-5" strokeWidth={1.8} />}
              </button>
              <DialogPrimitive.Close aria-label={t('closeGallery')} title={t('closeGallery')} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 transition-colors duration-150 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <X className="h-5 w-5" strokeWidth={1.9} />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden" {...handlers}>
            <AnimatePresence initial={false}>
              <motion.div
                key={current.url}
                className="absolute inset-0 p-3 sm:px-20 sm:py-4"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              >
                <img
                  src={current.url}
                  alt={current.alt}
                  draggable={false}
                  onClick={(e) => {
                    if (swiped.current) { swiped.current = false; return; }
                    setOrigin(pointAt(e));
                    setZoomed((z) => !z);
                  }}
                  onMouseMove={(e) => { if (zoomed) setOrigin(pointAt(e)); }}
                  style={{ transformOrigin: origin }}
                  className={cn('h-full w-full select-none object-contain transition-transform duration-200 ease-out motion-reduce:transition-none', zoomed ? 'scale-[2] cursor-zoom-out' : 'scale-100 cursor-zoom-in')}
                />
              </motion.div>
            </AnimatePresence>
            {total > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label={t('prevImage')} className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur transition-colors duration-150 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-5">
                  <ChevronLeft className="h-6 w-6" strokeWidth={1.8} />
                </button>
                <button type="button" onClick={() => go(1)} aria-label={t('nextImage')} className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur transition-colors duration-150 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-5">
                  <ChevronRight className="h-6 w-6" strokeWidth={1.8} />
                </button>
              </>
            )}
          </div>

          {total > 1 && (
            <div className="flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
              <div className="flex max-w-full gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {images.map((img, n) => (
                  <button
                    key={img.url} type="button" onClick={() => onIndex(n)}
                    aria-label={t('showImage', { n: n + 1, total })} aria-current={n === index ? 'true' : undefined}
                    className={cn('h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition-[border-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white', n === index ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100')}
                  >
                    <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
