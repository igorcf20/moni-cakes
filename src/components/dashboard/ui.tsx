// Peças visuais partilhadas pela área do cliente PRINT3D (botões 14px, cartões 20px, laranja #FF5A0A).
import { useState, type ReactNode } from 'react';
import { Check, Eye, EyeOff, X, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LayerArt } from '@/components/MediaImage';
import { useMessages } from '@/i18n';
import { accountMessages } from '@/i18n/account';
import { cn } from '@/lib/utils';
import { PASSWORD_RULES, statusKey } from './accountUtils';

export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
export const btnPrimary = `inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 ${focusRing}`;
export const btnSecondary = `inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-5 text-[15px] font-semibold text-foreground transition-[border-color,color,transform] duration-150 hover:border-primary hover:text-brand-orange-text active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 ${focusRing}`;
export const btnSmall = `inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-border bg-white px-4 text-[14px] font-semibold text-foreground transition-[border-color,color,transform] duration-150 hover:border-primary hover:text-brand-orange-text active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 ${focusRing}`;
export const btnGhost = `inline-flex min-h-11 items-center gap-1.5 rounded-[12px] px-3 text-[14px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-accent disabled:opacity-60 ${focusRing}`;
export const btnDanger = `inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-destructive px-5 text-[15px] font-semibold text-destructive-foreground transition-[background-color,transform] duration-150 hover:bg-destructive/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 ${focusRing}`;
export const iconBtn = `grid h-11 w-11 shrink-0 place-items-center rounded-[12px] text-brand-ink-soft transition-colors duration-150 hover:bg-brand-alt hover:text-foreground ${focusRing}`;
export const inputCls = 'h-12 rounded-[14px] border-border bg-white text-[16px] md:text-[15px]';
export const labelCls = 'text-[14px] font-semibold text-foreground';
export const cardCls = 'rounded-[20px] border border-brand-card-border bg-white shadow-[var(--shadow-card)]';
export const h1Cls = 'text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] text-foreground [text-wrap:balance] sm:text-[44px] lg:text-[52px]';
export const h2Cls = 'text-[26px] font-bold leading-tight tracking-[-0.03em] text-foreground sm:text-[30px]';
export const h3Cls = 'text-[20px] font-bold leading-tight tracking-[-0.02em] text-foreground';
export const eyebrowCls = 'text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text';
export const iconTile = 'grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-brand-orange-soft text-primary';

/** Rótulo, campo, dica e erro (com o asterisco dos obrigatórios). */
export function Field({ label, htmlFor, required, hint, error, errorId, trailing, children }: {
  label: string; htmlFor?: string; required?: boolean; hint?: string; error?: string; errorId?: string; trailing?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <Label htmlFor={htmlFor} className={labelCls}>
          {label}{required && <span className="text-destructive" aria-hidden="true"> *</span>}
          {hint && <span className="font-normal text-muted-foreground"> ({hint})</span>}
        </Label>
        {trailing}
      </div>
      {children}
      {error && <p id={errorId} role="alert" className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}

/** Campo de senha com botão para mostrar ou ocultar (alvo de 44px). */
export function PasswordInput({ id, value, onChange, autoComplete, invalid, describedBy, placeholder, className }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete?: string; invalid?: boolean; describedBy?: string; placeholder?: string; className?: string;
}) {
  const { t } = useMessages(accountMessages);
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} placeholder={placeholder} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        className={cn(inputCls, 'pr-12', invalid && 'border-destructive focus-visible:ring-destructive/30', className)}
      />
      <button
        type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t('authHidePassword') : t('authShowPassword')} aria-pressed={show}
        className={cn('absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-[12px] text-muted-foreground transition-colors duration-150 hover:text-foreground', focusRing)}
      >
        {show ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.8} />}
      </button>
    </div>
  );
}

/** Lista dos requisitos da senha, marcando os cumpridos. */
export function PasswordChecklist({ value }: { value: string }) {
  const { t } = useMessages(accountMessages);
  return (
    <ul className="grid grid-cols-1 gap-x-3 gap-y-1.5 rounded-[14px] bg-brand-alt px-4 py-3 sm:grid-cols-2" aria-label={t('pwRules')}>
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.id} className={cn('flex items-center gap-1.5 text-[13px] transition-colors duration-200', ok ? 'text-emerald-700' : 'text-muted-foreground')}>
            {ok ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" /> : <X className="h-3.5 w-3.5 shrink-0 opacity-50" strokeWidth={2} aria-hidden="true" />}
            {t(r.key)}
          </li>
        );
      })}
    </ul>
  );
}

/** Estado vazio com a reserva visual de camadas (LayerArt) e as ações. */
export function EmptyState({ Icon, title, text, children, className }: { Icon: LucideIcon; title: string; text: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[24px] border border-brand-card-border bg-white px-5 py-12 text-center sm:px-10 sm:py-14', className)}>
      <div className="relative mx-auto h-28 w-28 overflow-hidden rounded-[20px] sm:h-32 sm:w-32"><LayerArt Icon={Icon} /></div>
      <h2 className="mx-auto mt-6 max-w-lg text-[22px] font-bold leading-tight tracking-[-0.03em] [text-wrap:balance] sm:text-[26px]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-base">{text}</p>
      {children && <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>}
    </div>
  );
}

const STATUS_TONE: Record<string, { box: string; dot: string }> = {
  pending: { box: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  awaiting_payment: { box: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  paid: { box: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' },
  preparing: { box: 'bg-violet-50 text-violet-800 ring-violet-200', dot: 'bg-violet-500' },
  ready_for_pickup: { box: 'bg-teal-50 text-teal-800 ring-teal-200', dot: 'bg-teal-500' },
  shipped: { box: 'bg-indigo-50 text-indigo-800 ring-indigo-200', dot: 'bg-indigo-500' },
  delivered: { box: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  completed: { box: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  cancelled: { box: 'bg-rose-50 text-rose-800 ring-rose-200', dot: 'bg-rose-500' },
  refunded: { box: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-500' },
};

/** Selo colorido do estado do pedido, traduzido. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useMessages(accountMessages);
  const tone = STATUS_TONE[status] ?? { box: 'bg-brand-alt text-brand-ink-soft ring-border', dot: 'bg-brand-ink-soft' };
  const key = statusKey(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset', tone.box, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />
      {key ? t(key) : status}
    </span>
  );
}

/** Miniatura de um item do pedido (foto do produto ou a reserva de camadas). */
export function ItemThumb({ src, alt, Icon, className }: { src?: string | null; alt: string; Icon: LucideIcon; className?: string }) {
  return (
    <span className={cn('relative block h-14 w-14 shrink-0 overflow-hidden rounded-[12px] border border-brand-card-border bg-background', className)}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        // Reserva pequena: linhas de camada e o ícone em laranja, sem o círculo da LayerArt (apertado neste tamanho).
        <span
          className="absolute inset-0 grid place-items-center bg-brand-alt text-primary"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(23,23,23,0.035) 0 1px, transparent 1px 6px)' }}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" strokeWidth={1.7} />
        </span>
      )}
    </span>
  );
}
