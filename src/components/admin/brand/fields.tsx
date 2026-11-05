// =====================================================================================
// Campos do editor de marca (Admin > Marca e visual): cor, fonte e imagem com explicação.
// =====================================================================================
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StorageImageUploader from '@/components/admin/StorageImageUploader';
import { isHex } from '@/theme/color';
import { FONT_IDS, FONTS, loadFont, type FontId } from '@/theme/fonts';

/** Rótulo + explicação curta por baixo (padrão de todos os campos desta tela). */
export function FieldLabel({ htmlFor, label, hint }: { htmlFor?: string; label: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <Label htmlFor={htmlFor} className="text-sm font-semibold">{label}</Label>
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Cor em hexadecimal: seletor do navegador + campo de texto (aceita colar #RRGGBB).
 * `auto` = campo opcional: vazio mostra a cor calculada e o botão volta ao automático.
 */
export function ColorField({ id, label, hint, value, onChange, auto, autoLabel, invalidText }: {
  id: string;
  label: string;
  hint?: string;
  value: string | undefined;
  onChange: (v: string) => void;
  /** cor calculada quando o campo está vazio (só nos ajustes finos) */
  auto?: string;
  autoLabel?: string;
  invalidText: string;
}) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const shown = isHex(value) ? (value as string) : auto ?? '#000000';
  const invalid = text !== '' && !isHex(text);
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id} label={label} hint={hint} />
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={shown.length === 7 ? shown.toLowerCase() : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
        />
        <Input
          id={id}
          value={text}
          placeholder={auto ? `${autoLabel ?? ''} ${auto}`.trim() : '#RRGGBB'}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            if (v === '' && auto !== undefined) onChange('');
            else if (isHex(v)) onChange((v.startsWith('#') ? v : `#${v}`).toUpperCase());
          }}
          aria-invalid={invalid}
          className="flex-1 font-mono uppercase"
        />
        {auto !== undefined && value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title={autoLabel}
            aria-label={autoLabel}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-input text-muted-foreground hover:bg-muted"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
      {invalid && <p className="text-xs text-destructive">{invalidText}</p>}
    </div>
  );
}

/** Fonte: lista com o nome de cada uma escrito nela própria. */
export function FontField({ id, label, value, onChange, fontLabel, sample }: {
  id: string;
  label: string;
  value: FontId;
  onChange: (v: FontId) => void;
  fontLabel: (id: FontId) => string;
  sample: string;
}) {
  // Ao abrir a lista, carrega as fontes para cada opção aparecer com o seu desenho.
  const loadAll = (open: boolean) => open && FONT_IDS.forEach(loadFont);
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id} label={label} />
      <Select value={value} onValueChange={(v) => onChange(v as FontId)} onOpenChange={loadAll}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          {FONT_IDS.map((f) => (
            <SelectItem key={f} value={f}>
              <span style={{ fontFamily: FONTS[f].family }}>{fontLabel(f)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="truncate text-2xl font-bold text-foreground" style={{ fontFamily: FONTS[value].family }}>{sample}</p>
    </div>
  );
}

/** Imagem da marca: envio para o storage (pasta branding) + "usar a do padrão" quando difere. */
export function ImageField({ label, hint, value, onChange, defaultValue, aspect, useDefaultLabel }: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  defaultValue: string;
  aspect: string;
  useDefaultLabel: string;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel label={label} hint={hint} />
      <StorageImageUploader
        value={value}
        onChange={onChange}
        bucket="product-images"
        folder="branding"
        label=""
        previewAspect={aspect}
        accept="image/png,image/webp,image/jpeg,image/svg+xml"
        fit="contain"
        hint="PNG, WEBP, JPG, SVG"
      />
      {defaultValue && value !== defaultValue && (
        <button type="button" onClick={() => onChange(defaultValue)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-orange-text hover:underline">
          <RotateCcw className="h-3.5 w-3.5" /> {useDefaultLabel}
        </button>
      )}
    </div>
  );
}
