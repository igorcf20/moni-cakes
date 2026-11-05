import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({
  order_ids: z.array(z.string().uuid()).min(1).max(200),
  files_only: z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, service);
    // has_role com o token do próprio utilizador: respeita a verificação em dois passos do Admin.
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ids = parsed.data.order_ids;
    const filesOnly = parsed.data.files_only;

    // Collect file paths from order_designs
    const { data: designs } = await admin
      .from("order_designs")
      .select("file_path, preview_path, pdf_path, originals")
      .in("order_id", ids);

    const dtfPaths: string[] = [];
    for (const d of designs || []) {
      if (d.file_path) dtfPaths.push(d.file_path);
      if (d.preview_path) dtfPaths.push(d.preview_path);
      if (d.pdf_path) dtfPaths.push(d.pdf_path);
      const origs = (d as any).originals;
      if (Array.isArray(origs)) {
        for (const o of origs) {
          if (o?.path) dtfPaths.push(o.path);
        }
      }
    }

    // Collect payment proof paths
    const { data: ords } = await admin
      .from("orders")
      .select("payment_proof_url")
      .in("id", ids);
    const proofPaths: string[] = [];
    for (const o of ords || []) {
      const url = o.payment_proof_url as string | null;
      if (!url) continue;
      const m = url.match(/\/payment-proofs\/(.+)$/);
      if (m) proofPaths.push(decodeURIComponent(m[1]));
    }

    // Remove storage objects (chunked)
    const chunk = <T,>(arr: T[], n: number) =>
      Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
    for (const c of chunk(dtfPaths, 100)) {
      if (c.length) await admin.storage.from("dtf-uploads").remove(c);
    }
    for (const c of chunk(proofPaths, 100)) {
      if (c.length) await admin.storage.from("payment-proofs").remove(c);
    }

    if (filesOnly) {
      // Wipe references but keep the orders themselves
      await admin.from("order_designs").delete().in("order_id", ids);
      await admin
        .from("orders")
        .update({ payment_proof_url: null })
        .in("id", ids);
      return new Response(
        JSON.stringify({ ok: true, deleted: 0, files: dtfPaths.length + proofPaths.length, files_only: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete child rows then orders
    await admin.from("order_designs").delete().in("order_id", ids);
    await admin.from("order_items").delete().in("order_id", ids);
    await admin.from("order_status_history").delete().in("order_id", ids);
    await admin.from("tracking_events").delete().in("order_id", ids);
    await admin.from("viva_payment_sessions").delete().in("order_id", ids);
    const { error: delErr } = await admin.from("orders").delete().in("id", ids);
    if (delErr) throw delErr;

    return new Response(
      JSON.stringify({ ok: true, deleted: ids.length, files: dtfPaths.length + proofPaths.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});