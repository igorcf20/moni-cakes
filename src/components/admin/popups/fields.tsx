// =====================================================================================
// Campos do construtor de pop-ups (Admin > Pop-ups): cada um com rótulo, dica (HelpTip) e, quando ajuda, uma linha
// de explicação. Textos em src/i18n/adminPopups.ts.
// =====================================================================================
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ImagePlus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import HelpTip from "@/components/admin/HelpTip";
import { LOCALE_NAMES, useMessages } from "@/i18n";
import { adminPopupsMessages } from "@/i18n/adminPopups";
import { uploadPopupImage } from "@/hooks/useLeadPopups";
import { isHex, missingLocales, POPUP_LOCALES, type L10n, type PopupLocale } from "@/lib/leadPopups";
import { cn } from "@/lib/utils";

export const usePopupT = () => useMessages(adminPopupsMessages);
export type PT = ReturnType<typeof usePopupT>["t"];

/** Rótulo com dica ao lado e explicação curta por baixo. */
export function Field({ label, tip, hint, htmlFor, children, className, inline }: {
  label: string; tip?: string; hint?: string; htmlFor?: string; children: ReactNode; className?: string; inline?: boolean;
}) {
  return (
    <div className={cn(inline ? "flex items-center justify-between gap-3" : "space-y-1.5", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-0.5">
          <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-foreground">{label}</Label>
          {tip && <HelpTip text={tip} label={label} className="h-6 w-6" />}
        </div>
        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Interruptor numa linha, com explicação. */
export function SwitchRow({ label, tip, hint, checked, onChange, disabled }: {
  label: string; tip?: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-background/60 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-0.5 text-[13px] font-semibold">{label}{tip && <HelpTip text={tip} label={label} className="h-6 w-6" />}</div>
        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} className="mt-0.5 shrink-0" />
    </div>
  );
}

/** Cor: seletor + #RRGGBB. Com allowEmpty, vazio = cor do tema da loja. */
export function ColorPick({ label, tip, value, onChange, allowEmpty = true, themeHint }: {
  label: string; tip?: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean; themeHint?: string;
}) {
  const { t } = usePopupT();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const invalid = text !== "" && !isHex(text.startsWith("#") ? text : `#${text}`);
  return (
    <Field label={label} tip={tip}>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={label}
          value={isHex(value) ? value.toLowerCase() : "#ffffff"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-0.5"
        />
        <Input
          value={text}
          placeholder={allowEmpty ? themeHint ?? t("color_theme") : "#RRGGBB"}
          aria-label={`${label} (#RRGGBB)`}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            const h = v.startsWith("#") ? v : `#${v}`;
            if (v === "" && allowEmpty) onChange("");
            else if (isHex(h)) onChange(h.toUpperCase());
          }}
          className="h-9 min-w-0 flex-1 font-mono text-xs uppercase placeholder:font-sans placeholder:normal-case"
        />
        {allowEmpty && value && (
          <button type="button" onClick={() => onChange("")} title={t("color_reset")} aria-label={t("color_reset")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-input text-muted-foreground hover:bg-muted">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </Field>
  );
}

/** Número com barra deslizante. */
export function NumberSlider({ label, tip, value, onChange, min, max, step = 1, suffix }: {
  label: string; tip?: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Field label={label} tip={tip}>
      <div className="flex items-center gap-2.5">
        <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} aria-label={label} className="flex-1" />
        <div className="relative w-[84px] shrink-0">
          <Input
            inputMode="decimal"
            value={text}
            aria-label={label}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value.replace(",", "."));
              if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
            }}
            onBlur={() => setText(String(value))}
            className={cn("h-9 text-right text-sm tabular-nums", suffix && "pr-8")}
          />
          {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
        </div>
      </div>
    </Field>
  );
}

/** Botões lado a lado para escolher uma opção. */
export function Segmented<T extends string>({ value, onChange, options, label, size = "md", full }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: LucideIcon; disabled?: boolean; title?: string }[];
  label: string; size?: "sm" | "md"; full?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-xl border bg-muted/50 p-1", full && "flex w-full")}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            title={o.title ?? o.label}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
              size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
              full && "flex-1",
              on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Texto por idioma: escreve-se no idioma escolhido no topo do construtor; mostra os que faltam. */
export function L10nField({ label, tip, value, onChange, locale, multiline, max = 600, inputRef }: {
  label: string; tip?: string; value: L10n; onChange: (v: L10n) => void; locale: PopupLocale; multiline?: boolean; max?: number;
  inputRef?: React.Ref<HTMLTextAreaElement | HTMLInputElement>;
}) {
  const { t } = usePopupT();
  const v = value[locale] ?? "";
  const missing = missingLocales(value);
  const set = (text: string) => onChange({ ...value, [locale]: text });
  const fillOthers = () => {
    const src = v || value["pt-BR"] || POPUP_LOCALES.map((l) => value[l]).find((x) => x?.trim()) || "";
    const next = { ...value };
    for (const l of POPUP_LOCALES) if (!next[l]?.trim()) next[l] = src;
    onChange(next);
  };
  return (
    <Field label={`${label} (${LOCALE_NAMES[locale]})`} tip={tip}>
      {multiline ? (
        <Textarea ref={inputRef as React.Ref<HTMLTextAreaElement>} value={v} maxLength={max} rows={3} onChange={(e) => set(e.target.value)} className="min-h-[76px] text-sm" />
      ) : (
        <Input ref={inputRef as React.Ref<HTMLInputElement>} value={v} maxLength={max} onChange={(e) => set(e.target.value)} className="h-9 text-sm" />
      )}
      {missing.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span>{t("l10n_missing", { list: missing.map((l) => LOCALE_NAMES[l]).join(", ") })}</span>
          <button type="button" onClick={fillOthers} className="font-semibold text-brand-orange-text underline-offset-2 hover:underline">{t("l10n_fill")}</button>
        </p>
      )}
    </Field>
  );
}

/** Imagem: enviar do aparelho (ou arrastar para cá), colar um endereço, ver e tirar. */
export function ImagePick({ label, tip, hint, value, onChange, onLoaded }: {
  label: string; tip?: string; hint?: string; value: string; onChange: (v: string) => void;
  /** tamanho natural da imagem, para "ajustar à imagem" */
  onLoaded?: (w: number, h: number) => void;
}) {
  const { t } = usePopupT();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const send = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error(t("img_type")); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error(t("img_size")); return; }
    setBusy(true);
    try {
      onChange(await uploadPopupImage(file));
    } catch {
      toast.error(t("img_error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Field label={label} tip={tip} hint={hint}>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void send(e.dataTransfer.files?.[0]); }}
        className={cn("flex items-center gap-3 rounded-xl border border-dashed p-2.5 transition-colors duration-150", over ? "border-primary bg-accent" : "bg-background/60")}
      >
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" onLoad={(e) => onLoaded?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />
            : <ImagePlus className="h-5 w-5 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => ref.current?.click()} disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />}
              {busy ? t("img_sending") : value ? t("img_change") : t("img_upload")}
            </button>
            {value && (
              <button type="button" onClick={() => onChange("")} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{t("img_remove")}
              </button>
            )}
          </div>
          <Input value={value} placeholder={t("img_url_ph")} aria-label={t("img_url")} onChange={(e) => onChange(e.target.value.trim())} className="h-8 text-xs" />
        </div>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { void send(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </Field>
  );
}

/** Bloco de opções com título (dentro dos painéis). */
export function Group({ title, tip, children, icon: Icon }: { title: string; tip?: string; children: ReactNode; icon?: LucideIcon }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-3.5">
      <h4 className="flex items-center gap-1.5 text-sm font-bold">
        {Icon && <Icon className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />}
        {title}
        {tip && <HelpTip text={tip} label={title} className="h-6 w-6" />}
      </h4>
      {children}
    </section>
  );
}
