// =============================================================================================
// Taxas de câmbio do Banco Central Europeu (BCE) para store_settings.currency_settings.
//   - cron diário exchange-rates-daily (cabeçalho x-cron-secret = CRON_SECRET): só com o recurso auto_exchange_rates
//     ligado (Admin > Recursos da loja); desligado responde { status: "skipped" } sem buscar nada;
//   - Admin > Moedas e câmbio, botão Atualizar agora (sessão de admin); { force: true } aplica também os saltos
//     maiores que o limite, depois de o Admin ver o aviso.
// Regras puras em _shared/exchangeRates.ts (cópia de src/lib/exchangeRates.ts). Moedas fixadas à mão ficam como estão.
// As taxas alteradas entram no histórico (exchange_rate_history) pelo trigger da tabela store_settings.
// Respostas com códigos estáveis (o site traduz): ok, partial, skipped, source_unavailable, forbidden.
// =============================================================================================
import { requireAdmin, supabaseAdmin } from "../_shared/admin.ts";
import {
  applyEcbRates, ECB_DAILY_URL, normalizeCurrencySettings, parseEcbXml, wantedCurrencies,
} from "../_shared/exchangeRates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Endereço do arquivo diário do BCE (ECB_RATES_URL só para testes locais). */
const SOURCE_URL = Deno.env.get("ECB_RATES_URL") || ECB_DAILY_URL;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Cron (segredo no cabeçalho, ou Authorization: Bearer como antes) ou sessão de admin.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && (req.headers.get("x-cron-secret") === cronSecret || auth === `Bearer ${cronSecret}`);
  if (!isCron) {
    const guard = await requireAdmin(req);
    if ("error" in guard) return json({ error: "forbidden" }, 403);
  }
  const body = await req.json().catch(() => ({}));
  const force = !isCron && body?.force === true;

  const sb = supabaseAdmin();
  const { data: rows, error } = await sb.from("store_settings").select("key,value").in("key", ["currency_settings", "features"]);
  if (error) return json({ error: "settings_unavailable" }, 500);
  // deno-lint-ignore no-explicit-any
  const get = (k: string): any => (rows ?? []).find((r: { key: string }) => r.key === k)?.value ?? null;
  const current = normalizeCurrencySettings(get("currency_settings"));
  if (isCron && get("features")?.auto_exchange_rates !== true) return json({ status: "skipped" });

  const { data: countries } = await sb.from("countries").select("currency").eq("is_active", true);
  const wanted = wantedCurrencies(current, (countries ?? []).map((c: { currency: string }) => c.currency));

  // Grava só o estado (as taxas ficam) quando o BCE não responde.
  const failed = async () => {
    const value = { ...get("currency_settings"), ...current, last_run: new Date().toISOString(), last_status: "error", rates_source: current.rates_source };
    await sb.from("store_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", "currency_settings");
    return json({ status: "error", error: "source_unavailable" }, 502);
  };

  let xml = "";
  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/xml" } });
    if (!res.ok) return await failed();
    xml = await res.text();
  } catch {
    return await failed();
  }
  const ecb = parseEcbXml(xml);
  if (!ecb) return await failed();

  const result = applyEcbRates(current, ecb, wanted, { force });
  // Mantém os campos antigos que o resto do site lê (ex.: available) e acrescenta os novos.
  const value = { ...get("currency_settings"), ...result.settings };
  const { error: upErr } = await sb.from("store_settings")
    .upsert({ key: "currency_settings", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (upErr) return json({ error: "save_failed" }, 500);

  return json({
    status: result.settings.last_status,
    rate_date: ecb.date,
    changed: result.changed,
    skipped: result.skipped,
  });
});
