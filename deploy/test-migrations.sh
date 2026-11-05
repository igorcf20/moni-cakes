#!/usr/bin/env bash
# Testa as migrations NESTE computador (de desenvolvimento, não no VPS partilhado), numa base
# descartável igual à do VPS (deploy/compose.yaml: db + auth + rest + storage + migrate).
# Não toca na stack real (projeto loja3d) nem nos seus volumes; não publica portas.
#   bash deploy/test-migrations.sh
#
# O que verifica:
#   1. Do zero, duas vezes (volumes apagados entre as duas): o deploy/migrate.sh aplica tudo e sai 0.
#   2. De novo sobre a base já migrada: não há nada a aplicar e sai 0.
#   3. Existem as tabelas e as funções RPC que o site e as Edge Functions usam (procuradas no código),
#      os buckets do storage e os cron jobs; não ficam dados de exemplo da loja antiga.
# No fim apaga os contentores, os volumes e os segredos de teste.
#
# Variáveis opcionais:
#   LOJA3D_PROJECT   nome do projeto Compose de teste (por omissão loja3d-migtest)
#   KEEP=1           não apaga a base de teste no fim (para inspecionar com psql)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/.." && pwd)
project=${LOJA3D_PROJECT:-loja3d-migtest}
case $project in loja3d) echo "test-migrations: use um projeto de teste, nunca o loja3d." >&2; exit 2 ;; esac

work=$(mktemp -d "${TMPDIR:-/tmp}/loja3d-migtest.XXXXXX")
chmod 700 "$work"
envf="$work/env"
export LOJA3D_BACKUP_DIR="$work/backups"
mkdir -p "$LOJA3D_BACKUP_DIR"

compose() { docker compose -p "$project" -f "$here/compose.yaml" "$@"; }
say() { echo "test-migrations: $*"; }
falhas=0
check() { # check "descrição" condição(0/1)
  if [ "$2" = "1" ]; then echo "  OK    $1"; else echo "  FALHA $1"; falhas=$((falhas + 1)); fi
}

cleanup() {
  if [ "${KEEP:-0}" = "1" ]; then
    say "base de teste mantida (projeto $project). Apagar: docker compose -p $project -f deploy/compose.yaml down -v"
  else
    compose --profile tools down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

# Restos de uma execução anterior deste projeto de teste (contentores e volumes).
docker ps -aq --filter "label=com.docker.compose.project=$project" | xargs -r docker rm -f >/dev/null
docker volume ls -q --filter "label=com.docker.compose.project=$project" | xargs -r docker volume rm >/dev/null

# Segredos de teste (nunca impressos), num ficheiro temporário fora do repositório.
LOJA3D_PROJECT=$project bash "$here/gen-secrets.sh" "$envf" >/dev/null
grep -q '^CRON_SECRET=' "$envf" || printf 'CRON_SECRET=%s\n' "$(head -c 32 /dev/urandom | od -An -vtx1 | tr -d ' \n')" >> "$envf"
set -a; . "$envf"; set +a
LOJA3D_UID=$(id -u); LOJA3D_GID=$(id -g); export LOJA3D_UID LOJA3D_GID

psql_db() { compose exec -T db psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

wait_healthy() {
  local deadline=$((SECONDS + 300)) s id st pending
  while :; do
    pending=""
    for s in "$@"; do
      id=$(compose ps -q "$s" 2>/dev/null || true)
      st=missing
      [ -z "$id" ] || st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing)
      case $st in healthy|running) ;; *) pending="$pending $s($st)" ;; esac
    done
    [ -n "$pending" ] || return 0
    [ "$SECONDS" -lt "$deadline" ] || { say "serviços sem ficar saudáveis:$pending" >&2; return 1; }
    sleep 3
  done
}

start_clean() {
  compose --profile tools down -v --remove-orphans >/dev/null 2>&1 || true
  compose up -d db auth rest storage >/dev/null 2>&1
  wait_healthy db auth rest storage
}

run_migrate() { # saída em $work/migrate.log
  compose run --rm -T -e CRON_SECRET -e ANON_KEY migrate >"$work/migrate.log" 2>&1
}

n_files=$(find "$repo/supabase/migrations" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')

for vez in 1 2; do
  say "execução $vez do zero ($n_files migrations)..."
  start_clean
  if run_migrate; then
    check "do zero ($vez): migrate.sh saiu 0" 1
  else
    check "do zero ($vez): migrate.sh saiu 0" 0
    grep -E 'migrate:|ERROR|psql:' "$work/migrate.log" | tail -n 20 >&2 || true
    exit 1
  fi
  aplicadas=$(psql_db -c "select count(*) from supabase_migrations.schema_migrations")
  check "do zero ($vez): $aplicadas de $n_files registadas" "$([ "$aplicadas" = "$n_files" ] && echo 1 || echo 0)"
done

say "execução 3 sobre a base já migrada..."
if run_migrate && grep -q 'nada a aplicar' "$work/migrate.log"; then
  check "de novo: nada a aplicar, saiu 0" 1
else
  check "de novo: nada a aplicar, saiu 0" 0
fi

say "verificações da base..."
# Tabelas usadas pelo código (.from("tabela")) e as principais.
tables=$( { grep -rhoE "\.from\(\s*['\"][a-z_0-9]+['\"]" "$repo/src" "$repo/supabase/functions" \
            | sed -E "s/.*\(\s*['\"]//; s/['\"]$//"; \
            printf '%s\n' products orders order_items user_profiles user_roles countries store_settings coupons; } | sort -u)
missing_t=""
for t in $tables; do
  [ "$(psql_db -c "select (to_regclass('public.$t') is not null)::int")" = "1" ] || missing_t="$missing_t $t"
done
check "tabelas e vistas usadas pelo código ($(echo "$tables" | wc -l | tr -d ' '))${missing_t:+; em falta:$missing_t}" "$([ -z "$missing_t" ] && echo 1 || echo 0)"

rpcs=$(grep -rhoE "\.rpc\(\s*['\"][a-z_0-9]+['\"]" "$repo/src" "$repo/supabase/functions" | sed -E "s/.*\(\s*['\"]//; s/['\"]$//" | sort -u)
missing_r=""
for r in $rpcs; do
  [ "$(psql_db -c "select exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '$r')::int")" = "1" ] || missing_r="$missing_r $r"
done
check "funções RPC usadas pelo código ($(echo "$rpcs" | wc -l | tr -d ' '))${missing_r:+; em falta:$missing_r}" "$([ -z "$missing_r" ] && echo 1 || echo 0)"

buckets=$(psql_db -c "select count(*) from storage.buckets where id in ('dtf-uploads','payment-proofs','product-images','product-3d-models','banners')")
check "buckets do storage usados pelo código" "$([ "$buckets" = "5" ] && echo 1 || echo 0)"

jobs=$(psql_db -c "select count(*) from cron.job where jobname in ('cleanup-design-files-hourly','ctt-track-hourly') and command like '%http://web:8080/functions/v1%' and command not like '%supabase.co%'")
check "cron jobs com a URL interna das funções" "$([ "$jobs" = "2" ] && echo 1 || echo 0)"

# Compara por hash (os valores nunca aparecem): o Vault tem de ter exatamente os do env.
vault_ok=1
for par in CRON_SECRET:cron_secret ANON_KEY:anon_key; do
  var=${par%%:*}; nome=${par#*:}
  h_env=$(printf '%s' "${!var}" | sha256sum | cut -d' ' -f1)
  h_db=$(psql_db -c "select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex') from vault.decrypted_secrets where name = '$nome'")
  [ -n "$h_db" ] && [ "$h_env" = "$h_db" ] || vault_ok=0
done
check "segredos cron_secret e anon_key no Vault iguais aos do env" "$vault_ok"

old=$(psql_db <<'SQL'
do $$
declare r record; n bigint; total bigint := 0;
begin
  for r in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' loop
    execute format('select count(*) from public.%I t where t::text ~* %L', r.table_name,
                   'brindes|bom ?dtf|anyluvi|cadaval|brindesml|bomdtf|\+351 ?9|__l5e') into n;
    total := total + n;
  end loop;
  perform set_config('loja3d.antigos', total::text, false);
end $$;
select current_setting('loja3d.antigos');
SQL
)
check "sem dados da loja antiga (linhas encontradas: $old)" "$([ "$old" = "0" ] && echo 1 || echo 0)"

nome=$(psql_db -c "select value->>'name' from public.store_settings where key = 'store_info'")
check "store_settings.store_info com o nome PRINT3D" "$([ "$nome" = "PRINT3D" ] && echo 1 || echo 0)"

copias=$(find "$LOJA3D_BACKUP_DIR" -name 'loja3d-*.dump' | wc -l | tr -d ' ')
check "cópia de segurança feita antes de aplicar ($copias)" "$([ "$copias" -ge 1 ] && echo 1 || echo 0)"

if [ "$falhas" -eq 0 ]; then
  say "tudo certo."
else
  say "$falhas verificação(ões) falharam."
  exit 1
fi
