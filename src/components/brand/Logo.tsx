// =====================================================================================
// Logo da loja (cabeçalho, rodapé, menu do celular, login).
// Tudo vem da marca (useBrand, Admin > Marca e visual), nada fixo de uma loja:
//   LogoMark  símbolo quadrado; sem imagem, a inicial do nome num quadrado da cor da marca
//   Wordmark  nome desenhado (imagem); sem imagem, o nome em texto com o trecho final destacado
//   Logo      os dois juntos, com link para a página inicial
// =====================================================================================
import { Link } from 'react-router-dom';
import { useBrand } from '@/hooks/useBrand';
import { splitAccent } from '@/theme/brand';
import { cn } from '@/lib/utils';

export function LogoMark({ className, tile = false }: { className?: string; tile?: boolean }) {
  const { name, logos } = useBrand();
  if (!logos.icon) {
    return (
      <span
        aria-hidden="true"
        className={cn('grid h-11 w-11 shrink-0 select-none place-items-center rounded-[12px] bg-[image:var(--gradient-primary)] text-[20px] font-extrabold text-primary-foreground', className)}
      >
        {name.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  const img = (
    <img
      src={logos.icon}
      width={44}
      height={44}
      alt=""
      aria-hidden="true"
      decoding="async"
      className={cn('h-11 w-11 select-none object-contain', tile && 'h-9 w-9', !tile && className)}
      draggable={false}
    />
  );
  // Em fundo escuro, `tile` põe o símbolo num quadrado claro para as partes escuras não desaparecerem.
  if (!tile) return img;
  return <span className={cn('inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-background', className)}>{img}</span>;
}

/** Nome da loja: imagem do nome (se o Admin enviou) ou texto com o trecho final na cor da marca. */
export function Wordmark({ tone = 'dark', className }: { tone?: 'dark' | 'light'; className?: string }) {
  const { name, nameAccent, logos } = useBrand();
  const src = tone === 'light' ? logos.wordmarkLight || '' : logos.wordmark;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        decoding="async"
        draggable={false}
        className={cn('h-[22px] w-auto max-w-[200px] select-none object-contain object-left sm:h-6', className)}
      />
    );
  }
  const [head, accent] = splitAccent(name.trim(), nameAccent);
  return (
    <span className={cn('text-[1.45rem] font-extrabold leading-none tracking-[-0.04em]', tone === 'light' ? 'text-white' : 'text-foreground', className)}>
      {head}
      {accent && <span className="text-primary">{accent}</span>}
    </span>
  );
}

export function Logo({ className, tone = 'dark' }: { className?: string; compact?: boolean; tone?: 'dark' | 'light' }) {
  const { name } = useBrand();
  return (
    <Link to="/" className={cn('group flex shrink-0 items-center gap-2', className)} aria-label={name}>
      <LogoMark tile={tone === 'light'} className="transition-transform duration-200 ease-out group-hover:-rotate-6" />
      <Wordmark tone={tone} />
    </Link>
  );
}
