import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAdmin, supabaseAdmin } from "../_shared/admin.ts";
import { priceItems } from "../_shared/pricing.ts";
import { loadCountry } from "../_shared/countries.ts";
import { quoteShipping } from "../_shared/shipping/quote.ts";

// Opções de frete para um endereço e um carrinho (checkout e calculadora de frete).
// O preço vem só do servidor: produtos, pesos e medidas são lidos da base de dados; o navegador manda o que
// está no carrinho e para onde vai. O create-order recalcula a opção escolhida ao gravar o pedido.
//
// Body: { country_code, address: { postal_code, region, city }, items: [{ product_id, quantity, price, design_data }] }
// Admin (simulação): { country_code, address, simulate: { weight_kg, subtotal, items?, product_id? } } com sessão de administrador.
// Resposta: { currency, weight_kg, region, options: [{ service_id, carrier, name, price_cents, free, days_min, days_max, source }] }
// currency = moeda base da loja (a dos preços e dos pedidos); o site converte para a moeda do país ao mostrar.
const fail = (code: string, status = 422) => jsonResponse({ error: code, code }, status);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > 256_000) return fail("too_large", 413);

  try {
    const body = await req.json().catch(() => null);
    const sb = supabaseAdmin();
    const country = await loadCountry(sb, body?.country_code ?? null);
    if (!country) return fail("country_not_served");

    const address = body?.address && typeof body.address === "object" ? body.address : {};
    const clean = {
      postal_code: String(address.postal_code ?? "").slice(0, 20),
      region: String(address.region ?? address.district ?? address.state ?? "").slice(0, 80),
      city: String(address.city ?? "").slice(0, 80),
    };

    let simulate: { weightKg: number; subtotal: number; items: number; productId: string | null } | null = null;
    let items: { product_id: string; quantity: number; unitNet: number }[] = [];
    if (body?.simulate) {
      const guard = await requireAdmin(req);
      if ("error" in guard) return guard.error;
      simulate = {
        weightKg: Math.max(0, Number(body.simulate.weight_kg) || 0), subtotal: Math.max(0, Number(body.simulate.subtotal) || 0),
        items: Math.max(1, Math.min(10000, Math.round(Number(body.simulate.items) || 1))),
        productId: typeof body.simulate.product_id === "string" && body.simulate.product_id ? body.simulate.product_id.slice(0, 200) : null,
      };
    } else {
      const raw: any[] = Array.isArray(body?.items) ? body.items.slice(0, 200) : [];
      if (!raw.length) return fail("empty_cart");
      const lines = raw.map((i) => ({
        product_id: String(i?.product_id ?? ""), quantity: Number(i?.quantity), price: Number(i?.price) || 0,
        design_data: i?.design_data && typeof i.design_data === "object" ? i.design_data : null,
      }));
      const priced = await priceItems(sb, lines, { strict: false });
      if (!priced.ok) return fail("cart_invalid");
      items = lines.map((l, idx) => ({ product_id: l.product_id, quantity: priced.lines[idx].quantity, unitNet: priced.lines[idx].expectedUnit }));
    }

    const result = await quoteShipping(sb, {
      country: { code: country.code, currency: country.currency, freeShippingFromCents: country.freeShippingFromCents },
      address: clean, items, simulate,
    });
    // Motivos de indisponibilidade só para a simulação do Admin.
    return jsonResponse(simulate ? result : { ...result, unavailable: undefined });
  } catch (error) {
    console.error("shipping-quote error", error);
    return jsonResponse({ error: "quote_failed", code: "quote_failed" }, 500);
  }
});
