# Moni Cakes

Loja online da Moni Cakes, café e confeitaria: bolos artesanais, recheados e personalizados sob encomenda.
Feita a partir do código da loja PRINT3D (`igorcf20/loja3d`): multi-país (Brasil como padrão), com moeda,
idioma (pt-BR, pt-PT, en, es), impostos e documento fiscal de cada país. Página inicial cinematográfica com
GSAP + ScrollTrigger (`docs/GUIA-VISUAL.md`).

- Site: Vite + React 18 + TypeScript + Tailwind/shadcn + React Query.
- Backend próprio, no VPS da loja, com Docker Compose: PostgreSQL, login, API REST, arquivos e funções
  do servidor (componentes de código aberto, sem conta em serviços externos). Ver `deploy/`.
- Regras do projeto e arquitetura: `CLAUDE.md`. Segurança: `SECURITY.md`.

## Desenvolvimento

```sh
npm ci
bash deploy/local-up.sh            # backend completo local em http://127.0.0.1:18190
# para o site com recarga automática, com a ANON_KEY do env de teste:
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY> npx vite --mode production --port 8080
bash deploy/local-down.sh          # para sem apagar dados
```

Validação antes de cada commit:

```sh
npx tsc -p tsconfig.app.json --noEmit
npx eslint <ficheiros alterados>
node --experimental-strip-types scripts/test-print3d.mjs
node --experimental-strip-types scripts/test-tax-id.mjs
bash deploy/test-migrations.sh     # quando houver migration nova
```

## Publicação

Cada push no `main` é publicado no VPS pelo `deploy/sync.sh` (timer systemd): build do site, backend,
migrations com cópia de segurança antes e troca do site só se tudo responder; senão volta à versão anterior.
Primeira instalação: `deploy/bootstrap.sh` (duas vezes). Domínio e HTTPS: `deploy/expose-domain.sh`.
Cópias diárias da base e dos ficheiros: `deploy/backup.sh` (timer às 03:30). Restauro: `deploy/restore.sh --listar`.
