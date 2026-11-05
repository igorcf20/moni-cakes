import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin, requireAdmin } from "../_shared/admin.ts";

// Fetches CTT tracking events and stores them in tracking_events; marks the order delivered when CTT
// reports delivery.
// Body: { orderId?: string, trackingCode?: string }  -> one order (admin)
//       { all: true }                                -> every shipped order with a tracking number
//                                                       (hourly cron, header x-cron-secret = CRON_SECRET)
type Sb = ReturnType<typeof supabaseAdmin>;

async function cttToken(host: string, c: any): Promise<string> {
  const res = await fetch(`${host}/oauth2/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.client_id, client_secret: c.client_secret, scope: c.scope || "tracking" }),
  });
  if (!res.ok) throw new Error(`CTT auth failed (${res.status})`);
  return (await res.json()).access_token;
}

async function syncOrder(sb: Sb, host: string, token: string, order: any, code: string) {
  const res = await fetch(`${host}/feed/tracking/v1/searches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trackingCodes: [code] }),
  });
  if (!res.ok) throw new Error(`CTT tracking failed (${res.status})`);
  const data = await res.json();
  // CTT: { trackingResponses: [ { trackingCode, events: [{ eventCode, eventDescription, eventDateTime }] } ] }
  const first = (data?.trackingResponses || data?.searches || [])[0] || {};
  const events: any[] = first?.events || first?.trackingEvents || [];
  let delivered = false;
  let inserted = 0;

  for (const ev of events) {
    const occurredAt = ev.eventDateTime || ev.dateTime || ev.date;
    const status = String(ev.eventCode || ev.code || "");
    const label = ev.eventDescription || ev.description || ev.status || "";
    if (/entreg/i.test(label) || /DELIVER/i.test(status)) delivered = true;
    if (!order?.id || !occurredAt) continue;
    const { data: exists } = await sb.from("tracking_events").select("id")
      .eq("order_id", order.id).eq("status_code", status).eq("occurred_at", occurredAt).maybeSingle();
    if (exists) continue;
    await sb.from("tracking_events").insert({
      order_id: order.id, tracking_code: code, status_code: status, status_label: label, description: label, occurred_at: occurredAt, raw: ev,
    });
    inserted++;
  }

  if (delivered && order?.id && !["delivered", "cancelled", "refunded"].includes(order.status)) {
    await sb.from("orders").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", order.id);
    await sb.from("order_status_history").insert({ order_id: order.id, status: "delivered", notes: "Entrega confirmada pelo rastreio CTT" });
  }
  return { events: events.length, inserted, delivered };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // Either an admin session or the hourly cron carrying CRON_SECRET.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedCron = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && !!providedCron && providedCron === cronSecret;
  if (!isCron) {
    const guard = await requireAdmin(req);
    if ("error" in guard) return guard.error;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sb = supabaseAdmin();

    const { data: creds } = await sb.from("integration_credentials").select("*").eq("provider", "ctt").maybeSingle();
    const c: any = creds?.credentials || {};
    if (!creds?.is_active || !c.client_id || !c.client_secret) {
      // Not configured yet: nothing to do (the cron must not fail loudly every hour).
      return jsonResponse({ ok: false, skipped: "CTT não configurado ou inativo" }, isCron ? 200 : 503);
    }
    const host = c.host || "https://api.ctt.pt";
    const token = await cttToken(host, c);

    if (body?.all) {
      const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
      const { data: orders } = await sb.from("orders").select("id,status,tracking_number")
        .eq("status", "shipped").not("tracking_number", "is", null).gte("created_at", since).limit(200);
      const results: Record<string, unknown> = {};
      for (const o of orders ?? []) {
        try { results[o.id] = await syncOrder(sb, host, token, o, String(o.tracking_number)); }
        catch (e) { results[o.id] = { error: (e as Error).message }; }
      }
      return jsonResponse({ ok: true, orders: (orders ?? []).length, results });
    }

    let order: any = null;
    let code: string | null = body?.trackingCode ?? null;
    if (body?.orderId) {
      const { data } = await sb.from("orders").select("id,status,tracking_number").eq("id", body.orderId).maybeSingle();
      order = data;
      code = code || order?.tracking_number || null;
    }
    if (!code) return jsonResponse({ error: "Indique o código de rastreio." }, 400);
    const result = await syncOrder(sb, host, token, order, code);
    return jsonResponse({ ok: true, ...result });
  } catch (e) {
    console.error("ctt-track error", e);
    return jsonResponse({ error: (e as Error).message }, 502);
  }
});
