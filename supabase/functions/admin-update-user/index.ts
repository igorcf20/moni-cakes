import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";
import { recordAdminActivity, hidden } from "../_shared/activityLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({
  user_id: z.string().uuid(),
  email: z.string().trim().email().max(255).optional(),
  password: z.string().min(8).max(72).optional(),
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
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(url, service);
    // has_role com o token do próprio admin: respeita a verificação em dois passos (aal2) quando exigida.
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { user_id, email, password } = parsed.data;

    const update: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (email) { update.email = email; update.email_confirm = true; }
    if (password) update.password = password;

    if (Object.keys(update).length === 0) {
      return new Response(JSON.stringify({ error: "no_changes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: before } = await admin.auth.admin.getUserById(user_id);
    const { error } = await admin.auth.admin.updateUserById(user_id, update);
    if (error) throw error;
    const changes: Record<string, { o: unknown; n: unknown }> = {};
    if (email && email !== before?.user?.email) changes.email = { o: before?.user?.email ?? null, n: email };
    if (password) changes.password = hidden();
    await recordAdminActivity(admin, req, { actor: userRes.user.id, action: "update", entity: "auth_users", entityId: user_id, label: email ?? before?.user?.email, changes });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
