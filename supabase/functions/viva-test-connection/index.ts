import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, requireAdmin } from "../_shared/admin.ts";

// Admin-only. Validates Viva Wallet credentials by requesting an OAuth token and
// hitting a lightweight authenticated endpoint. Returns human-readable OK/error.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const guard = await requireAdmin(req);
  if ("error" in guard) return guard.error;

  const sb = supabaseAdmin();
  const { data: creds } = await sb.from("integration_credentials").select("*").eq("provider", "viva").maybeSingle();
  if (!creds) return jsonResponse({ ok: false, error: "Sem credenciais Viva Wallet gravadas. Preencha os campos e clique em «Guardar Viva Wallet» antes de testar." }, 200);

  const c: any = creds.credentials || {};
  const env = creds.environment === "production" ? "production" : "demo";
  const accountHost = env === "production" ? "https://accounts.vivapayments.com" : "https://demo-accounts.vivapayments.com";

  const missing: string[] = [];
  if (!c.client_id) missing.push("client_id");
  if (!c.client_secret) missing.push("client_secret");
  if (!c.source_code) missing.push("source_code");
  if (missing.length) {
    return jsonResponse({ ok: false, error: `Faltam credenciais: ${missing.join(", ")}. Guarde-as antes de testar.` }, 200);
  }

  try {
    // 1. OAuth (Smart Checkout credentials)
    const basicOauth = btoa(`${c.client_id}:${c.client_secret}`);
    const tokRes = await fetch(`${accountHost}/connect/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basicOauth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!tokRes.ok) {
      const txt = await tokRes.text();
      return jsonResponse({ ok: false, step: "oauth", error: `Falha OAuth (${tokRes.status}) — verifica client_id/client_secret`, detail: txt.slice(0, 300) }, 200);
    }
    const tok = await tokRes.json();

    return jsonResponse({
      ok: true,
      environment: env,
      hasWebhookKey: !!c.webhook_key,
      tokenType: tok?.token_type || "bearer",
      message: `Smart Checkout ligado ao ambiente ${env === "production" ? "Produção" : "Demo"}${c.webhook_key ? " e webhook configurado" : "; falta configurar a chave do webhook"}.`,
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: (e as Error).message }, 200);
  }
});
