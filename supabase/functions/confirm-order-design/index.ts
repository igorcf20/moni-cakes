import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod@3.23.8";

const Body = z.object({
  order_id: z.string().uuid(),
  cart_item_key: z.string().min(1).max(60),
  plano_index: z.number().int().nonnegative().optional(),
});

async function exists(admin: any, fullPath: string | null, expectedSize?: number | null): Promise<boolean> {
  if (!fullPath) return false;
  const slash = fullPath.lastIndexOf("/");
  const dir = slash > 0 ? fullPath.slice(0, slash) : "";
  const name = slash > 0 ? fullPath.slice(slash + 1) : fullPath;
  const { data, error } = await admin.storage.from("dtf-uploads").list(dir, {
    limit: 100,
    search: name,
  });
  if (error || !data) return false;
  const object = data.find((o: any) => o.name === name);
  if (!object) return false;
  if (typeof expectedSize === "number" && expectedSize > 0) {
    const actualSize = Number(object.metadata?.size ?? object.metadata?.contentLength);
    if (!Number.isFinite(actualSize) || actualSize !== expectedSize) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, service);

    // Require an authenticated caller that owns the order (or is admin).
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userRes, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userRes.user.id;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "invalid_body", detail: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { order_id, cart_item_key, plano_index } = parsed.data;

    // Verify ownership before touching design rows.
    const { data: ownerOrder } = await admin
      .from("orders")
      .select("user_id")
      .eq("id", order_id)
      .maybeSingle();
    if (!ownerOrder) {
      return new Response(JSON.stringify({ error: "order_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (ownerOrder.user_id !== callerId) {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let q = admin.from("order_designs").select("id, plano_index, file_path, preview_path, pdf_path, size_bytes, preview_size_bytes, pdf_size_bytes, originals")
      .eq("order_id", order_id)
      .eq("cart_item_key", cart_item_key);
    if (typeof plano_index === "number") q = q.eq("plano_index", plano_index);
    const { data: rows, error } = await q;
    if (error) {
      return new Response(JSON.stringify({ error: "lookup_failed", detail: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Every plano row stores the same global originals manifest. Verify each
    // original object once, not once per plano (orders may contain many planos).
    type OriginalManifest = { path: string; size?: number; name?: string };
    const originalsByPath = new Map<string, OriginalManifest>();
    for (const row of rows || []) {
      for (const value of Array.isArray(row.originals) ? row.originals : []) {
        const original = value as Record<string, unknown>;
        if (typeof original.path === "string" && !originalsByPath.has(original.path)) {
          originalsByPath.set(original.path, {
            path: original.path,
            size: typeof original.size === "number" ? original.size : undefined,
            name: typeof original.name === "string" ? original.name : undefined,
          });
        }
      }
    }
    const originalChecks = new Map<string, boolean>(await Promise.all(
      Array.from(originalsByPath.entries()).map(async ([path, original]) => [
        path,
        await exists(admin, path, original.size),
      ] as [string, boolean]),
    ));

    const results: Array<{ id: string; plano_index: number; ok: boolean; missing: string[] }> = [];
    for (const r of rows || []) {
      const paths: Array<[string, string | null, number | null]> = [
        ["layout", r.file_path, r.size_bytes],
        ["preview", r.preview_path, r.preview_size_bytes],
      ];
      if (r.pdf_path) paths.push(["pdf", r.pdf_path, r.pdf_size_bytes]);
      const missing: string[] = [];
      for (const [label, p, expectedSize] of paths) {
        if (!p) { missing.push(label); continue; }
        const ok = await exists(admin, p, expectedSize);
        if (!ok) missing.push(label);
      }
      const originals = Array.isArray(r.originals) ? r.originals : [];
      for (const value of originals) {
        const original = value as Record<string, unknown>;
        const path = typeof original.path === "string" ? original.path : "";
        if (!originalChecks.get(path)) {
          missing.push(`original:${typeof original.name === "string" ? original.name : "ficheiro"}`);
        }
      }
      const ok = missing.length === 0;
      if (ok) {
        const { error: updateError } = await admin.from("order_designs").update({ upload_complete: true }).eq("id", r.id);
        if (updateError) {
          return new Response(JSON.stringify({ error: "completion_update_failed", detail: updateError.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      results.push({ id: r.id, plano_index: r.plano_index, ok, missing });
    }

    const allOk = results.length > 0 && results.every((r) => r.ok);
    return new Response(JSON.stringify({ ok: allOk, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
