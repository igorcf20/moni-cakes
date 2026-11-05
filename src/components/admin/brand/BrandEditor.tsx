// =====================================================================================
// Admin > Marca e visual: editor da identidade da loja (topo da seção "visual" do painel).
//
// Secções do ecrã (pela ordem):
//   1. Como funciona (AdminHelp)
//   2. Nome e frase        -> nome em store_info.name; frase e destaque em store_brand
//   3. Logos e ícones      -> store_brand.logos, favicon, shareImage (ficheiros em product-images/branding)
//   4. Cores               -> modelos prontos (src/theme/presets.ts) + cores + ajustes finos
//   5. Fontes              -> src/theme/fonts.ts
//   6. Google e partilhas  -> descrição
//   Ao lado: pré-visualização ao vivo (BrandPreview). Em baixo: barra Publicar / Desfazer / Voltar ao padrão.
//
// Nada muda no site até Publicar. Gravar = upsert de store_brand (+ store_info com o nome) e
// invalidar a consulta da marca (useBrand), o que repinta o site e o próprio painel.
// =====================================================================================
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Image as ImageIcon, Loader2, Palette, RotateCcw, Search, Type, Undo2, Upload, Store } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmStrip } from '@/components/admin/shell/AdminPageParts';
import AdminHelp from '@/components/admin/AdminHelp';
import { BRAND_QUERY_KEY, useBrandQuery } from '@/hooks/useBrand';
import { STORE_DEFAULTS } from '@/config/store';
import { toSaved } from '@/theme/brand';
import { contrastWarnings, resolveColors } from '@/theme/themeVars';
import { PRESET_IDS, PRESETS, presetTheme, type PresetId } from '@/theme/presets';
import type { StoreBrand, ThemeColors } from '@/theme/types';
import { useMessages } from '@/i18n';
import { adminBrandMessages, type AdminBrandKey } from '@/i18n/adminBrand';
import { cn } from '@/lib/utils';
import { ColorField, FieldLabel, FontField, ImageField } from './fields';
import BrandPreview from './BrandPreview';

const MAIN_COLORS = ['primary', 'primary2', 'background', 'surface', 'surfaceAlt', 'text', 'textMuted', 'border'] as const;
const FINE_COLORS = ['primaryText', 'primarySoft', 'primaryHover', 'gradientEnd', 'textSoft'] as const;

const clone = (b: StoreBrand): StoreBrand => ({ ...b, logos: { ...b.logos }, theme: { ...b.theme, colors: { ...b.theme.colors } } });

async function publishBrand(brand: StoreBrand) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('store_settings')
    .upsert({ key: 'store_brand', value: toSaved(brand) as unknown as Json, updated_at: now }, { onConflict: 'key' });
  if (error) throw error;
  // O nome vive em store_info (também editado em Configurações > Empresa): junta sem apagar o resto.
  const { data: row, error: readError } = await supabase.from('store_settings').select('value').eq('key', 'store_info').maybeSingle();
  if (readError) throw readError;
  const info = (row?.value && typeof row.value === 'object' ? row.value : {}) as Record<string, unknown>;
  if (info.name !== brand.name) {
    const { error: infoError } = await supabase
      .from('store_settings')
      .upsert({ key: 'store_info', value: { ...info, name: brand.name } as Json, updated_at: now }, { onConflict: 'key' });
    if (infoError) throw infoError;
  }
}

export default function BrandEditor() {
  const { t, locale } = useMessages(adminBrandMessages);
  const queryClient = useQueryClient();
  const { data: published, isLoading } = useBrandQuery();
  const [draft, setDraft] = useState<StoreBrand | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Começa (e recomeça depois de publicar) a partir do que está publicado.
  useEffect(() => {
    if (published && !draft) setDraft(clone(published));
  }, [published, draft]);

  const dirty = useMemo(() => !!draft && !!published && JSON.stringify(draft) !== JSON.stringify(published), [draft, published]);

  const save = useMutation({
    mutationFn: () => publishBrand(draft as StoreBrand),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BRAND_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['storeInfo'] });
      queryClient.invalidateQueries({ queryKey: ['storeSettings'] });
      setDraft(null); // volta a ler o publicado
      toast.success(t('published'));
    },
    onError: () => toast.error(t('publish_error')),
  });

  if (isLoading || !draft) return <Skeleton className="h-[600px] w-full rounded-xl" />;

  const set = (patch: Partial<StoreBrand>) => setDraft({ ...draft, ...patch });
  const setLogo = (k: keyof StoreBrand['logos'], v: string) => setDraft({ ...draft, logos: { ...draft.logos, [k]: v } });
  const setColor = (k: keyof ThemeColors, v: string) => {
    const colors = { ...draft.theme.colors };
    if (v) colors[k] = v;
    else if ((FINE_COLORS as readonly string[]).includes(k)) delete colors[k];
    setDraft({ ...draft, theme: { ...draft.theme, colors } });
  };
  const applyPreset = (id: PresetId) => setDraft({ ...draft, theme: presetTheme(id) });
  const resolved = resolveColors(draft.theme.colors);
  const warnings = contrastWarnings(draft.theme.colors);
  const label = (k: string) => t(k as AdminBrandKey);

  return (
    <div className="space-y-6 pb-24">
      {/* 1. Ajuda (o título da seção vem do cabeçalho do painel, src/pages/Admin.tsx) */}
      <AdminHelp id="brand" title={t('help_title')} steps={[t('help_1'), t('help_2'), t('help_3'), t('help_4')]} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* 2. Nome e frase */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><Store className="h-5 w-5 text-primary" /> {t('sec_identity')}</CardTitle>
              <CardDescription>{t('sec_identity_hint')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="brand-name" label={t('name')} hint={t('name_hint')} />
                <Input id="brand-name" value={draft.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="brand-accent" label={t('accent')} hint={t('accent_hint')} />
                <Input id="brand-accent" value={draft.nameAccent} maxLength={20} onChange={(e) => set({ nameAccent: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <FieldLabel htmlFor="brand-tagline" label={t('tagline')} hint={t('tagline_hint')} />
                <Input id="brand-tagline" value={draft.tagline} maxLength={80} onChange={(e) => set({ tagline: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          {/* 3. Logos e ícones */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><ImageIcon className="h-5 w-5 text-primary" /> {t('sec_logos')}</CardTitle>
              <CardDescription>{t('sec_logos_hint')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <ImageField label={t('logo_icon')} hint={t('logo_icon_hint')} value={draft.logos.icon} onChange={(v) => setLogo('icon', v)} defaultValue={STORE_DEFAULTS.logos.icon} aspect="aspect-[2/1]" useDefaultLabel={t('use_default')} />
              <ImageField label={t('logo_wordmark')} hint={t('logo_wordmark_hint')} value={draft.logos.wordmark} onChange={(v) => setLogo('wordmark', v)} defaultValue={STORE_DEFAULTS.logos.wordmark} aspect="aspect-[2/1]" useDefaultLabel={t('use_default')} />
              <ImageField label={t('logo_wordmark_light')} hint={t('logo_wordmark_light_hint')} value={draft.logos.wordmarkLight} onChange={(v) => setLogo('wordmarkLight', v)} defaultValue={STORE_DEFAULTS.logos.wordmarkLight} aspect="aspect-[2/1] !bg-neutral-900" useDefaultLabel={t('use_default')} />
              <ImageField label={t('logo_full')} hint={t('logo_full_hint')} value={draft.logos.full} onChange={(v) => setLogo('full', v)} defaultValue={STORE_DEFAULTS.logos.full} aspect="aspect-[2/1]" useDefaultLabel={t('use_default')} />
              <ImageField label={t('favicon')} hint={t('favicon_hint')} value={draft.favicon} onChange={(v) => set({ favicon: v })} defaultValue={STORE_DEFAULTS.favicon} aspect="aspect-[2/1]" useDefaultLabel={t('use_default')} />
              <ImageField label={t('share_image')} hint={t('share_image_hint')} value={draft.shareImage} onChange={(v) => set({ shareImage: v })} defaultValue={STORE_DEFAULTS.shareImage} aspect="aspect-[1200/630]" useDefaultLabel={t('use_default')} />
            </CardContent>
          </Card>

          {/* 4. Cores */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><Palette className="h-5 w-5 text-primary" /> {t('sec_colors')}</CardTitle>
              <CardDescription>{t('sec_colors_hint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <FieldLabel label={t('presets')} hint={t('presets_hint')} />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {PRESET_IDS.map((id) => {
                    const c = PRESETS[id].colors;
                    const active = draft.theme.preset === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => applyPreset(id)}
                        aria-pressed={active}
                        className={cn('rounded-xl border p-3 text-left transition-colors hover:border-primary/60', active ? 'border-primary ring-2 ring-primary/20' : 'border-border')}
                      >
                        <span className="flex h-8 overflow-hidden rounded-lg border border-black/5">
                          {[c.background, c.surfaceAlt, c.primary2, c.primary, c.text].map((hex, i) => (
                            <span key={i} className="flex-1" style={{ background: hex }} />
                          ))}
                        </span>
                        <span className="mt-2 flex items-center gap-1 text-sm font-semibold">
                          {label(`preset_${id}`)}
                          {active && <Check className="h-3.5 w-3.5 text-brand-orange-text" aria-label={t('current')} />}
                        </span>
                        <span className="block text-xs text-muted-foreground">{label(`preset_${id}_hint`)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                {MAIN_COLORS.map((k) => (
                  <ColorField key={k} id={`color-${k}`} label={label(`color_${k}`)} hint={label(`color_${k}_hint`)} value={draft.theme.colors[k]} onChange={(v) => setColor(k, v)} invalidText={t('invalid_color')} />
                ))}
              </div>

              {warnings.length > 0 && (
                <div role="status" className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  {warnings.map((w) => (
                    <p key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t(w)}</p>
                  ))}
                </div>
              )}

              <details className="group rounded-xl border border-border p-4">
                <summary className="cursor-pointer text-sm font-semibold">{t('fine_tuning')}</summary>
                <p className="mt-1 text-xs text-muted-foreground">{t('fine_tuning_hint')}</p>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  {FINE_COLORS.map((k) => (
                    <ColorField key={k} id={`color-${k}`} label={label(`color_${k}`)} hint={label(`color_${k}_hint`)} value={draft.theme.colors[k]} onChange={(v) => setColor(k, v)} auto={resolved[k]} autoLabel={t('auto')} invalidText={t('invalid_color')} />
                  ))}
                </div>
              </details>
            </CardContent>
          </Card>

          {/* 5. Fontes */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><Type className="h-5 w-5 text-primary" /> {t('sec_fonts')}</CardTitle>
              <CardDescription>{t('sec_fonts_hint')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <FontField id="font-heading" label={t('font_heading')} value={draft.theme.fontHeading} onChange={(v) => setDraft({ ...draft, theme: { ...draft.theme, fontHeading: v } })} fontLabel={(f) => label(`font_${f}`)} sample={t('font_sample')} />
              <FontField id="font-body" label={t('font_body')} value={draft.theme.fontBody} onChange={(v) => setDraft({ ...draft, theme: { ...draft.theme, fontBody: v } })} fontLabel={(f) => label(`font_${f}`)} sample={t('font_sample')} />
            </CardContent>
          </Card>

          {/* 6. Google e partilhas */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><Search className="h-5 w-5 text-primary" /> {t('sec_seo')}</CardTitle>
              <CardDescription>{t('sec_seo_hint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <FieldLabel htmlFor="brand-description" label={t('description')} hint={t('description_hint')} />
              <Textarea id="brand-description" rows={3} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
              <p className={cn('text-xs', draft.description.length > 160 ? 'text-amber-700' : 'text-muted-foreground')}>
                {t('description_count', { n: draft.description.length.toLocaleString(locale) })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Pré-visualização */}
        <aside className="space-y-2 xl:sticky xl:top-24 xl:self-start">
          <p className="text-sm font-semibold">{t('preview')}</p>
          <p className="text-xs text-muted-foreground">{t('preview_hint')}</p>
          <BrandPreview brand={draft} t={t} />
        </aside>
      </div>

      {/* Barra de ações (fixa no fundo) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="container mx-auto flex flex-wrap items-center gap-2 px-3 py-3 md:px-4">
          <ConfirmStrip
            open={confirmReset}
            tone="warning"
            className="w-full"
            title={t('reset_title')}
            description={t('reset_body')}
            confirmLabel={t('reset_confirm')}
            onCancel={() => setConfirmReset(false)}
            onConfirm={() => { setConfirmReset(false); setDraft({ ...clone(STORE_DEFAULTS), name: draft.name }); }}
          />
          <p className={cn('mr-auto text-sm', dirty ? 'font-semibold text-brand-orange-text' : 'text-muted-foreground')}>
            {dirty ? t('unsaved') : t('subtitle')}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}><RotateCcw className="mr-1.5 h-4 w-4" /> {t('reset_default')}</Button>
          <Button variant="outline" size="sm" disabled={!dirty || save.isPending} onClick={() => published && setDraft(clone(published))}>
            <Undo2 className="mr-1.5 h-4 w-4" /> {t('undo')}
          </Button>
          <Button size="sm" disabled={!dirty || save.isPending || !draft.name.trim()} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            {save.isPending ? t('publishing') : t('publish')}
          </Button>
        </div>
      </div>
    </div>
  );
}
