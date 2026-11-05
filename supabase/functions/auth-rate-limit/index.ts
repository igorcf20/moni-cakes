import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

/**
 * Brute-force protection for sign-in.
 *
 * Usage from the client:
 *   - Before login:  POST { email }            -> { allowed, retryInMinutes }
 *   - After failure: POST { email, failure:true }
 *   - After success: POST { email, success:true } (clears recent failures)
 *
 * Window: 15 min, max 5 failed attempts per (email,IP).
 */
const WINDOW_MIN = 15;
const MAX_FAILS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) return jsonResponse({ allowed: true });
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const ua = req.headers.get("user-agent") || "";
    const identifier = `${email}|${ip}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, service);

    const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000).toISOString();

    // Log success/failure (best-effort)
    if (body?.success === true) {
      await admin.from("auth_attempts").insert({ identifier, ip, user_agent: ua, success: true });
      return jsonResponse({ allowed: true });
    }
    if (body?.failure === true) {
      await admin.from("auth_attempts").insert({ identifier, ip, user_agent: ua, success: false });
      return jsonResponse({ ok: true });
    }

    // Pre-check: count failures in window
    const { count } = await admin
      .from("auth_attempts")
      .select("id", { count: "exact", head: true })
      .eq("identifier", identifier)
      .eq("success", false)
      .gte("created_at", since);

    if ((count || 0) >= MAX_FAILS) {
      return jsonResponse({ allowed: false, retryInMinutes: WINDOW_MIN });
    }
    return jsonResponse({ allowed: true, remaining: MAX_FAILS - (count || 0) });
  } catch (e) {
    // Fail-open: never block legit users due to an internal error
    return jsonResponse({ allowed: true, error: (e as Error).message });
  }
});