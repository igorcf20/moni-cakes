import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";
import { recordAdminActivity, hidden } from "../_shared/activityLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({ user_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(url, service);
    // has_role com o token do próprio admin: respeita a verificação em dois passos (aal2) quando exigida.
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { user_id } = parsed.data;

    if (user_id === userRes.user.id) {
      return new Response(JSON.stringify({ error: "cannot delete yourself" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Preserve any orders made by this user by detaching the FK and freezing
    // a snapshot of the customer name on the order itself.
    const { data: profile } = await admin.from("user_profiles").select("full_name, phone").eq("user_id", user_id).maybeSingle();
    const { data: authUser } = await admin.auth.admin.getUserById(user_id);
    const email = authUser?.user?.email || null;
    const name = profile?.full_name || email || "Cliente apagado";

    await admin.from("orders")
      .update({ user_id: null, guest_name: name, guest_email: email, guest_phone: profile?.phone || null })
      .eq("user_id", user_id);

    // Cascade clean tables that store per-user data
    await admin.from("cart_items").delete().eq("user_id", user_id);
    await admin.from("wishlist").delete().eq("user_id", user_id);
    await admin.from("user_addresses").delete().eq("user_id", user_id);
    await admin.from("user_roles").delete().eq("user_id", user_id);
    await admin.from("user_profiles").delete().eq("user_id", user_id);
    await admin.from("saved_designs").delete().eq("user_id", user_id);
    await admin.from("search_history").delete().eq("user_id", user_id);
    await admin.from("product_reviews").delete().eq("user_id", user_id);

    const { error: delErr } = await admin.auth.admin.deleteUser(user_id);
    if (delErr) throw delErr;
    await recordAdminActivity(admin, req, {
      actor: userRes.user.id, action: "delete", entity: "auth_users", entityId: user_id, label: email,
      changes: { email: { o: email, n: null }, full_name: { o: profile?.full_name ?? null, n: null } },
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});