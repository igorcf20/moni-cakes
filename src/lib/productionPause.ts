// Pausa de produção (store_settings): datas mostradas no idioma do cliente. Sem locale, usa o idioma atual do site;
// as notas internas da encomenda (pauseNoteForOrder) ficam em pt-BR, o idioma do Admin.
import { DEFAULT_LOCALE, interpolate, useLocale, type Locale } from "@/i18n";
import { paymentsMessages } from "@/i18n/payments";

export interface ProductionPauseConfig {
  enabled?: boolean;
  start_date?: string; // YYYY-MM-DD
  end_date?: string;   // YYYY-MM-DD
  reason?: string;
  title?: string;
  message?: string;
  checkbox_text?: string;
  return_date?: string; // YYYY-MM-DD (optional override; defaults to day after end_date)
  accent?: string;      // 'primary' | 'amber' | 'red'
}

const parseYMD = (s?: string): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

export const isProductionPauseActive = (cfg?: ProductionPauseConfig | null): boolean => {
  if (!cfg || !cfg.enabled) return false;
  const start = parseYMD(cfg.start_date);
  const end = parseYMD(cfg.end_date);
  if (!start || !end) return false;
  const now = new Date();
  const startMs = start.getTime();
  const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime();
  return now.getTime() >= startMs && now.getTime() <= endMs;
};

export const getReturnDate = (cfg?: ProductionPauseConfig | null): Date | null => {
  if (!cfg) return null;
  const override = parseYMD(cfg.return_date);
  if (override) return override;
  const end = parseYMD(cfg.end_date);
  if (!end) return null;
  return new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
};

const currentLocale = (): Locale => useLocale.getState().locale;

const fmt = (d: Date | null, locale: Locale = currentLocale()): string => {
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
};

/** "1 de outubro de 2026 a 15 de outubro de 2026" no idioma pedido (padrão: idioma atual do site). */
export const formatPauseRange = (cfg?: ProductionPauseConfig | null, locale: Locale = currentLocale()): string => {
  const s = parseYMD(cfg?.start_date);
  const e = parseYMD(cfg?.end_date);
  if (!s || !e) return "";
  const pattern = (paymentsMessages[locale] ?? paymentsMessages[DEFAULT_LOCALE]).pauseRange;
  return interpolate(pattern, { start: fmt(s, locale), end: fmt(e, locale) });
};

export const formatReturnDate = (cfg?: ProductionPauseConfig | null, locale: Locale = currentLocale()): string =>
  fmt(getReturnDate(cfg), locale);

/** Troca {data_inicio}, {data_fim}, {data_regresso} e {motivo} nos textos do Admin, com as datas no idioma pedido. */
export const resolveText = (text: string | undefined, cfg?: ProductionPauseConfig | null, locale: Locale = currentLocale()): string => {
  if (!text) return "";
  return text
    .replace(/\{data_inicio\}/g, fmt(parseYMD(cfg?.start_date), locale))
    .replace(/\{data_fim\}/g, fmt(parseYMD(cfg?.end_date), locale))
    .replace(/\{data_regresso\}/g, formatReturnDate(cfg, locale))
    .replace(/\{motivo\}/g, cfg?.reason || "");
};

export const pauseSessionKey = (cfg?: ProductionPauseConfig | null): string =>
  `production_pause_seen_${cfg?.start_date || ""}_${cfg?.end_date || ""}`;

export const pauseNoteForOrder = (cfg?: ProductionPauseConfig | null): string => {
  if (!isProductionPauseActive(cfg)) return "";
  // Nota interna (Admin, pt-BR).
  return `Cliente aceitou a pausa de produção: ${formatPauseRange(cfg, DEFAULT_LOCALE)}. Retorno previsto: ${formatReturnDate(cfg, DEFAULT_LOCALE)}.`;
};