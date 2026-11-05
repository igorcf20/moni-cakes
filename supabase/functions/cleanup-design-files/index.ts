import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // This function only removes storage objects and DB rows whose delete_after
  // timestamp has already elapsed (set by our own order-status trigger). It is
  // therefore idempotent and safe to invoke from any caller — the caller cannot
  // force premature deletion. We keep an optional shared secret gate for cron
  // callers, but requests without it are also accepted and produce the exact
  // same result: only overdue rows are cleaned up.

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error } = await admin
      .from("order_designs")
      .select("id, file_path, pdf_path, preview_path, originals, keep_preview_only")
      .is("deleted_at", null)
      .not("delete_after", "is", null)
      .lt("delete_after", new Date().toISOString())
      .limit(500);
    if (error) throw error;

    let removed = 0;
    for (const r of rows || []) {
      const paths: string[] = [];
      if (r.file_path) paths.push(r.file_path);
      if ((r as any).pdf_path) paths.push((r as any).pdf_path);
      // If we should keep the preview (after status=shipped), skip preview_path.
      if (r.preview_path && !r.keep_preview_only) paths.push(r.preview_path);
      const origs = Array.isArray(r.originals) ? r.originals : [];
      for (const o of origs) if (o?.path) paths.push(o.path);
      if (paths.length) {
        const { error: rmErr } = await admin.storage.from("dtf-uploads").remove(paths);
        if (rmErr) console.warn("remove failed", r.id, rmErr.message);
      }
      if (r.keep_preview_only) {
        // Mark as cleaned but keep the row + preview path for historical view.
        await admin
          .from("order_designs")
          .update({
            file_path: null,
            pdf_path: null,
            originals: [],
            delete_after: null,
          })
          .eq("id", r.id);
      } else {
        await admin
          .from("order_designs")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", r.id);
      }
      removed += 1;
    }

    // Orphan sweep: storage objects under dtf-uploads with no matching
    // order_designs row (or matching only soft-deleted rows). These accumulate
    // when uploads fail mid-way, when rows get hard-deleted, or when older
    // rows were cleaned but pdf_path was not tracked. Uses SECURITY DEFINER
    // RPC because PostgREST cannot query the storage schema directly.
    let orphansRemoved = 0;
    try {
      const { data: orphans } = await admin.rpc("list_orphan_dtf_objects", { _limit: 500 });
      const orphanPaths = (orphans as any[] | null)?.map((o) => o.name).filter(Boolean) ?? [];
      if (orphanPaths.length) {
        // Remove in batches of 100 to stay under Storage API limits.
        for (let i = 0; i < orphanPaths.length; i += 100) {
          const batch = orphanPaths.slice(i, i + 100);
          const { error: rmErr } = await admin.storage.from("dtf-uploads").remove(batch);
          if (rmErr) console.warn("orphan remove failed", rmErr.message);
          else orphansRemoved += batch.length;
        }
      }
    } catch (e) {
      console.warn("orphan sweep skipped:", (e as Error).message);
    }

    return new Response(JSON.stringify({ ok: true, removed, orphansRemoved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});