import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANON_MARK = "[Conta eliminada — RGPD Art. 17.º]";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    let body: any = {};
    try { body = await req.json(); } catch { /* noop */ }
    if ((body?.confirm || "").toString().trim().toUpperCase() !== "EXCLUIR") {
      return json({ error: "invalid_confirmation", message: "Escreva EXCLUIR para confirmar." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch user's email for cascading cleanup on email-keyed tables
    const { data: userRow } = await admin.auth.admin.getUserById(userId);
    const email = userRow?.user?.email || null;

    // 1) Anonimiza encomendas (mantidas para faturação — RGPD Art. 17.º n.º 3 b/e)
    const { data: userOrders, error: ordersErr } = await admin
      .from("orders")
      .select("id")
      .eq("user_id", userId);
    if (ordersErr) {
      console.error("orders fetch failed", ordersErr);
      return json({ error: "server_error", step: "orders_fetch" }, 500);
    }
    const orderIds = (userOrders || []).map((o: any) => o.id);
    let ordersPreserved = 0;
    if (orderIds.length) {
      const { error: anonErr } = await admin
        .from("orders")
        .update({
          user_id: null,
          guest_name: ANON_MARK,
          guest_email: ANON_MARK,
          guest_phone: ANON_MARK,
          shipping_address: { anonymized: true, note: ANON_MARK } as any,
          billing_address: { anonymized: true, note: ANON_MARK } as any,
          notes: ANON_MARK,
          manual_customer_name: ANON_MARK,
          manual_customer_contact: ANON_MARK,
        } as any)
        .in("id", orderIds);
      if (anonErr) {
        console.error("orders anonymize failed", anonErr);
        return json({ error: "server_error", step: "orders_anonymize", message: anonErr.message }, 500);
      }
      ordersPreserved = orderIds.length;
    }

    // 2) Apaga dados pessoais não necessários para relatórios
    const byUser = [
      "user_addresses",
      "wishlist",
      "cart_items",
      "saved_designs",
      "search_history",
      "product_reviews",
      "user_roles",
      "user_profiles",
    ];
    for (const table of byUser) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) console.warn(`delete ${table} failed`, error.message);
    }
    if (email) {
      await admin.from("newsletter_subscriptions").delete().eq("email", email);
      await admin.from("contact_messages").delete().eq("email", email);
      await admin.from("email_unsubscribe_tokens").delete().eq("email", email);
    }

    // 3) Elimina utilizador de auth
    const { error: delUserErr } = await admin.auth.admin.deleteUser(userId);
    if (delUserErr) {
      console.error("auth delete failed", delUserErr);
      return json({ error: "server_error", step: "auth_delete", message: delUserErr.message }, 500);
    }

    return json({ ok: true, orders_preserved: ordersPreserved });
  } catch (e) {
    console.error("delete-my-account error", e);
    return json({ error: "server_error", message: (e as Error).message }, 500);
  }
});