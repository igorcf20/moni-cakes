import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, requireAdmin, maskCredentials } from "../_shared/admin.ts";
import { recordAdminActivity, hidden } from "../_shared/activityLog.ts";

// Manages secret integration credentials (Viva Wallet, CTT, Resend, FIZ, Melhor Envio, Sendcloud,
// Mercado Pago, Stripe, PayPal).
// GET  ?provider=viva|ctt|resend|fiz|melhor_envio|sendcloud|mercado_pago|stripe|paypal  -> returns environment, is_active, public_config and MASKED credentials only.
// POST { provider, environment, is_active, credentials, public_config } -> upserts. Replaces only provided credential keys.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireAdmin(req);
  if ("error" in guard) return guard.error;

  const sb = supabaseAdmin();
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const provider = url.searchParams.get("provider");
      if (provider) {
        const { data, error } = await sb.from("integration_credentials").select("*").eq("provider", provider).maybeSingle();
        if (error) throw error;
        if (!data) return jsonResponse({ provider, environment: "demo", is_active: false, public_config: {}, masked: {}, updated_at: null });
        return jsonResponse({
          provider: data.provider,
          environment: data.environment,
          is_active: data.is_active,
          public_config: data.public_config,
          masked: maskCredentials(data.credentials as any),
          updated_at: data.updated_at,
        });
      }
      const { data, error } = await sb.from("integration_credentials").select("provider, environment, is_active, public_config, updated_at");
      if (error) throw error;
      return jsonResponse({ items: data ?? [] });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { provider, environment, is_active, credentials, public_config } = body ?? {};
      if (!provider || typeof provider !== "string") return jsonResponse({ error: "provider required" }, 400);
      if (!["viva", "ctt", "resend", "fiz", "melhor_envio", "sendcloud", "mercado_pago", "stripe", "paypal"].includes(provider)) return jsonResponse({ error: "invalid provider" }, 400);

      // Merge with existing credentials so admin can update only specific fields.
      const { data: existing } = await sb.from("integration_credentials").select("credentials, public_config, environment, is_active").eq("provider", provider).maybeSingle();
      const mergedCreds = { ...(existing?.credentials as any || {}), ...(credentials || {}) };
      // Drop empty strings ("" means delete)
      for (const [k, v] of Object.entries(mergedCreds)) if (v === "" || v == null) delete mergedCreds[k];

      const payload = {
        provider,
        environment: environment ?? existing?.environment ?? "demo",
        is_active: typeof is_active === "boolean" ? is_active : existing?.is_active ?? false,
        credentials: mergedCreds,
        public_config: public_config ?? existing?.public_config ?? {},
        last_updated_by: guard.userId,
      };

      const { error } = await sb.from("integration_credentials").upsert(payload, { onConflict: "provider" });
      if (error) throw error;
      // Registo de atividade: só os nomes das chaves alteradas, nunca os valores.
      const oldCreds = (existing?.credentials as Record<string, unknown>) || {};
      const changes: Record<string, { o: unknown; n: unknown }> = {};
      for (const k of new Set([...Object.keys(oldCreds), ...Object.keys(mergedCreds)])) {
        if (oldCreds[k] !== mergedCreds[k]) changes[`credentials.${k}`] = hidden(k in oldCreds, k in mergedCreds);
      }
      if (existing?.environment !== payload.environment) changes.environment = { o: existing?.environment ?? null, n: payload.environment };
      if (existing?.is_active !== payload.is_active) changes.is_active = { o: existing?.is_active ?? null, n: payload.is_active };
      if (JSON.stringify(existing?.public_config ?? {}) !== JSON.stringify(payload.public_config)) changes.public_config = { o: "...", n: "..." };
      if (Object.keys(changes).length) {
        await recordAdminActivity(sb, req, { actor: guard.userId, action: existing ? "update" : "create", entity: "integration_credentials", entityId: provider, label: provider, changes });
      }
      return jsonResponse({ ok: true, provider, masked: maskCredentials(mergedCreds) });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("admin-credentials error", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});