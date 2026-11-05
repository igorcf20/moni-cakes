// Cliente do backend próprio da loja (PostgreSQL, auth, ficheiros e funções no VPS, deploy/compose.yaml),
// com as mesmas APIs do supabase-js. O backend responde no MESMO domínio do site (/rest/v1, /auth/v1,
// /storage/v1, /functions/v1), por isso o endereço é a origem atual. VITE_SUPABASE_URL é opcional e
// só serve para apontar o site para outro servidor.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
// Chave pública (papel anon). A chave de serviço nunca entra no site.
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;


function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // Chaves opacas (sb_publishable_...) não são JWT: não vão no Authorization.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
  },
  auth: {
    // Sem "storage": o supabase-js guarda a sessão no localStorage (e usa memória se o navegador o bloquear).
    persistSession: true,
    autoRefreshToken: true,
  }
});
