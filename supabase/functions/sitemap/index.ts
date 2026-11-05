// Dynamic sitemap: static routes + active products + categories + blog articles (recurso blog ligado)
// + forum sections and visible topics (recurso forum ligado e leitura aberta a visitantes).
// Público, sem JWT (verify_jwt = false em supabase/config.toml, lido pelo router deploy/functions/main).
import { createClient } from "npm:@supabase/supabase-js@2";

// Endereço público da loja (segredo SITE_URL da função, ex. https://print3d.com.br).
const BASE_URL = (Deno.env.get("SITE_URL") ?? "").trim().replace(/\/+$/, "");

// Categorias fixas do site (src/lib/catalog.ts); as da tabela categories entram também, sem repetir.
const CATALOG_SLUGS = ["decoracao", "organizacao", "suportes", "geek", "casa", "personalizados"];

const STATIC_ENTRIES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/produtos", changefreq: "weekly", priority: "0.9" },
  { path: "/orcamento-3d", changefreq: "monthly", priority: "0.8" },
  { path: "/personalizar", changefreq: "monthly", priority: "0.8" },
  { path: "/kits", changefreq: "weekly", priority: "0.6" },
  { path: "/sobre", changefreq: "monthly", priority: "0.5" },
  { path: "/faq", changefreq: "monthly", priority: "0.6" },
  { path: "/ajuda", changefreq: "monthly", priority: "0.4" },
  { path: "/contatos", changefreq: "monthly", priority: "0.6" },
  { path: "/rastrear", changefreq: "monthly", priority: "0.5" },
  { path: "/termos", changefreq: "yearly", priority: "0.4" },
  { path: "/devolucoes", changefreq: "yearly", priority: "0.4" },
  { path: "/politica-privacidade", changefreq: "yearly", priority: "0.3" },
];

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => (
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === "&" ? "&amp;" :
    c === "'" ? "&apos;" :
    "&quot;"
  ));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }

  if (!BASE_URL) {
    return new Response("Configure o segredo SITE_URL desta função (endereço público da loja).", { status: 503 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const [{ data: products }, { data: categories }, { data: blogOn }] = await Promise.all([
    supabase
      .from("products")
      .select("slug, updated_at")
      .eq("is_active", true)
      .not("slug", "is", null),
    supabase
      .from("categories")
      .select("slug, updated_at")
      .not("slug", "is", null),
    supabase.rpc("feature_enabled", { _key: "blog", _default: false }),
  ]);
  const { data: forumFlag } = await supabase.rpc("feature_enabled", { _key: "forum", _default: false });
  const { data: forumRules } = forumFlag ? await supabase.from("store_settings").select("value").eq("key", "forum").maybeSingle() : { data: null };
  const forumOn = !!forumFlag && (forumRules as any)?.value?.guests_read !== false;
  const [{ data: forumSections }, { data: forumTopics }] = forumOn
    ? await Promise.all([
      supabase.from("forum_categories").select("id, slug, updated_at").eq("is_active", true),
      supabase.from("forum_topics").select("id, category_id, last_post_at").eq("status", "visible").order("last_post_at", { ascending: false }).limit(2000),
    ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  const { data: posts } = blogOn
    ? await supabase.from("blog_posts").select("slug, updated_at").eq("status", "published").lte("published_at", new Date().toISOString())
    : { data: [] as any[] };

  const urls: string[] = [];

  for (const e of STATIC_ENTRIES) {
    urls.push(
      `  <url>\n    <loc>${BASE_URL}${e.path}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
    );
  }

  const catRows = [
    ...CATALOG_SLUGS.map((slug) => ({ slug, updated_at: null })),
    ...(categories ?? []).filter((c: any) => !CATALOG_SLUGS.includes(String(c.slug))),
  ];
  for (const c of catRows) {
    const slug = escapeXml(String((c as any).slug));
    const lastmod = (c as any).updated_at ? new Date((c as any).updated_at).toISOString().slice(0, 10) : null;
    urls.push(
      `  <url>\n    <loc>${BASE_URL}/categoria/${slug}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
    );
  }

  for (const p of products ?? []) {
    const slug = escapeXml(String((p as any).slug));
    const lastmod = (p as any).updated_at ? new Date((p as any).updated_at).toISOString().slice(0, 10) : null;
    urls.push(
      `  <url>\n    <loc>${BASE_URL}/produto/${slug}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
    );
  }

  if (blogOn) {
    urls.push(`  <url>\n    <loc>${BASE_URL}/blog</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`);
    for (const b of posts ?? []) {
      const slug = escapeXml(String((b as any).slug));
      const lastmod = (b as any).updated_at ? new Date((b as any).updated_at).toISOString().slice(0, 10) : null;
      urls.push(
        `  <url>\n    <loc>${BASE_URL}/blog/${slug}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`
      );
    }
  }

  if (forumOn) {
    urls.push(`  <url>\n    <loc>${BASE_URL}/forum</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.5</priority>\n  </url>`);
    const active = new Set((forumSections ?? []).map((c: any) => String(c.id)));
    for (const c of forumSections ?? []) {
      urls.push(`  <url>\n    <loc>${BASE_URL}/forum/${escapeXml(String((c as any).slug))}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.4</priority>\n  </url>`);
    }
    for (const x of (forumTopics ?? []).filter((x: any) => active.has(String(x.category_id)))) {
      const lastmod = (x as any).last_post_at ? new Date((x as any).last_post_at).toISOString().slice(0, 10) : null;
      urls.push(
        `  <url>\n    <loc>${BASE_URL}/forum/topico/${escapeXml(String((x as any).id))}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n    <changefreq>weekly</changefreq>\n    <priority>0.4</priority>\n  </url>`
      );
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join("\n") + `\n` +
    `</urlset>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
});