// =====================================================================================
// Barra do topo do painel Admin (no lugar do cabeçalho e rodapé da loja, que só ocupavam espaço aqui).
// No computador fica ao lado da barra lateral grafite: título da seção, busca de seções do painel, sino com o que
// espera o administrador (os mesmos contadores do menu, nunca números inventados), idioma, Ver o site e conta.
// No celular mostra o símbolo e o nome da loja (Admin > Marca e visual).
// =====================================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ExternalLink, LogOut, Search } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import { LanguagePicker } from '@/components/header/LanguagePicker';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useStoreName } from '@/hooks/useBrand';
import { useMessages } from '@/i18n';
import { adminManageMessages } from '@/i18n/adminManage';
import { adminMessages } from '@/i18n/admin';
import type { AdminAttention } from '@/hooks/useAdminAttention';
import { sectionNameKey, type AdminGroup, type AdminSection } from '@/components/admin/shell/adminSections';

type Props = {
  groups: AdminGroup[];
  attention: AdminAttention;
  current?: AdminSection;
  onPick: (section: string) => void;
};

/** Fecha um menu suspenso ao clicar fora dele ou com Esc. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return ref;
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function SectionSearch({ groups, onPick }: Pick<Props, 'groups' | 'onPick'>) {
  const { t } = useMessages(adminMessages);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const results = useMemo(() => {
    const term = normalize(q.trim());
    if (!term) return [];
    return groups.flatMap((g) => g.items.map((s) => ({ s, group: t(g.label), name: t(sectionNameKey(s.value)) })))
      .filter((r) => normalize(r.name).includes(term) || normalize(r.group).includes(term))
      .slice(0, 8);
  }, [q, groups, t]);
  const pick = (v: string) => { setQ(''); setOpen(false); onPick(v); };

  return (
    <div ref={ref} className="relative w-full max-w-[420px]">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); pick(results[0].s.value); } }}
        placeholder={t('find_section')}
        aria-label={t('find_section')}
        title={t('find_section_hint')}
        className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus:border-foreground/30 focus:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-[var(--shadow-soft)]">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">{t('find_none')}</p>
          ) : results.map(({ s, group, name }) => (
            <button key={s.value} type="button" onClick={() => pick(s.value)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
              <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{group}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WaitingBell({ groups, attention, onPick }: Omit<Props, 'current'>) {
  const { t } = useMessages(adminMessages);
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const waiting = groups.flatMap((g) => g.items).map((s) => ({ s, n: s.badge?.(attention) ?? 0 })).filter((r) => r.n > 0);
  const total = waiting.reduce((sum, r) => sum + r.n, 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={total > 0 ? `${t('notif_title')}: ${total}` : t('notif_title')}
        title={t('notif_title')}
        className="relative grid h-10 w-10 place-items-center rounded-full text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-[19px] w-[19px]" strokeWidth={1.7} aria-hidden="true" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground ring-2 ring-card">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[300px] overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-[var(--shadow-soft)]">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('notif_title')}</p>
          {waiting.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">{t('notif_none')}</p>
          ) : waiting.map(({ s, n }) => (
            <button key={s.value} type="button" onClick={() => { setOpen(false); onPick(s.value); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
              <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{t(sectionNameKey(s.value))}</span>
              <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-bold leading-5 tabular-nums text-primary-foreground">{n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminTopBar({ groups, attention, current, onPick }: Props) {
  const { t } = useMessages(adminManageMessages);
  const { t: ta } = useMessages(adminMessages);
  const { user, signOut } = useAuth();
  const name = useStoreName();
  const navigate = useNavigate();
  const initial = (user?.email ?? name).trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        {/* Celular: marca da loja (no computador ela fica no topo da barra lateral). */}
        <Link to="/admin" className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
          <LogoMark className="h-9 w-9" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold leading-tight text-foreground">{name}</span>
            <span className="block truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('top_sub')}</span>
          </span>
        </Link>
        {/* Computador: seção atual e busca no painel. */}
        <div className="hidden min-w-0 flex-1 items-center gap-6 lg:flex">
          <span className="hidden min-w-0 shrink truncate text-[15px] font-semibold text-foreground xl:block">
            {current ? ta(sectionNameKey(current.value)) : ta('panel')}
          </span>
          <SectionSearch groups={groups} onPick={onPick} />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <WaitingBell groups={groups} attention={attention} onPick={onPick} />
          <LanguagePicker compact />
          <Button asChild variant="outline" size="sm" className="hidden min-h-9 rounded-full sm:inline-flex">
            <a href="/" target="_blank" rel="noreferrer">
              {t('top_view_site')} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
          {user?.email && (
            <span className="hidden items-center gap-2 pl-1 lg:flex" title={user.email}>
              <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">{initial}</span>
              <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground 2xl:inline">{user.email}</span>
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="min-h-9 rounded-full"
            onClick={async () => { await signOut(); navigate('/shop-kodeadmin'); }}
            aria-label={t('top_sign_out')}
            title={t('top_sign_out')}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('top_sign_out')}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
