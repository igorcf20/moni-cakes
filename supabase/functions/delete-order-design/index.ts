import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod@3.23.8";

const Body = z.object({ design_id: z.string().uuid() });

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

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, service);
    const { data: design, error: dErr } = await admin
      .from("order_designs")
      .select("id, order_id, file_path, preview_path, pdf_path, originals, orders!inner(user_id, status)")
      .eq("id", parsed.data.design_id)
      .maybeSingle();
    if (dErr || !design) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // has_role com o token do próprio utilizador: respeita a verificação em dois passos do Admin.
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });

    const ord: any = (design as any).orders;
    const isOwner = ord?.user_id === userRes.user.id && ["completed", "delivered"].includes(ord?.status);
    if (!isAdmin && !isOwner) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paths = [
      design.file_path,
      design.preview_path,
      (design as any).pdf_path,
    ].filter(Boolean) as string[];
    const origs = (design as any).originals;
    if (Array.isArray(origs)) {
      for (const o of origs) {
        if (o?.path) paths.push(o.path as string);
      }
    }
    if (paths.length) await admin.storage.from("dtf-uploads").remove(paths);
    await admin.from("order_designs").delete().eq("id", design.id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});