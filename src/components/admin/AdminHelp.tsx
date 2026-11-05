// =====================================================================================
// Caixa "Como funciona" do painel Admin: explicação curta de uma seção, em passos.
// Começa aberta na primeira visita e lembra-se (neste navegador) de quando o dono a fecha.
// Uso: <AdminHelp id="marca" title="Como funciona" steps={[...]} />
// =====================================================================================
import { useState } from 'react';
import { ChevronDown, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

const storageKey = (id: string) => `admin-help-closed:${id}`;

function readClosed(id: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) === '1';
  } catch {
    return false;
  }
}

export default function AdminHelp({ id, title, steps, className }: { id: string; title: string; steps: string[]; className?: string }) {
  const [open, setOpen] = useState(() => !readClosed(id));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      if (next) localStorage.removeItem(storageKey(id));
      else localStorage.setItem(storageKey(id), '1');
    } catch {
      // armazenamento bloqueado: a caixa só não lembra o estado
    }
  };
  return (
    <div className={cn('rounded-2xl border border-primary/20 bg-accent/60', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground"
      >
        <Lightbulb className="h-4 w-4 shrink-0 text-brand-orange-text" strokeWidth={1.8} />
        <span className="flex-1">{title}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="space-y-1.5 px-4 pb-4 pl-10 text-sm text-muted-foreground">
          {steps.map((s) => (
            <li key={s} className="list-decimal marker:font-semibold marker:text-brand-orange-text">
              {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
