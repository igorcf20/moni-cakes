import { Languages } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOCALES, LOCALE_NAMES, useLocale, useMessages, type Locale } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { cn } from '@/lib/utils';

const SHORT: Record<Locale, string> = { 'pt-BR': 'PT-BR', 'pt-PT': 'PT-PT', en: 'EN', es: 'ES' };

/** Seletor de idioma do painel Admin; compacto mostra só o código (PT-BR, EN...). Na loja o idioma fica no CountryPicker. */
export function LanguagePicker({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { t, locale } = useMessages(layoutMessages);
  const setLocale = useLocale((s) => s.setLocale);
  return (
    <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
      <SelectTrigger className={cn('h-9 w-auto gap-2 rounded-xl border-border bg-white px-3 text-sm', className)} aria-label={t('language')}>
        <Languages className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
        {compact ? <b className="whitespace-nowrap text-xs font-semibold tracking-wide">{SHORT[locale]}</b> : <SelectValue />}
      </SelectTrigger>
      <SelectContent align="end">{LOCALES.map((l) => <SelectItem key={l} value={l} lang={l}>{LOCALE_NAMES[l]}</SelectItem>)}</SelectContent>
    </Select>
  );
}
