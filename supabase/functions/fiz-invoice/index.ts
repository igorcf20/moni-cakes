import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAdmin, supabaseAdmin } from "../_shared/admin.ts";
import { ensureDraft, fizCompany, invoicePdfUrl, issueInvoice, loadFizConfig } from "../_shared/fiz.ts";

// Admin-only FIZ actions.
// Body: { action: "company" }                      -> key check + readiness to issue
//       { action: "draft" | "issue" | "pdf", orderId }
// "issue" is fiscal and irreversible (reported to the tax authority); the admin UI asks for confirmation.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const guard = await requireAdmin(req);
  if ("error" in guard) return guard.error;

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const orderId = String(body?.orderId ?? "");
  try {
    const cfg = await loadFizConfig(sb);
    if (!cfg) return jsonResponse({ error: "Configure e ative a FIZ em Integrações (API key)." }, 503);

    if (action === "company") {
      const company = await fizCompany(cfg);
      return jsonResponse({ ok: true, name: company.name, taxpayerNumber: company.taxpayerNumber, cae: company.cae, readiness: company.readiness });
    }
    if (!orderId) return jsonResponse({ error: "orderId em falta." }, 400);
    if (action === "draft") return jsonResponse({ ok: true, invoice: await ensureDraft(sb, cfg, orderId) });
    if (action === "issue") return jsonResponse({ ok: true, invoice: await issueInvoice(sb, cfg, orderId) });
    if (action === "pdf") return jsonResponse({ ok: true, url: await invoicePdfUrl(sb, cfg, orderId) });
    return jsonResponse({ error: "Ação desconhecida." }, 400);
  } catch (error) {
    const message = String((error as Error).message ?? error);
    console.error("fiz-invoice error", action, orderId, message);
    if (orderId) await sb.from("order_invoices").upsert({ order_id: orderId, provider: "fiz", error: message.slice(0, 500) }, { onConflict: "order_id" });
    return jsonResponse({ error: message }, 502);
  }
});
