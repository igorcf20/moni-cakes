// Capa de um kit: a foto do kit (Admin > Kits > Página do kit) ou, sem foto, uma montagem com as fotos das peças
// (1 peça = uma foto grande; 2 = lado a lado; 3 ou mais = uma grande e duas menores). Quantidade > 1 = selo "2x".
// Usada na página inicial (HomeKits) e na lista /kits.
import { useState } from 'react';
import { Box, Gift } from 'lucide-react';
import { LayerArt } from '@/components/MediaImage';
import { kitPhotos, type KitProduct, type KitRow } from '@/lib/kits';
import { cn } from '@/lib/utils';

type Piece = { product_id: string; quantity: number; product: KitProduct | null };

function Img({ src, className, contain }: { src?: string | null; className?: string; contain?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn('relative block overflow-hidden bg-white', className)}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn('h-full w-full transition-transform duration-300 group-hover:scale-[1.04]', contain ? 'object-contain' : 'object-cover')} />
        : <LayerArt Icon={Box} size="sm" />}
    </span>
  );
}

function Qty({ n }: { n: number }) {
  if (n <= 1) return null;
  return <span className="absolute bottom-2 right-2 rounded-lg bg-brand-ink/85 px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-white">{n}x</span>;
}

export function KitCover({ kit, pieces, className }: { kit: KitRow; pieces: Piece[]; className?: string }) {
  const photo = kitPhotos(kit)[0];
  const [failed, setFailed] = useState(false);
  if (photo && !failed) {
    return (
      <div className={cn('relative overflow-hidden bg-brand-alt', className)}>
        <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
      </div>
    );
  }
  const list = pieces.filter((p) => p.product).slice(0, 3);
  if (!list.length) return <div className={cn('relative overflow-hidden bg-brand-alt', className)}><LayerArt Icon={Gift} /></div>;
  return (
    <div className={cn('relative grid gap-2 overflow-hidden bg-brand-alt p-2', list.length === 1 && 'grid-cols-[minmax(0,1fr)]', list.length === 2 && 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]', list.length >= 3 && 'grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] grid-rows-2', className)}>
      {list.map((p, i) => (
        <span key={p.product_id} className={cn('relative min-h-0 overflow-hidden rounded-[14px]', list.length >= 3 && i === 0 && 'row-span-2')}>
          <Img src={p.product?.image} className="h-full w-full" contain={list.length === 1} />
          <Qty n={p.quantity} />
        </span>
      ))}
    </div>
  );
}
