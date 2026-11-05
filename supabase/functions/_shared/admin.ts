import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabaseAdmin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

export async function requireAdmin(req: Request): Promise<{ userId: string } | { error: Response }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) };
  }
  const sb = supabaseAdmin();
  const { data: userRes, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userRes?.user) {
    return { error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) };
  }
  const userId = userRes.user.id;
  // has_role com o token do próprio admin (não com a chave de serviço): assim vale a verificação em dois passos
  // (aal2) quando o admin a tem ativa ou a loja a exige (migration 20261007050000_admin_2fa.sql).
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: hasRole, error: rErr } = await asUser.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (rErr || !hasRole) {
    return { error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) };
  }
  return { userId };
}

// Masks secret string for safe display in admin UI.
export function maskSecret(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  const last = value.slice(-4);
  return `••••${last}`;
}

export function maskCredentials(creds: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds || {})) {
    out[k] = maskSecret(v);
  }
  return out;
}