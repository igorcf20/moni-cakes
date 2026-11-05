import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { mediaUrl, type MediaKey } from '@/lib/media';
import { cn } from '@/lib/utils';

/**
 * Foto da loja (public/images, pela chave `k`) ou enviada no Admin (`src`, ganha à chave);
 * enquanto não existir, a reserva visual dada em `fallback`.
 */
export function MediaImage({ k, src, alt, className, imgClassName, fallback, eager = false }: {
  k?: MediaKey | null; src?: string | null; alt: string; className?: string; imgClassName?: string; fallback: ReactNode; eager?: boolean;
}) {
  const url = src || (k ? mediaUrl(k) : null);
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {url && !failed
        ? <img src={url} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} className={cn('h-full w-full object-cover', imgClassName)} />
        : fallback}
    </div>
  );
}

/**
 * Reserva para fotos ainda não enviadas: fundo creme com linhas finas de camada (como uma peça impressa)
 * e o ícone da categoria em laranja. Some sozinha quando a foto entra em src/lib/media.ts.
 */
export function LayerArt({ Icon, className, size = 'md' }: { Icon: LucideIcon; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-28 w-28' : size === 'sm' ? 'h-12 w-12' : 'h-20 w-20';
  const icon = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-5 w-5' : 'h-9 w-9';
  return (
    <div
      className={cn('absolute inset-0 grid place-items-center bg-brand-alt', className)}
      style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(23,23,23,0.035) 0 1px, transparent 1px 7px)' }}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-x-[18%] bottom-[16%] h-6 rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.10),transparent)] blur-sm" />
      <span className={cn('relative grid place-items-center rounded-full bg-white text-primary shadow-[var(--shadow-soft)] transition-transform duration-200 group-hover:-translate-y-1', box)}>
        <Icon className={icon} strokeWidth={1.6} />
      </span>
    </div>
  );
}
