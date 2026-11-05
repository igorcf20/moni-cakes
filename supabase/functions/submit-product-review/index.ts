import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  order_id: z.string().uuid(),
  product_id: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(3).max(120),
  comment: z.string().trim().max(1000).optional().nullable(),
  customer_name: z.string().trim().max(120).optional().nullable(),
});

const ALLOWED_STATUSES = new Set(["delivered", "completed"]);

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
    if (!jwt) return json({ error: "unauthorized", message: "Inicie sessão para avaliar." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return json({ error: "unauthorized", message: "Sessão inválida." }, 401);
    }
    const user = userRes.user;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
    }
    const input = parsed.data;

    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Confirmar que o pedido pertence ao utilizador, está entregue, e contém o produto.
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, user_id, status")
      .eq("id", input.order_id)
      .maybeSingle();
    if (orderErr) return json({ error: "server_error" }, 500);
    if (!order) return json({ error: "order_not_found", message: "Pedido não encontrado." }, 404);
    if (order.user_id !== user.id) {
      return json({ error: "forbidden", message: "Este pedido não é seu." }, 403);
    }
    if (!ALLOWED_STATUSES.has(String(order.status))) {
      return json({ error: "order_not_delivered", message: "Só pode avaliar depois de o pedido ser entregue." }, 400);
    }

    const { data: item, error: itemErr } = await admin
      .from("order_items")
      .select("id, product_id")
      .eq("order_id", input.order_id)
      .eq("product_id", input.product_id)
      .maybeSingle();
    if (itemErr) return json({ error: "server_error" }, 500);
    if (!item) return json({ error: "product_not_in_order", message: "Este produto não pertence ao pedido indicado." }, 400);

    // 2) Impedir duplicados
    const { data: existing } = await admin
      .from("product_reviews")
      .select("id")
      .or(`and(user_id.eq.${user.id},product_id.eq.${input.product_id}),and(order_id.eq.${input.order_id},product_id.eq.${input.product_id})`)
      .limit(1);
    if (existing && existing.length > 0) {
      return json({ error: "already_reviewed", message: "Já enviou uma avaliação para este produto." }, 409);
    }

    const displayName =
      (input.customer_name && input.customer_name.trim()) ||
      (user.user_metadata?.full_name as string | undefined) ||
      null;

    const { error: insertErr } = await admin.from("product_reviews").insert({
      product_id: input.product_id,
      user_id: user.id,
      order_id: input.order_id,
      rating: input.rating,
      title: input.title,
      comment: input.comment || null,
      customer_name: displayName,
      approved: false,
      created_by_admin: false,
    });
    if (insertErr) {
      console.error("insert review failed", insertErr);
      return json({ error: "insert_failed", message: insertErr.message }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("submit-product-review error", e);
    return json({ error: "server_error", message: (e as Error).message }, 500);
  }
});
