import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userRow } = await admin.auth.admin.getUserById(userId);
    const email = userRow?.user?.email || null;

    const pick = async (table: string, col = "user_id", value: string | null = userId) => {
      if (!value) return [];
      const { data } = await admin.from(table).select("*").eq(col, value);
      return data || [];
    };

    const [profile, addresses, wishlist, cart, savedDesigns, searchHistory, reviews, orders, orderItems, newsletter] = await Promise.all([
      pick("user_profiles"),
      pick("user_addresses"),
      pick("wishlist"),
      pick("cart_items"),
      pick("saved_designs"),
      pick("search_history"),
      pick("product_reviews"),
      pick("orders"),
      admin.from("order_items").select("*, orders!inner(user_id)").eq("orders.user_id", userId).then(r => r.data || []),
      email ? pick("newsletter_subscriptions", "email", email) : Promise.resolve([]),
    ]);

    const payload = {
      exported_at: new Date().toISOString(),
      user: {
        id: userId,
        email,
        created_at: userRow?.user?.created_at,
      },
      profile,
      addresses,
      wishlist,
      cart,
      saved_designs: savedDesigns,
      search_history: searchHistory,
      reviews,
      orders,
      order_items: orderItems,
      newsletter,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="meus-dados-${userId}.json"`,
      },
    });
  } catch (e) {
    console.error("export-my-data error", e);
    return json({ error: "server_error", message: (e as Error).message }, 500);
  }
});