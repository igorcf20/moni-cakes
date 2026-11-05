// =====================================================================================
// Admin > Privacidade e cookies (LGPD / RGPD).
//
//   Ferramentas   IDs do Google Analytics 4 e do Meta Pixel + validade da escolha do visitante, gravados em
//                 store_settings.privacy_settings (formato em src/lib/privacy.ts). O aviso de cookies, o carregador
//                 das ferramentas (ConsentScripts) e a política de privacidade leem esta configuração.
//   Registos      últimas escolhas da tabela consent_records (só administradores leem), contagens dos últimos
//                 30 dias, procura pelo código da escolha e exportação em CSV (prova do consentimento).
// Textos em src/i18n/adminPrivacy.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Download, ExternalLink, Loader2, Save, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import AdminHelp from '@/components/admin/AdminHelp';
import { PRIVACY_QUERY_KEY, usePrivacySettingsQuery } from '@/hooks/usePrivacySettings';
import { useMessages } from '@/i18n';
import { adminPrivacyMessages } from '@/i18n/adminPrivacy';
import { GA4_RE, META_PIXEL_RE, type PrivacySettings } from '@/lib/privacy';
import { cn } from '@/lib/utils';

type RecordRow = {
  id: string;
  consent_id: string;
  user_id: string | null;
  choices: Json;
  action: string;
  gpc: boolean;
  locale: string | null;
  country: string | null;
  policy_version: number;
  created_at: string;
};

const CATS = ['preferences', 'analytics', 'marketing'] as const;
const DAYS = 30;
const LIMIT = 5000;

function choicesOf(v: Json): Record<(typeof CATS)[number], boolean> {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return { preferences: o.preferences === true, analytics: o.analytics === true, marketing: o.marketing === true };
}

function csvCell(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default function AdminPrivacy() {
  const { t, locale } = useMessages(adminPrivacyMessages);
  const queryClient = useQueryClient();
  const { data: published, isLoading } = usePrivacySettingsQuery();
  const [form, setForm] = useState<PrivacySettings | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (published && !form) setForm(published);
  }, [published, form]);

  const ga4 = (form?.ga4Id ?? '').trim().toUpperCase();
  const pixel = (form?.metaPixelId ?? '').trim();
  const ga4Bad = !!ga4 && !GA4_RE.test(ga4);
  const pixelBad = !!pixel && !META_PIXEL_RE.test(pixel);
  const dirty = !!form && !!published && (ga4 !== published.ga4Id || pixel !== published.metaPixelId || form.consentMonths !== published.consentMonths);

  const save = useMutation({
    mutationFn: async () => {
      const value: PrivacySettings = { ga4Id: ga4, metaPixelId: pixel, consentMonths: form?.consentMonths === 6 ? 6 : 12 };
      const { error } = await supabase
        .from('store_settings')
        .upsert({ key: 'privacy_settings', value: value as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRIVACY_QUERY_KEY });
      setForm(null);
      toast.success(t('saved'));
    },
    onError: () => toast.error(t('save_error')),
  });

  const since = useMemo(() => new Date(Date.now() - DAYS * 86_400_000).toISOString(), []);
  const records = useQuery({
    queryKey: ['admin-consent-records', since],
    queryFn: async (): Promise<RecordRow[]> => {
      const { data, error } = await supabase
        .from('consent_records')
        .select('id, consent_id, user_id, choices, action, gpc, locale, country, policy_version, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => records.data ?? [], [records.data]);
  const counts = useMemo(() => {
    const c = { total: rows.length, accept_all: 0, reject_all: 0, custom: 0 };
    for (const r of rows) if (r.action in c) c[r.action as 'accept_all' | 'reject_all' | 'custom']++;
    return c;
  }, [rows]);
  const q = search.trim().toLowerCase();
  const visible = (q ? rows.filter((r) => r.consent_id.toLowerCase().includes(q)) : rows).slice(0, 50);
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  const actionLabel = (a: string) => (a === 'accept_all' ? t('action_accept_all') : a === 'reject_all' ? t('action_reject_all') : t('action_custom'));

  const exportCsv = () => {
    if (!rows.length) return toast.info(t('export_empty'));
    const head = ['created_at', 'consent_id', 'action', 'preferences', 'analytics', 'marketing', 'gpc', 'policy_version', 'country', 'locale', 'account'];
    const lines = rows.map((r) => {
      const c = choicesOf(r.choices);
      return [r.created_at, r.consent_id, r.action, String(c.preferences), String(c.analytics), String(c.marketing), String(r.gpc), String(r.policy_version), r.country ?? '', r.locale ?? '', r.user_id ? 'yes' : 'no']
        .map(csvCell)
        .join(',');
    });
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consentimentos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !form) return <Skeleton className="h-[600px] w-full rounded-xl" />;

  return (
    <div className="space-y-6">
      <AdminHelp id="privacy" title={t('help_title')} steps={[t('help_1'), t('help_2'), t('help_3'), t('help_4')]} />

      <Card>
        <CardHeader>
          <CardTitle>{t('tools_title')}</CardTitle>
          <CardDescription>{t('tools_text')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="privacy-ga4">{t('ga4_label')}</Label>
                <Badge variant="secondary">{t('category_analytics')}</Badge>
              </div>
              <Input
                id="privacy-ga4" value={form.ga4Id} placeholder="G-XXXXXXXXXX" autoComplete="off" spellCheck={false}
                aria-invalid={ga4Bad} aria-describedby="privacy-ga4-hint"
                onChange={(e) => setForm({ ...form, ga4Id: e.target.value })}
                className={cn(ga4Bad && 'border-destructive')}
              />
              <p id="privacy-ga4-hint" className={cn('text-xs', ga4Bad ? 'text-destructive' : 'text-muted-foreground')}>{ga4Bad ? t('ga4_invalid') : t('ga4_hint')}</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="privacy-pixel">{t('pixel_label')}</Label>
                <Badge variant="secondary">{t('category_marketing')}</Badge>
              </div>
              <Input
                id="privacy-pixel" value={form.metaPixelId} placeholder="123456789012345" inputMode="numeric" autoComplete="off" spellCheck={false}
                aria-invalid={pixelBad} aria-describedby="privacy-pixel-hint"
                onChange={(e) => setForm({ ...form, metaPixelId: e.target.value })}
                className={cn(pixelBad && 'border-destructive')}
              />
              <p id="privacy-pixel-hint" className={cn('text-xs', pixelBad ? 'text-destructive' : 'text-muted-foreground')}>{pixelBad ? t('pixel_invalid') : t('pixel_hint')}</p>
            </div>
          </div>
          <div className="max-w-sm space-y-1.5">
            <Label>{t('months_label')}</Label>
            <Select value={String(form.consentMonths)} onValueChange={(v) => setForm({ ...form, consentMonths: v === '6' ? 6 : 12 })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="6">{t('months_6')}</SelectItem>
                <SelectItem value="12">{t('months_12')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('months_hint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!dirty || save.isPending}
              onClick={() => (ga4Bad || pixelBad ? toast.error(t('fix_errors')) : save.mutate())}
            >
              {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              {save.isPending ? t('saving') : t('save')}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/politica-privacidade#cookies" target="_blank" rel="noopener"><ExternalLink className="mr-1.5 h-4 w-4" />{t('open_policy')}</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('policy_hint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{t('records_title')}</CardTitle>
            <CardDescription>{t('records_text')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={records.isLoading}>
            <Download className="mr-1.5 h-4 w-4" />{t('export')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [t('stat_total'), counts.total],
              [t('stat_accept'), counts.accept_all],
              [t('stat_reject'), counts.reject_all],
              [t('stat_custom'), counts.custom],
            ].map(([label, n]) => (
              <div key={label} className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{records.isLoading ? '-' : n}</p>
              </div>
            ))}
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} aria-label={t('search')} className="pl-9" />
          </div>

          {records.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : records.isError ? (
            <p className="text-sm text-destructive">{t('load_error')}</p>
          ) : !rows.length ? (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          ) : !visible.length ? (
            <p className="text-sm text-muted-foreground">{t('no_match')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('col_date')}</th>
                    <th className="px-3 py-2 font-medium">{t('col_code')}</th>
                    <th className="px-3 py-2 font-medium">{t('col_action')}</th>
                    <th className="px-3 py-2 font-medium">{t('col_choice')}</th>
                    <th className="px-3 py-2 font-medium">{t('col_where')}</th>
                    <th className="px-3 py-2 font-medium">{t('col_account')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const c = choicesOf(r.choices);
                    const on = CATS.filter((k) => c[k]);
                    return (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmt(r.created_at)}</td>
                        <td className="px-3 py-2 font-mono text-xs" title={r.consent_id}>{r.consent_id.slice(0, 8)}</td>
                        <td className="px-3 py-2">
                          {actionLabel(r.action)}
                          {r.gpc && <Badge variant="outline" className="ml-1.5" title={t('gpc_title')}>{t('gpc')}</Badge>}
                        </td>
                        <td className="px-3 py-2">{on.length ? on.map((k) => t(`cat_${k}`)).join(', ') : t('only_needed')}</td>
                        <td className="px-3 py-2">{[r.country, r.locale].filter(Boolean).join(' / ') || '-'}</td>
                        <td className="px-3 py-2">{r.user_id ? t('logged_in') : t('guest')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {visible.length === 50 && <p className="text-xs text-muted-foreground">{t('showing', { count: 50 })}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('checklist_title')}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2.5">
            {[t('check_1'), t('check_2'), t('check_3'), t('check_4'), t('check_5')].map((line) => (
              <li key={line} className="flex gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
