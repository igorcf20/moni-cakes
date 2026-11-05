import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const STORAGE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, service);
    // has_role com o token do próprio utilizador: respeita a verificação em dois passos do Admin.
    const { data: roleRow } = await userClient.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aggregate via SECURITY DEFINER RPC (PostgREST does not expose the storage schema).
    const { data: rows, error } = await admin.rpc("get_storage_usage");
    if (error) throw error;

    const byBucket: { name: string; bytes: number; count: number }[] = [];
    let total = 0;
    for (const r of (rows as any[]) || []) {
      const bytes = Number(r.bytes || 0);
      byBucket.push({ name: r.bucket_id || "unknown", bytes, count: Number(r.count || 0) });
      total += bytes;
    }

    return new Response(
      JSON.stringify({
        limit_bytes: STORAGE_LIMIT_BYTES,
        used_bytes: total,
        used_pct: STORAGE_LIMIT_BYTES > 0 ? (total / STORAGE_LIMIT_BYTES) * 100 : 0,
        buckets: byBucket,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});