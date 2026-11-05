import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod@3.23.8";

const OriginalSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().max(120).optional(),
  size: z.number().int().nonnegative().optional(),
});

const PlanoSchema = z.object({
  plano_index: z.number().int().nonnegative(),
  plano_name: z.string().max(80).nullable().optional(),
  width_px: z.number().int().positive().nullable().optional(),
  height_px: z.number().int().positive().nullable().optional(),
  dpi: z.number().int().positive().nullable().optional(),
  layout_size: z.number().int().nonnegative().optional(),
  preview_size: z.number().int().nonnegative().optional(),
  copies: z.number().int().min(1).max(99).optional(),
  pdf_size: z.number().int().nonnegative().optional(),
  originals: z.array(OriginalSchema).max(40).default([]),
});

const Body = z.object({
  order_id: z.string().uuid(),
  cart_item_key: z.string().min(4).max(60).regex(/^[a-zA-Z0-9_\-]+$/),
  planos: z.array(PlanoSchema).max(40),
  /**
   * Client signals that the local blobs for this cart item are missing (e.g.
   * user is on a different device/browser than where the design was
   * configured). We insert a placeholder row so the admin sees the item as
   * pending and `files_pending` stays true on the order.
   */
  missing: z.boolean().optional(),
  /** Deprecated: aggregated PDF. Per-plano PDFs use plano.pdf_size. */
  order_pdf: z.object({ size: z.number().int().nonnegative() }).optional(),
}).refine((v) => v.missing === true || v.planos.length > 0, {
  message: "planos_required_or_missing_flag",
});

const sanitize = (s: string) =>
  s.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 80) || "file";

// Servidor próprio (deploy/compose.yaml): as funções falam com a API pela rede interna do Docker
// (SUPABASE_URL = http://web:8080), por isso o signedUrl do supabase-js vem com esse endereço, que o
// navegador não alcança. O site e a API estão no mesmo domínio: o navegador recebe só o caminho
// (/storage/v1/object/upload/sign/...?token=...), que resolve na origem aberta.
const browserUrl = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, service);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "invalid_body", detail: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { order_id, cart_item_key, planos, order_pdf, missing } = parsed.data;

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, user_id, created_at")
      .eq("id", order_id)
      .maybeSingle();
    if (oErr || !order) {
      return new Response(JSON.stringify({ error: "order_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let owner: string = "guest";
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const userClient = createClient(supabaseUrl, anon, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (u?.user) {
        if (order.user_id && order.user_id !== u.user.id) {
          return new Response(JSON.stringify({ error: "forbidden" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        owner = u.user.id;
      }
    }
    if (!order.user_id) {
      const ageMs = Date.now() - new Date(order.created_at).getTime();
      if (ageMs > 2 * 60 * 60 * 1000) {
        return new Response(JSON.stringify({ error: "guest_window_closed" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Placeholder branch: no local blobs available. Insert a single stub row
    // (plano_index=0, upload_complete=false, no file_path) so `sync_order_files_pending`
    // keeps the order flagged and the admin sees "Upload incompleto".
    if (missing || planos.length === 0) {
      const { error: phErr } = await admin
        .from("order_designs")
        .upsert({
          order_id,
          cart_item_key,
          plano_index: 0,
          plano_name: null,
          file_path: null,
          preview_path: null,
          kind: "layout",
          upload_complete: false,
          copies: 1,
          originals: [],
        }, { onConflict: "order_id,cart_item_key,plano_index,kind", ignoreDuplicates: true });
      if (phErr) {
        return new Response(JSON.stringify({ error: "placeholder_failed", detail: phErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, placeholder: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Global dedupe of originals across all planos (one upload per unique file).
    const seenOrig = new Map<string, { path: string; name: string; type?: string; size?: number }>();
    const globalOriginals: Array<{ name: string; path: string; type?: string; size?: number }> = [];
    const globalOriginalSigned: Array<{ name: string; path: string; type?: string; size?: number; upload_url: string; token: string }> = [];
    const result: any[] = [];
    for (const p of planos) {
      const base = `${owner}/${order_id}/${cart_item_key}/plano-${p.plano_index}`;
      const layoutPath = `${base}/layout.png`;
      const previewPath = `${base}/preview.jpg`;

      const { data: layoutSign, error: l1 } = await admin
        .storage.from("dtf-uploads").createSignedUploadUrl(layoutPath);
      const { data: previewSign, error: l2 } = await admin
        .storage.from("dtf-uploads").createSignedUploadUrl(previewPath);
      if (l1 || l2 || !layoutSign || !previewSign) {
        return new Response(JSON.stringify({ error: "sign_failed", detail: l1?.message || l2?.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Per-plano print PDF (one file per plano so the admin can download
      // each plano individually with a distinct name).
      let planoPdfSigned: { path: string; upload_url: string; token: string } | null = null;
      if (p.pdf_size && p.pdf_size > 0) {
        const planoPdfPath = `${base}/print.pdf`;
        const { data: pSign, error: pErr } = await admin
          .storage.from("dtf-uploads").createSignedUploadUrl(planoPdfPath);
        if (pErr || !pSign) {
          return new Response(JSON.stringify({ error: "sign_failed_plano_pdf", detail: pErr?.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        planoPdfSigned = { path: planoPdfPath, upload_url: browserUrl(pSign.signedUrl), token: pSign.token };
      }

      // Dedupe originals globally — same uploaded file may appear in many planos.
      const origs: any[] = [];
      for (const o of p.originals) {
        const key = `${o.name}|${o.size ?? 0}|${o.type ?? ""}`;
        if (seenOrig.has(key)) continue;
        const safe = sanitize(o.name);
        const oPath = `${owner}/${order_id}/${cart_item_key}/originals/${seenOrig.size}-${safe}`;
        const { data: s, error } = await admin.storage
          .from("dtf-uploads").createSignedUploadUrl(oPath);
        if (error || !s) {
          return new Response(JSON.stringify({ error: "sign_failed_original", detail: error?.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const meta = { name: o.name, path: oPath, type: o.type, size: o.size };
        seenOrig.set(key, meta);
        globalOriginals.push(meta);
        globalOriginalSigned.push({ name: o.name, path: oPath, type: o.type, size: o.size, upload_url: browserUrl(s.signedUrl), token: s.token });
        origs.push({ name: o.name, path: oPath, upload_url: browserUrl(s.signedUrl), token: s.token });
      }

      const payload: any = {
        order_id,
        cart_item_key,
        plano_index: p.plano_index,
        plano_name: p.plano_name ?? null,
        file_path: layoutPath,
        preview_path: previewPath,
        width_px: p.width_px ?? null,
        height_px: p.height_px ?? null,
        dpi: p.dpi ?? null,
        size_bytes: p.layout_size ?? null,
        copies: p.copies ?? 1,
        kind: "layout",
        originals: [], // filled in second pass with the GLOBAL dedup list
        pdf_path: planoPdfSigned?.path ?? null,
        preview_size_bytes: p.preview_size ?? null,
        pdf_size_bytes: p.pdf_size ?? null,
        upload_complete: false,
      };
      // Race-safe upsert backed by the unique index
      // order_designs_unique_plano (order_id, cart_item_key, plano_index, COALESCE(kind,'layout'))
      const { data: ups, error: upErr } = await admin
        .from("order_designs")
        .upsert(payload, { onConflict: "order_id,cart_item_key,plano_index,kind" })
        .select("id")
        .single();
      if (upErr || !ups) {
        return new Response(JSON.stringify({ error: "row_upsert_failed", detail: upErr?.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const designId = ups.id as string;

      result.push({
        plano_index: p.plano_index,
        design_id: designId,
        layout: { path: layoutPath, upload_url: browserUrl(layoutSign.signedUrl), token: layoutSign.token },
        preview: { path: previewPath, upload_url: browserUrl(previewSign.signedUrl), token: previewSign.token },
        originals: origs,
        pdf: planoPdfSigned,
      });
    }

    // Backwards-compat: aggregated PDF (older clients that send order_pdf).
    let pdfSigned: { path: string; upload_url: string; token: string } | null = null;
    if (order_pdf && !planos.some((p) => p.pdf_size)) {
      const pdfPath = `${owner}/${order_id}/${cart_item_key}/order.pdf`;
      const { data: s, error } = await admin
        .storage.from("dtf-uploads").createSignedUploadUrl(pdfPath);
      if (error || !s) {
        return new Response(JSON.stringify({ error: "sign_failed_pdf", detail: error?.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      pdfSigned = { path: pdfPath, upload_url: browserUrl(s.signedUrl), token: s.token };
      const firstIdx = Math.min(...planos.map((p) => p.plano_index));
      await admin.from("order_designs").update({ pdf_path: pdfPath })
        .eq("order_id", order_id)
        .eq("cart_item_key", cart_item_key)
        .eq("plano_index", firstIdx)
        .eq("kind", "layout");
    }
    if (globalOriginals.length) {
      const { error: originalsErr } = await admin.from("order_designs").update({ originals: globalOriginals })
        .eq("order_id", order_id)
        .eq("cart_item_key", cart_item_key);
      if (originalsErr) {
        return new Response(JSON.stringify({ error: "original_manifest_failed", detail: originalsErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      owner,
      planos: result,
      originals: globalOriginalSigned,
      pdf: pdfSigned,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
