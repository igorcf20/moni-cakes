import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "missing token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const {
      order_id,
      delivery_method_id,
      payment_method_id,
      payment_method_type,
      shipping_address,
      shipping_cost,
    } = body || {};
    if (!order_id || !delivery_method_id || !payment_method_id) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: order, error: orderErr } = await admin
      .from("orders").select("*").eq("id", order_id).maybeSingle();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "order not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (order.user_id !== userId) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!order.requires_customer_config) {
      return new Response(JSON.stringify({ error: "order already configured" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate delivery + payment method exist & are active
    const { data: dm } = await admin
      .from("delivery_methods").select("*").eq("id", delivery_method_id).eq("is_active", true).maybeSingle();
    if (!dm) {
      return new Response(JSON.stringify({ error: "invalid delivery method" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: pm } = await admin
      .from("payment_config").select("*").eq("id", payment_method_id).eq("is_active", true).maybeSingle();
    if (!pm) {
      return new Response(JSON.stringify({ error: "invalid payment method" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = (dm.config || {}) as Record<string, unknown>;
    const trueShipping = Number(
      (cfg as any).price ?? (cfg as any).base_price ?? Number(shipping_cost ?? 0),
    );

    const subtotalNet = Number(order.subtotal_net ?? 0);
    const vatTotal = Number(order.vat_total ?? 0);
    const total = subtotalNet + vatTotal + trueShipping;

    const update: Record<string, unknown> = {
      requires_customer_config: false,
      payment_method: pm.type || payment_method_type || "manual",
      payment_status: "pending",
      shipping_address: dm.type === "pickup" ? null : shipping_address,
      shipping_cost: trueShipping,
      total,
      notes: [order.notes || "", `Envio escolhido: ${dm.name}`, `Pagamento escolhido: ${pm.name}`]
        .filter(Boolean).join("\n"),
    };

    const { error: updErr } = await admin.from("orders").update(update).eq("id", order_id);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});