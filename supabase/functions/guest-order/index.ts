import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Guest checkout has been permanently disabled. All purchases now require an
// authenticated user account. This endpoint is kept only to return a clear
// 410 Gone response so any stale clients fail loudly instead of silently
// trusting client-supplied prices or leaking customer data by email lookup.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: "guest_checkout_disabled",
      message: "O checkout sem registo foi descontinuado. Por favor inicie sessão.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
