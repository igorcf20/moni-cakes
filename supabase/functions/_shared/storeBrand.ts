// Nome, frase e logótipo da loja para as funções (e-mails, pagamentos), lidos do que o dono gravou no Admin.
// Mesmas chaves do site (src/hooks/useBrand.ts):
//   store_info.name        nome da loja (Admin > Configurações > Empresa / Marca e visual)
//   store_brand.tagline    frase curta; store_brand.logos.full logótipo completo
//   visual_settings.logo_url  logótipo antigo, ainda aceite como reserva
// Sem nada gravado: segredo STORE_NAME das funções, senão "Loja". Guardado 5 minutos em memória.

// deno-lint-ignore no-explicit-any
type Sb = any;

export type StoreBrandInfo = { name: string; tagline: string; logoUrl: string; url: string };

const siteUrl = () => String(Deno.env.get("SITE_URL") ?? "").trim().replace(/\/+$/, "");
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Caminho relativo ("/brand/x.png") vira endereço completo com o SITE_URL; sem SITE_URL não serve num e-mail. */
function absolute(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const site = siteUrl();
  return site && url.startsWith("/") ? `${site}${url}` : "";
}

export function fallbackBrand(): StoreBrandInfo {
  const site = siteUrl();
  return {
    name: text(Deno.env.get("STORE_NAME")) || "Loja",
    tagline: "",
    logoUrl: site ? `${site}/brand-logo.png` : "",
    url: site,
  };
}

let cached: StoreBrandInfo | null = null;
let cachedAt = 0;

export async function loadStoreBrand(sb: Sb): Promise<StoreBrandInfo> {
  if (cached && Date.now() - cachedAt < 5 * 60_000) return cached;
  const base = fallbackBrand();
  try {
    const { data } = await sb.from("store_settings").select("key,value").in("key", ["store_info", "store_brand", "visual_settings"]);
    // deno-lint-ignore no-explicit-any
    const get = (k: string): any => (data ?? []).find((r: { key: string }) => r.key === k)?.value ?? {};
    const info = get("store_info"), brand = get("store_brand"), visual = get("visual_settings");
    cached = {
      name: (text(info.name) || base.name).slice(0, 80),
      tagline: text(brand.tagline).slice(0, 160),
      logoUrl: absolute(text(visual.logo_url)) || absolute(text(brand.logos?.full)) || base.logoUrl,
      url: base.url,
    };
  } catch {
    cached = base;
  }
  cachedAt = Date.now();
  return cached;
}

/** Nome para o campo "De:" de um e-mail (sem aspas nem sinais que partam o cabeçalho). */
export const senderName = (name: string) => name.replace(/["<>\r\n]/g, "").trim() || "Loja";
