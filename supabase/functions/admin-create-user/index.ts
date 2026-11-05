import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";
import { recordAdminActivity, hidden } from "../_shared/activityLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(40).optional().default(""),
  tax_id: z.string().trim().max(40).optional().default(""),
});

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
    const { email, password, full_name, phone, tax_id } = parsed.data;

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone, nif: tax_id || null },
    });
    if (error) throw error;

    // Upsert profile in case trigger raced
    await admin.from("user_profiles").upsert({
      user_id: created.user!.id,
      full_name,
      phone: phone || null,
      tax_id: tax_id || null,
    }, { onConflict: "user_id" });

    await recordAdminActivity(admin, req, {
      actor: userRes.user.id, action: "create", entity: "auth_users", entityId: created.user!.id, label: email,
      changes: { email: { o: null, n: email }, full_name: { o: null, n: full_name ?? null }, password: hidden(false, true) },
    });

    return new Response(JSON.stringify({ ok: true, user_id: created.user!.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});