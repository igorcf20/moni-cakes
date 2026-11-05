import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { Plugin } from "vite";
import { STORE_DEFAULTS } from "./src/config/store.ts";
import { resolveColors } from "./src/theme/themeVars.ts";

// Backend próprio (deploy/compose.yaml): a API responde no MESMO domínio do site, em
// /rest/v1, /auth/v1, /storage/v1 e /functions/v1. Por isso o build só precisa da chave pública
// (ANON_KEY, papel anon). VITE_SUPABASE_URL é opcional (vazio = origem aberta no navegador).
const API_PREFIXES = ["/rest/v1", "/auth/v1", "/storage/v1", "/functions/v1"] as const;

/** Lê o papel ("role") de uma chave JWT sem a validar; null se não for um JWT. */
function jwtRole(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const role = JSON.parse(json)?.role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/**
 * HTML inicial com a marca da loja (src/config/store.ts): título, descrição, cor da barra do navegador,
 * ícone e imagem de partilha. É o que o Google e as redes sociais leem antes de o site carregar.
 * No index.html ficam marcadores __STORE_*__; o Admin depois atualiza estes valores no navegador.
 */
function storeHtml(): Plugin {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const b = STORE_DEFAULTS;
  const values: Record<string, string> = {
    __STORE_NAME__: b.name,
    __STORE_TITLE__: b.tagline ? `${b.name} | ${b.tagline}` : b.name,
    __STORE_DESCRIPTION__: b.description,
    __STORE_THEME_COLOR__: resolveColors(b.theme.colors).background,
    __STORE_FAVICON__: b.favicon || "/favicon.png",
    __STORE_SHARE_IMAGE__: b.shareImage || "/og-image.jpg",
  };
  return {
    name: "store-html",
    transformIndexHtml: (html) => html.replace(/__STORE_[A-Z_]+__/g, (m) => (m in values ? esc(values[m]) : m)),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const read = (name: string) => env[name.replace(/^VITE_/, "PUBLIC_")]?.trim() || env[name]?.trim() || "";

  const publishableKey = read("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!publishableKey) {
    throw new Error(
      "Configuração de build incompleta. Defina VITE_SUPABASE_PUBLISHABLE_KEY (a ANON_KEY do servidor).",
    );
  }
  // A chave entra no código público do site: só pode ser a de papel anon, nunca a service_role.
  const role = jwtRole(publishableKey);
  if (publishableKey.startsWith("sb_secret_") || (role !== null && role !== "anon")) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY tem de ser a chave pública (papel anon). Nunca use a SERVICE_ROLE_KEY no site.",
    );
  }

  const publicConfiguration = {
    // Vazio: o cliente usa window.location.origin (mesmo domínio do site).
    VITE_SUPABASE_URL: read("VITE_SUPABASE_URL"),
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    VITE_SUPABASE_PROJECT_ID: read("VITE_SUPABASE_PROJECT_ID"),
  };

  // Servidor de desenvolvimento e "vite preview": encaminham a API para a stack local
  // (deploy/local-up.sh, porta 18190) ou para LOJA3D_BACKEND_URL.
  const backend = env.LOJA3D_BACKEND_URL?.trim() || "http://127.0.0.1:18190";
  const proxy = Object.fromEntries(API_PREFIXES.map((prefix) => [prefix, { target: backend }]));

  return {
    define: Object.fromEntries(
      Object.entries(publicConfiguration).map(([name, value]) => [
        `import.meta.env.${name}`,
        JSON.stringify(value),
      ]),
    ),
    server: {
      host: "::",
      port: 8080,
      proxy,
    },
    preview: {
      proxy,
    },
    plugins: [react(), storeHtml()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ["three", "@react-three/fiber", "@react-three/drei"],
            pdf: ["pdfjs-dist", "pdf-lib"],
            charts: ["recharts"],
          },
        },
      },
    },
  };
});
