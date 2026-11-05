import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod@3.23.8";

const Body = z.object({ order_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service);
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth?.user) return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    const { order_id } = parsed.data;
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, user_id, files_pending")
      .eq("id", order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return new Response(JSON.stringify({ error: "order_not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    if (order.user_id !== auth.user.id) {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: auth.user.id, _role: "admin" });
      if (!isAdmin) return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: items, error: itemsError } = await admin
      .from("order_items")
      .select("design_data")
      .eq("order_id", order_id);
    if (itemsError) throw itemsError;
    const keys = Array.from(new Set((items || [])
      .map((item: any) => item?.design_data?.cartItemKey)
      .filter((key: unknown): key is string => typeof key === "string" && key.length > 0)));
    if (keys.length === 0) return new Response(JSON.stringify({ ok: true, keys: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    if (order.files_pending) return new Response(JSON.stringify({ ok: false, reason: "files_pending", keys }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { data: designs, error: designsError } = await admin
      .from("order_designs")
      .select("cart_item_key, upload_complete, file_path, preview_path, deleted_at")
      .eq("order_id", order_id)
      .in("cart_item_key", keys)
      .is("deleted_at", null);
    if (designsError) throw designsError;
    const incomplete = keys.filter((key) => {
      const rows = (designs || []).filter((row: any) => row.cart_item_key === key);
      return rows.length === 0 || rows.some((row: any) =>
        row.upload_complete !== true || !row.file_path || !row.preview_path,
      );
    });
    return new Response(JSON.stringify({ ok: incomplete.length === 0, keys, incomplete }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("verify-order-files failed", error);
    return new Response(JSON.stringify({ error: "verification_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
