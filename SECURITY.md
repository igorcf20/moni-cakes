# Política de Segurança

## Chaves e segredos

O backend corre no próprio VPS (`deploy/compose.yaml`): PostgreSQL, auth (GoTrue), REST (PostgREST),
ficheiros (storage-api) e Edge Functions (edge-runtime), sem nenhum serviço externo da Supabase.

### Chave pública (pode estar no bundle)
- `VITE_SUPABASE_PUBLISHABLE_KEY`: a `ANON_KEY` do servidor (JWT de papel `anon`). O `vite.config.ts`
  recusa construir com uma chave de outro papel.
- `VITE_SUPABASE_URL` (opcional): vazio no VPS, porque a API responde no mesmo domínio do site.

O acesso aos dados é controlado por **Row Level Security (RLS)** em todas as tabelas do schema `public`.

### Segredos (NUNCA no frontend nem no Git)
Gerados no VPS pelo `deploy/gen-secrets.sh` e guardados só em `~/loja3d/env` (chmod 600):

- `POSTGRES_PASSWORD`: palavra-passe dos papéis internos da base.
- `JWT_SECRET`: assina e verifica todos os JWT (sessões, `ANON_KEY`, `SERVICE_ROLE_KEY`).
- `SERVICE_ROLE_KEY`: ignora RLS. Só existe no serviço `functions` e no storage, nunca no build do site.
- `CRON_SECRET`: cabeçalho `x-cron-secret` dos pedidos agendados do pg_cron (copiado para o Vault pelo migrate).

Credenciais de integrações (Viva, FIZ, etc.) são inseridas pelo dono da loja no painel Admin.

**Regra de ouro:** o `service_role` nunca pode ser importado em código dentro de `src/`. Uma operação
privilegiada vai para uma Edge Function que valida o JWT do utilizador antes de agir.

## Boas práticas aplicadas neste projeto

- RLS ativo em todas as tabelas públicas, com políticas explícitas.
- O router das Edge Functions (`deploy/functions/main/index.ts`) verifica o JWT de cada pedido; só as funções
  com `verify_jwt = false` em `supabase/config.toml` aceitam pedidos sem JWT, e essas validam
  assinatura ou segredo próprio (ex.: `viva-webhook` reconfirma cada pagamento na API da Viva).
- Edge Functions administrativas validam JWT + `has_role(auth.uid(),'admin')`.
- Site, API e ficheiros estão no mesmo domínio (e a sessão fica no `localStorage` desse domínio). Por isso o
  `deploy/nginx.conf` envia `Content-Security-Policy: sandbox` em todas as respostas de `/rest`, `/auth`,
  `/storage` e `/functions` (exceto PDF): um HTML ou SVG enviado por um cliente não corre scripts com a
  sessão de quem o abre. O site leva `X-Frame-Options: SAMEORIGIN`.
- Todo o HTML dinâmico passa por `DOMPurify.sanitize`.
- Sessões geridas pelo cliente supabase-js, sem `localStorage` manual de tokens.
- O `.env` não entra no Git.

## Reportar vulnerabilidades

Envie um e-mail ao responsável do projeto com o detalhe da vulnerabilidade e os passos de reprodução.
Não abra issues públicas com detalhes exploráveis.
