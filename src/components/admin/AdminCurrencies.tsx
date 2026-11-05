// =====================================================================================
// Admin > Configurações > Moedas e câmbio: moeda base, margem de câmbio, taxa de cada moeda (fixar à mão ou deixar
// para o BCE), atualização automática diária pelo BCE (recurso auto_exchange_rates), botão Atualizar agora com os
// saltos grandes à espera de decisão e o histórico das taxas. Regras em src/lib/exchangeRates.ts; o servidor busca
// as taxas na função update-exchange-rates e grava o histórico por trigger.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Landmark, Loader2, Plus, RefreshCw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag } from "@/components/Flag";
import AdminHelp from "./AdminHelp";
import { useMessages, type Locale } from "@/i18n";
import { adminCurrenciesMessages, type AdminCurrenciesKey } from "@/i18n/adminCurrencies";
import { useCountries, countryName } from "@/lib/countries";
import { useFeature, useFeatures, useSaveFeatures } from "@/hooks/useFeatures";
import { useCurrencySettings, useRateHistory, useRefreshRates, useSaveCurrencySettings, type RefreshResult } from "@/hooks/useExchangeRates";
import { convertAmount, ECB_CURRENCIES, normalizeCurrencySettings, wantedCurrencies, type CurrencySettings } from "@/lib/exchangeRates";
import { cn } from "@/lib/utils";

type T = (key: AdminCurrenciesKey, vars?: Record<string, string | number>) => string;

const ALL_CODES = ["EUR", ...ECB_CURRENCIES].sort();
const parseRate = (v: string) => { const n = Number(v.replace(",", ".").trim()); return Number.isFinite(n) && n > 0 ? n : 0; };
const parsePct = (v: string, max: number) => { const n = Number(v.replace(",", ".").trim()); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };

function currencyName(code: string, locale: string) {
  try { return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code; } catch { return code; }
}

export default function AdminCurrencies() {
  const { t, locale } = useMessages(adminCurrenciesMessages);
  const { data, isLoading, isError } = useCurrencySettings();
  const { data: countries = [] } = useCountries();
  const save = useSaveCurrencySettings();
  const [form, setForm] = useState<CurrencySettings | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [markup, setMarkup] = useState("0");
  const [maxChange, setMaxChange] = useState("20");
  const [adding, setAdding] = useState("");

  // Recarrega o formulário quando o valor salvo muda (salvar, Atualizar agora).
  useEffect(() => {
    if (!data) return;
    setForm(data.settings);
    setDrafts(Object.fromEntries(Object.entries(data.settings.rates).map(([k, v]) => [k, String(v)])));
    setMarkup(String(data.settings.markup));
    setMaxChange(String(data.settings.maxChangePercent));
  }, [data]);

  const next = useMemo<CurrencySettings | null>(() => {
    if (!form) return null;
    const rates: Record<string, number> = {};
    for (const [k, v] of Object.entries(drafts)) { const n = parseRate(v); if (n > 0 && k !== form.default) rates[k] = n; }
    return normalizeCurrencySettings({ ...form, rates, markup: parsePct(markup, 50), maxChangePercent: parsePct(maxChange, 100) || 20 });
  }, [form, drafts, markup, maxChange]);

  if (isLoading || (!form && !isError)) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (isError || !data || !form || !next) return <p className="rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground">{t("load_error")}</p>;

  const countryCurrencies = countries.map((c) => c.currency);
  const wanted = wantedCurrencies(next, countryCurrencies);
  const dirty = JSON.stringify(next) !== JSON.stringify(data.settings);
  const addable = ALL_CODES.filter((c) => c !== next.default && !wanted.includes(c));

  const doSave = () => save.mutate({ next, raw: data.raw }, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });
  const setManual = (code: string, on: boolean) => setForm({ ...form, manual: on ? [...form.manual, code] : form.manual.filter((c) => c !== code) });
  const remove = (code: string) => {
    setForm({ ...form, available: form.available.filter((c) => c !== code), manual: form.manual.filter((c) => c !== code) });
    setDrafts((d) => { const copy = { ...d }; delete copy[code]; return copy; });
  };

  return (
    <div className="space-y-6">
      <AdminHelp id="currencies" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <AutoUpdate t={t} locale={locale} settings={data.settings} />

      <section className="space-y-4 rounded-[18px] border bg-card p-5">
        <h2 className="text-base font-semibold">{t("base_title")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid content-start gap-1.5">
            <label htmlFor="cur-base" className="text-sm font-semibold">{t("base")}</label>
            <Select value={form.default} onValueChange={(v) => setForm({ ...form, default: v })}>
              <SelectTrigger id="cur-base"><SelectValue /></SelectTrigger>
              <SelectContent>{[...new Set([form.default, ...ALL_CODES])].map((c) => <SelectItem key={c} value={c}>{c} · {currencyName(c, locale)}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("base_hint")}</p>
          </div>
          <div className="grid content-start gap-1.5">
            <label htmlFor="cur-markup" className="text-sm font-semibold">{t("markup")}</label>
            <Input id="cur-markup" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("markup_hint")}</p>
          </div>
          <div className="grid content-start gap-1.5">
            <label htmlFor="cur-max" className="text-sm font-semibold">{t("max_change")}</label>
            <Input id="cur-max" inputMode="decimal" value={maxChange} onChange={(e) => setMaxChange(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("max_change_hint")}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-[18px] border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{t("rates_title")}</h2>
            <p className="text-sm text-muted-foreground">{t("rates_hint")}</p>
          </div>
          {addable.length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Select value={adding} onValueChange={setAdding}>
                <SelectTrigger className="min-w-0 basis-full sm:w-[220px] sm:basis-auto" aria-label={t("add_pick")}><SelectValue placeholder={t("add_pick")} /></SelectTrigger>
                <SelectContent>{addable.map((c) => <SelectItem key={c} value={c}>{c} · {currencyName(c, locale)}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" variant="outline" disabled={!adding} onClick={() => { setForm({ ...form, available: [...form.available, adding] }); setAdding(""); }}>
                <Plus className="mr-1.5 h-4 w-4" />{t("add")}
              </Button>
            </div>
          )}
        </div>
        {wanted.length === 0
          ? <p className="text-sm text-muted-foreground">{t("empty")}</p>
          : (
            <ul className="divide-y rounded-[14px] border">
              {wanted.map((code) => {
                const users = countries.filter((c) => c.currency === code);
                const rate = next.rates[code];
                const converted = convertAmount(next, 100, code);
                const fmt = (v: number, c: string) => new Intl.NumberFormat(locale, { style: "currency", currency: c }).format(v);
                const manual = form.manual.includes(code);
                return (
                  <li key={code} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_230px] md:items-start">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold">{code} <span className="font-normal text-muted-foreground">· {currencyName(code, locale)}</span></p>
                      {users.length
                        ? <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{users.map((c) => <Flag key={c.code} code={c.code} className="w-4" />)}{t("used_by", { countries: users.map((c) => countryName(c.code, locale as Locale)).join(", ") })}</p>
                        : <p className="text-xs text-muted-foreground">{t("not_used")}</p>}
                      {!ECB_CURRENCIES.includes(code) && code !== "EUR" && <p className="text-xs text-muted-foreground">{t("not_ecb")}</p>}
                    </div>
                    <div className="grid gap-1">
                      <label className="flex items-center gap-2 text-sm">
                        <span className="shrink-0 text-muted-foreground">{t("rate_label", { base: next.default })}</span>
                        <Input inputMode="decimal" aria-label={`${t("rate_label", { base: next.default })} ${code}`} value={drafts[code] ?? ""} onChange={(e) => setDrafts({ ...drafts, [code]: e.target.value })} className="h-9" />
                        <span className="shrink-0 font-medium">{code}</span>
                      </label>
                      {rate && converted != null
                        ? <p className="text-xs text-muted-foreground">{t("example", { base: next.default, value: fmt(converted, code) })}</p>
                        : <p className="flex items-start gap-1 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t("no_rate", { code, base: next.default })}</p>}
                    </div>
                    <div className="flex items-center gap-3 md:justify-end">
                      <label className="flex items-center gap-2 text-sm" title={t("manual_hint")}>
                        <Switch checked={manual} onCheckedChange={(v) => setManual(code, v)} />{t("manual")}
                      </label>
                      {!users.length && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => remove(code)} aria-label={`${t("remove")} ${code}`}>
                          <X className="mr-1 h-4 w-4" />{t("remove")}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        <div className="flex justify-end">
          <Button onClick={doSave} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
          </Button>
        </div>
      </section>

      <History t={t} locale={locale} />
    </div>
  );
}

/* ---------- Atualização automática ---------- */

function AutoUpdate({ t, locale, settings }: { t: T; locale: string; settings: CurrencySettings }) {
  const on = useFeature("auto_exchange_rates");
  const { data: flags } = useFeatures();
  const saveFlags = useSaveFeatures();
  const refresh = useRefreshRates();
  const [result, setResult] = useState<RefreshResult | null>(null);
  const df = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const dd = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const nf = new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 });

  const toggle = (v: boolean) => saveFlags.mutate({ ...(flags ?? {}), auto_exchange_rates: v }, {
    onSuccess: () => toast.success(t(v ? "auto_on" : "auto_off")),
  });
  const run = (force: boolean) => refresh.mutate(force, {
    onSuccess: (r) => {
      setResult(r);
      if (r.status === "ok") toast.success(t("refresh_ok"));
      else if (r.status === "partial") toast.message(t("refresh_partial"));
      else toast.error(t("refresh_error"));
    },
  });

  // Saltos à espera: os da última execução (cron ou botão), até o Admin decidir.
  const skipped = result?.skipped ?? settings.last_skipped;
  const jumps = skipped.filter((s) => s.reason === "jump");
  const missing = skipped.filter((s) => s.reason === "missing");
  const status = settings.last_status;

  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-5">
      <div className="flex items-center gap-2">
        <Landmark className="h-5 w-5 text-brand-orange-text" aria-hidden="true" />
        <h2 className="text-base font-semibold">{t("auto_title")}</h2>
      </div>
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{t("auto_switch")}</span>
          <span className="block text-xs text-muted-foreground">{t("auto_switch_hint")}</span>
        </span>
        <Switch checked={on} onCheckedChange={toggle} disabled={saveFlags.isPending} className="mt-0.5" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-muted/40 p-3">
        <div className="space-y-0.5 text-sm">
          {settings.last_run
            ? <p>{t("last_run", { date: df.format(new Date(settings.last_run)) })}</p>
            : <p className="text-muted-foreground">{t("last_never")}</p>}
          {settings.rate_date && <p className="text-xs text-muted-foreground">{t("rate_date", { date: dd.format(new Date(`${settings.rate_date}T00:00:00Z`)) })}</p>}
          {status && (
            <p className={cn("inline-flex items-center gap-1 text-xs font-medium", status === "ok" ? "text-emerald-700" : status === "error" ? "text-red-700" : "text-amber-800")}>
              {status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
              {t(`st_${status}` as AdminCurrenciesKey)}
            </p>
          )}
        </div>
        <Button type="button" variant="outline" onClick={() => run(false)} disabled={refresh.isPending}>
          <RefreshCw className={cn("mr-1.5 h-4 w-4", refresh.isPending && "animate-spin")} />{t("refresh")}
        </Button>
      </div>
      {jumps.length > 0 && (
        <div className="space-y-2 rounded-[14px] border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">{t("jumps_title")}</p>
          <ul className="space-y-1 text-sm text-amber-900">
            {jumps.map((j) => (
              <li key={j.code}>{t("jump_line", { code: j.code, from: settings.rates[j.code] != null ? nf.format(settings.rates[j.code]) : "-", to: j.rate != null ? nf.format(j.rate) : "-", pct: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(j.changePercent ?? 0) })}</li>
            ))}
          </ul>
          <Button type="button" size="sm" onClick={() => run(true)} disabled={refresh.isPending}>{t("apply_anyway")}</Button>
        </div>
      )}
      {missing.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {missing.map((m) => <li key={m.code}>{t("skip_missing", { code: m.code })}</li>)}
        </ul>
      )}
    </section>
  );
}

/* ---------- Histórico ---------- */

function History({ t, locale }: { t: T; locale: string }) {
  const { data: rows = [], isLoading } = useRateHistory();
  const df = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  const dd = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: "UTC" });
  const nf = new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 });
  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">{t("history_title")}</h2>
        <p className="text-sm text-muted-foreground">{t("history_hint")}</p>
      </div>
      {isLoading
        ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
        : rows.length === 0
          ? <p className="text-sm text-muted-foreground">{t("history_empty")}</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t("h_date")}</th>
                    <th className="py-2 pr-3 font-medium">{t("h_currency")}</th>
                    <th className="py-2 pr-3 font-medium">{t("h_rate")}</th>
                    <th className="py-2 font-medium">{t("h_source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">{df.format(new Date(r.created_at))}</td>
                      <td className="py-2 pr-3 font-medium">1 {r.base} = {r.currency}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {r.previous_rate != null && <span className="text-muted-foreground">{nf.format(r.previous_rate)} → </span>}
                        <span className="font-semibold">{nf.format(r.rate)}</span>
                      </td>
                      <td className="py-2">
                        {t(r.source === "ecb" ? "src_ecb" : "src_manual")}
                        {r.rate_date && <span className="text-xs text-muted-foreground"> · {t("h_ecb_date", { date: dd.format(new Date(`${r.rate_date}T00:00:00Z`)) })}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </section>
  );
}
