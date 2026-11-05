import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { orderId, path, note, guestEmail } = await req.json();
    if (!orderId || !path) {
      return new Response(JSON.stringify({ error: "Dados em falta" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order, error: ordErr } = await supabase
      .from("orders")
      .select("id, user_id, guest_email, status")
      .eq("id", orderId)
      .maybeSingle();
    if (ordErr || !order) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is allowed: authenticated user matches user_id, OR guestEmail matches.
    const authHeader = req.headers.get("authorization") || "";
    let userIdFromToken: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userIdFromToken = user?.id || null;
    }

    const isOwner = order.user_id && userIdFromToken && order.user_id === userIdFromToken;
    const isGuestMatch = !order.user_id && order.guest_email && guestEmail &&
      order.guest_email.toLowerCase() === String(guestEmail).toLowerCase();

    if (!isOwner && !isGuestMatch) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (order.status !== "pending") {
      return new Response(JSON.stringify({ error: "Pedido já processado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await supabase
      .from("orders")
      .update({
        payment_proof_url: path,
        payment_proof_uploaded_at: new Date().toISOString(),
        payment_proof_note: note || null,
        payment_status: "proof_submitted",
      })
      .eq("id", orderId);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});