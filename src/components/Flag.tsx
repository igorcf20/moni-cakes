// =====================================================================================
// Bandeira de um país (código ISO de 2 letras), desenhada em SVG (pacote country-flag-icons, MIT).
// Cada bandeira é um ficheiro à parte, carregado só quando aparece; até lá fica um retângulo neutro.
// Usamos SVG e não emoji porque o Windows não desenha bandeiras em emoji.
// =====================================================================================
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const FILES = import.meta.glob<string>('/node_modules/country-flag-icons/3x2/*.svg', { query: '?raw', import: 'default' });
const loaded = new Map<string, string>();

function fileOf(code: string) {
  return FILES[`/node_modules/country-flag-icons/3x2/${code.toUpperCase()}.svg`];
}

/** Bandeira 3:2 com cantos arredondados e um contorno fino (bandeiras brancas não somem no fundo branco). */
export function Flag({ code, className }: { code: string; className?: string }) {
  const key = code.toUpperCase();
  const [svg, setSvg] = useState(() => loaded.get(key) ?? null);

  useEffect(() => {
    const cached = loaded.get(key);
    if (cached) { setSvg(cached); return; }
    setSvg(null);
    const load = fileOf(key);
    if (!load) return;
    let alive = true;
    void load().then((s) => { loaded.set(key, s); if (alive) setSvg(s); });
    return () => { alive = false; };
  }, [key]);

  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-block aspect-[3/2] shrink-0 overflow-hidden rounded-[4px] bg-secondary [&>svg]:h-full [&>svg]:w-full',
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-black/10', className)}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
