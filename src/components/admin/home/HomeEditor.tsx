// =====================================================================================
// Admin > Conteúdo da página inicial: textos (por idioma), fotos e seções visíveis da página inicial.
//
//   Rascunho     o Admin edita uma cópia do publicado; nada muda no site até Publicar.
//   Publicar     upsert de store_settings.home_page (formato em src/lib/homePage.ts) e invalida
//                HOME_PAGE_QUERY_KEY (src/hooks/useHomePage.ts), que a página inicial lê.
//   Campos       vazios = texto padrão do idioma (src/i18n/layout.ts), mostrado em cinza.
// Textos do painel em src/i18n/adminHome.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, Loader2, RotateCcw, Undo2, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import AdminHelp from '@/components/admin/AdminHelp';
import StorageImageUploader from '@/components/admin/StorageImageUploader';
import { HOME_PAGE_QUERY_KEY, useHomePageQuery } from '@/hooks/useHomePage';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { LOCALES, LOCALE_NAMES, useMessages, type Locale } from '@/i18n';
import { adminHomeMessages, type AdminHomeKey } from '@/i18n/adminHome';
import { layoutMessages } from '@/i18n/layout';
import { EMPTY_HOME, HOME_SECTIONS, toSavedHome, type HomeImageId, type HomePage, type HomeTextKey } from '@/lib/homePage';
import { cn } from '@/lib/utils';
import { useInlineConfirm } from '@/components/admin/shell/useInlineConfirm';

const clone = (p: HomePage): HomePage => JSON.parse(JSON.stringify(p));

/** Rótulo do campo pelo papel da chave (o mesmo para todas as seções). */
function fieldLabel(key: HomeTextKey, t: (k: AdminHomeKey, v?: Record<string, string | number>) => string): string {
  if (key === 'hero_title_a') return t('f_title_a');
  if (key === 'hero_title_3d') return t('f_title_accent');
  if (key === 'hero_title_b') return t('f_title_b');
  if (key === 'hero_side') return t('f_side');
  if (key === 'story_card_eyebrow') return t('f_card_eyebrow');
  if (key === 'story_card_title') return t('f_card_title');
  let m = /^hero_b(\d)$/.exec(key);
  if (m) return t('f_benefit', { n: m[1] });
  m = /^trust_.+$/.exec(key);
  if (m) return t('f_item', { n: ['trust_ship', 'trust_secure', 'trust_pay', 'trust_pla'].indexOf(key) + 1 });
  m = /^how_(\d)(_sub)?$/.exec(key);
  if (m) return t(m[2] ? 'f_step_text' : 'f_step', { n: m[1] });
  if (key.endsWith('_eyebrow')) return t('f_eyebrow');
  if (key.endsWith('_cta2')) return t('f_cta2');
  if (key.endsWith('_cta')) return t('f_cta');
  if (key.endsWith('_sub')) return t('f_sub');
  if (key.endsWith('_lead') || key.endsWith('_text')) return t('f_text');
  return t('f_title');
}

export default function HomeEditor() {
  const { t, locale: uiLocale } = useMessages(adminHomeMessages);
  const { ask, confirmSlot } = useInlineConfirm();
  const queryClient = useQueryClient();
  const menu = useCatalogMenu();
  const { data: published, isLoading } = useHomePageQuery();
  const [draft, setDraft] = useState<HomePage | null>(null);
  const [lang, setLang] = useState<Locale>(uiLocale);

  useEffect(() => {
    if (published && !draft) setDraft(clone(published));
  }, [published, draft]);

  const dirty = useMemo(
    () => !!draft && !!published && JSON.stringify(toSavedHome(draft)) !== JSON.stringify(published),
    [draft, published],
  );

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('store_settings').upsert(
        { key: 'home_page', value: toSavedHome(draft as HomePage) as unknown as Json, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HOME_PAGE_QUERY_KEY });
      setDraft(null);
      toast.success(t('published'));
    },
    onError: () => toast.error(t('publish_error')),
  });

  if (isLoading || !draft) return <Skeleton className="h-[600px] w-full rounded-xl" />;

  const defaults = layoutMessages[lang];
  const texts = draft.texts[lang] ?? {};
  const setText = (key: HomeTextKey, value: string) =>
    setDraft({ ...draft, texts: { ...draft.texts, [lang]: { ...texts, [key]: value } } });
  const setVisible = (id: string, on: boolean) =>
    setDraft({ ...draft, hidden: on ? draft.hidden.filter((h) => h !== id) : [...draft.hidden, id] });

  return (
    <div className="space-y-6 pb-24">
      {confirmSlot}
      <AdminHelp id="home" title={t('help_title')} steps={[t('help_1'), t('help_2'), t('help_3'), t('help_4')]} />

      <div className="space-y-2">
        <Label>{t('language')}</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('language')}>
          {LOCALES.map((l) => (
            <button
              key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
              className={cn('min-h-[40px] rounded-xl border px-4 text-sm font-medium transition-colors', lang === l ? 'border-primary bg-accent text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}
            >
              {LOCALE_NAMES[l]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('language_hint')}</p>
      </div>

      <Accordion type="multiple" defaultValue={['hero']} className="space-y-3">
        {HOME_SECTIONS.map((section) => {
          const visible = !draft.hidden.includes(section.id);
          return (
            <AccordionItem key={section.id} value={section.id} className="rounded-2xl border border-border bg-card px-4">
              <div className="flex items-center gap-3">
                <AccordionTrigger className="flex-1 py-4 text-left hover:no-underline">
                  <span className="flex flex-col gap-0.5">
                    <span className={cn('font-semibold', !visible && 'text-muted-foreground')}>{t(`sec_${section.id}` as AdminHomeKey)}</span>
                    <span className="text-xs font-normal text-muted-foreground">{visible ? t(`sec_${section.id}_hint` as AdminHomeKey) : t('hidden')}</span>
                  </span>
                </AccordionTrigger>
                {section.fixed ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{t('always')}</span>
                ) : (
                  <label className="flex shrink-0 items-center gap-2 text-sm">
                    <span className="hidden sm:inline">{t('show')}</span>
                    <Switch checked={visible} onCheckedChange={(v) => setVisible(section.id, v)} aria-label={`${t('show')}: ${t(`sec_${section.id}` as AdminHomeKey)}`} />
                  </label>
                )}
              </div>
              <AccordionContent className="space-y-4 pb-5">
                {section.id === 'spotlight' && (
                  <div className="space-y-1.5">
                    <Label>{t('spotlight_category')}</Label>
                    <Select value={draft.spotlight} onValueChange={(v) => setDraft({ ...draft, spotlight: v })}>
                      <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {menu.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
                        {!menu.some((c) => c.slug === draft.spotlight) && <SelectItem value={draft.spotlight}>{draft.spotlight}</SelectItem>}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t('spotlight_hint')}</p>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {section.keys.map((key) => {
                    const id = `home-${lang}-${key}`;
                    const long = section.long?.includes(key);
                    const common = {
                      id,
                      value: texts[key] ?? '',
                      placeholder: defaults[key],
                      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(key, e.target.value),
                    };
                    return (
                      <div key={key} className={cn('space-y-1.5', long && 'md:col-span-2')}>
                        <Label htmlFor={id}>{fieldLabel(key, t)}</Label>
                        {long ? <Textarea {...common} rows={3} /> : <Input {...common} />}
                      </div>
                    );
                  })}
                </div>
                {[section.image, section.image2].filter((img): img is HomeImageId => !!img).map((img, i) => (
                  <div key={img} className="max-w-md space-y-1.5">
                    <Label>{section.image2 ? t('photo_n', { n: i + 1 }) : t('photo')}</Label>
                    <StorageImageUploader
                      value={draft.images[img] ?? ''}
                      onChange={(url) => setDraft({ ...draft, images: { ...draft.images, [img]: url } })}
                      bucket="product-images" folder="home" label="" previewAspect="aspect-[4/3]" hint="JPG, PNG, WEBP"
                    />
                    <p className="text-xs text-muted-foreground">{t('photo_hint')}</p>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Barra de ações (fixa no fundo), igual à de Marca e visual */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="container mx-auto flex flex-wrap items-center gap-2 px-3 py-3 md:px-4">
          <p className={cn('mr-auto text-sm', dirty ? 'font-semibold text-brand-orange-text' : 'text-muted-foreground')}>
            {dirty ? t('unsaved') : t('idle')}
          </p>
          <Button asChild variant="ghost" size="sm">
            <Link to="/" target="_blank" rel="noopener"><ExternalLink className="mr-1.5 h-4 w-4" />{t('view_home')}</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={async () => { if (await ask(t('reset_confirm'), { tone: 'warning' })) setDraft(clone(EMPTY_HOME)); }}>
            <RotateCcw className="mr-1.5 h-4 w-4" />{t('reset_default')}
          </Button>
          <Button variant="outline" size="sm" disabled={!dirty || save.isPending} onClick={() => published && setDraft(clone(published))}>
            <Undo2 className="mr-1.5 h-4 w-4" />{t('undo')}
          </Button>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            {save.isPending ? t('publishing') : t('publish')}
          </Button>
        </div>
      </div>
    </div>
  );
}
