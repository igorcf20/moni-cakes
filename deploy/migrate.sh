#!/bin/sh
# Moni Cakes: aplica as migrations de supabase/migrations no PostgreSQL próprio (VPS).
#
# - Aplica os ficheiros *.sql por ordem de nome, cada um numa transação
#   (psql --single-transaction -v ON_ERROR_STOP=1): ou entra o ficheiro todo, ou nada.
# - Regista as aplicadas em supabase_migrations.schema_migrations e salta as que já lá estão.
# - Antes de aplicar pendentes faz uma cópia de segurança (pg_dump comprimido) e mantém as
#   últimas BACKUP_KEEP (10 por omissão).
# - Se uma migration falhar, para e sai com erro (o deploy mantém a versão anterior do site).
# - Só corre depois de o GoTrue (schema auth) e o storage-api (schema storage) terem criado
#   as suas tabelas.
#
# Uso:
#   sh deploy/migrate.sh            aplica as pendentes
#   sh deploy/migrate.sh --status   só mostra o estado (aplicadas / pendentes)
#   sh deploy/migrate.sh --backup   só faz a cópia diária da base (deploy/backup.sh), sem aplicar nada:
#                                   loja3d-diaria-AAAAMMDD-HHMMSS.dump em BACKUP_DIR, verificada com
#                                   pg_restore antes de ficar com o nome final. Não mexe na retenção das
#                                   cópias de antes das migrations (a das diárias é feita pelo backup.sh).
#
# Variáveis (todas opcionais menos a palavra-passe):
#   PGHOST (db), PGPORT (5432), PGDATABASE (postgres)
#   PGPASSWORD ou POSTGRES_PASSWORD   palavra-passe dos papéis postgres e supabase_admin
#   MIGRATE_USER (postgres)           papel que corre as migrations (o mesmo do SQL Editor da Supabase)
#   BACKUP_USER (supabase_admin)      papel do pg_dump (lê também auth, storage e vault)
#   MIGRATIONS_DIR (../supabase/migrations a partir deste script)
#   BACKUP_DIR (/backups)  BACKUP_KEEP (10)
#   MIGRATE_WAIT (180)                segundos de espera pela base e pelos schemas auth/storage
#   MIGRATE_SKIP_BACKUP=1             não faz cópia de segurança (só para testes)
#   BACKUP_STAMP (AAAAMMDD-HHMMSS)    só com --backup: data do nome (o backup.sh usa a mesma nos ficheiros)
#
# Nunca imprime a palavra-passe.

set -eu

MODE="apply"
case "${1:-}" in
  "") ;;
  --status) MODE="status" ;;
  --backup) MODE="backup" ;;
  -h|--help) sed -n '2,33p' "$0"; exit 0 ;;
  *) echo "migrate: opção desconhecida: $1 (use --status, --backup ou --help)" >&2; exit 2 ;;
esac

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" >/dev/null 2>&1 && pwd)

export PGHOST="${PGHOST:-db}"
export PGPORT="${PGPORT:-5432}"
export PGDATABASE="${PGDATABASE:-postgres}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-5}"
if [ -z "${PGPASSWORD:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export PGPASSWORD="$POSTGRES_PASSWORD"
fi
if [ -z "${PGPASSWORD:-}" ]; then
  echo "migrate: falta PGPASSWORD (ou POSTGRES_PASSWORD)." >&2
  exit 2
fi

MIGRATE_USER="${MIGRATE_USER:-postgres}"
BACKUP_USER="${BACKUP_USER:-supabase_admin}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$SCRIPT_DIR/../supabase/migrations}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-10}"
MIGRATE_WAIT="${MIGRATE_WAIT:-180}"
TRACK_TABLE="supabase_migrations.schema_migrations"
# Chave fixa do bloqueio consultivo: dois migrate ao mesmo tempo aplicam um ficheiro de cada vez.
LOCK_KEY=7341003

export LC_ALL=C

log() { printf '%s migrate: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
fail() { log "ERRO: $*" >&2; exit 1; }

psql_run() {
  # psql sem ~/.psqlrc, a parar no primeiro erro, como MIGRATE_USER. Avisos (NOTICE) escondidos.
  PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning" \
    psql -X -q -v ON_ERROR_STOP=1 -U "$MIGRATE_USER" "$@"
}

psql_value() {
  psql -X -q -At -v ON_ERROR_STOP=1 -U "$MIGRATE_USER" -c "$1"
}

[ -d "$MIGRATIONS_DIR" ] || fail "pasta de migrations não encontrada: $MIGRATIONS_DIR"

# 1. Esperar pela base de dados.
waited=0
until pg_isready -q -U "$MIGRATE_USER" >/dev/null 2>&1 && psql_value "select 1" >/dev/null 2>&1; do
  if [ "$waited" -ge "$MIGRATE_WAIT" ]; then
    fail "a base de dados em $PGHOST:$PGPORT não respondeu em ${MIGRATE_WAIT}s (ou a palavra-passe de $MIGRATE_USER está errada)."
  fi
  sleep 2
  waited=$((waited + 2))
done

# Modo --backup: cópia diária (chamada pelo deploy/backup.sh). Só lê a base; sai logo a seguir.
#   - escreve para <nome>.part (umask 077) e só lhe dá o nome final depois de verificada:
#     pg_restore --list (índice legível, com entradas) e pg_restore -f /dev/null (lê todos os blocos de
#     dados até ao fim, o que apanha um ficheiro cortado ou corrompido);
#   - prioridade baixa (nice / ionice) quando a imagem os tem.
daily_backup() {
  umask 077
  stamp="${BACKUP_STAMP:-$(date -u '+%Y%m%d-%H%M%S')}"
  printf '%s\n' "$stamp" | grep -Eq '^[0-9]{8}-[0-9]{6}$' || fail "BACKUP_STAMP inválido (tem de ser AAAAMMDD-HHMMSS)."
  mkdir -p "$BACKUP_DIR" || fail "não consegui criar a pasta de cópias $BACKUP_DIR"
  dump="$BACKUP_DIR/loja3d-diaria-$stamp.dump"
  tmp="$dump.part"
  [ ! -e "$dump" ] || fail "já existe $(basename "$dump"); nada foi alterado."
  rm -f "$tmp" "$tmp.err" "$tmp.lst"
  trap 'rm -f "$tmp" "$tmp.err" "$tmp.lst"' EXIT
  trap 'exit 1' INT TERM
  lowprio=""
  if command -v nice >/dev/null 2>&1; then lowprio="nice -n 19"; fi
  if command -v ionice >/dev/null 2>&1 && ionice -c 2 -n 7 true >/dev/null 2>&1; then lowprio="ionice -c 2 -n 7 $lowprio"; fi
  log "cópia diária da base: $(basename "$dump")"
  # $lowprio sem aspas de propósito (vazio ou "ionice ... nice -n 19").
  # shellcheck disable=SC2086
  if $lowprio pg_dump -U "$BACKUP_USER" -Fc -Z 6 -f "$tmp" 2>"$tmp.err" \
     || { [ "$BACKUP_USER" != "$MIGRATE_USER" ] && $lowprio pg_dump -U "$MIGRATE_USER" -Fc -Z 6 -f "$tmp" 2>"$tmp.err"; }; then
    :
  else
    sed 's/^/  pg_dump: /' "$tmp.err" >&2 || true
    fail "a cópia diária da base falhou (pg_dump)."
  fi
  if ! pg_restore --list "$tmp" > "$tmp.lst" 2>"$tmp.err"; then
    sed 's/^/  pg_restore: /' "$tmp.err" >&2 || true
    fail "a cópia diária não passou na verificação (pg_restore --list); foi apagada."
  fi
  entries=$(grep -c '^[0-9]' "$tmp.lst" || true)
  [ "${entries:-0}" -gt 0 ] || fail "a cópia diária não tem nenhuma entrada no índice; foi apagada."
  # shellcheck disable=SC2086
  if ! $lowprio pg_restore -f /dev/null "$tmp" 2>"$tmp.err"; then
    sed 's/^/  pg_restore: /' "$tmp.err" >&2 || true
    fail "a cópia diária não se consegue ler até ao fim (pg_restore); foi apagada."
  fi
  chmod 600 "$tmp" || true
  # Gravado no disco antes do nome final (um corte de energia não deixa um ficheiro vazio com nome de cópia boa).
  sync "$tmp" || fail "não consegui gravar $(basename "$tmp") no disco; foi apagada."
  mv "$tmp" "$dump" || fail "não consegui dar o nome final a $(basename "$dump")."
  rm -f "$tmp.err" "$tmp.lst"
  log "cópia diária verificada: $(basename "$dump") ($entries entradas no índice)"
}

if [ "$MODE" = "backup" ]; then
  daily_backup
  exit 0
fi

# 2. Esperar pelos schemas do GoTrue (auth) e do storage-api (storage), que os criam nas suas
#    próprias migrations ao arrancar. A garantia principal é o depends_on (service_healthy) do
#    compose; aqui confirma-se que existem os objetos que as migrations usam.
prereq_sql="select (to_regclass('auth.users') is not null
              and to_regclass('auth.identities') is not null
              and to_regprocedure('auth.uid()') is not null
              and to_regprocedure('auth.role()') is not null
              and to_regprocedure('auth.jwt()') is not null
              and to_regclass('storage.buckets') is not null
              and to_regclass('storage.objects') is not null
              and to_regclass('storage.migrations') is not null
              and to_regprocedure('storage.foldername(text)') is not null)::int"
waited=0
until [ "$(psql_value "$prereq_sql" 2>/dev/null || echo 0)" = "1" ]; do
  if [ "$waited" -ge "$MIGRATE_WAIT" ]; then
    fail "os schemas auth e storage não estão prontos ao fim de ${MIGRATE_WAIT}s. Os serviços auth (GoTrue) e storage já arrancaram?"
  fi
  sleep 3
  waited=$((waited + 3))
done

# 3. Tabela de registo (compatível com a da Supabase CLI: version, name).
psql_run <<SQL >/dev/null
create schema if not exists supabase_migrations;
create table if not exists $TRACK_TABLE (
  version text primary key,
  name text,
  applied_at timestamptz not null default now()
);
alter table $TRACK_TABLE add column if not exists name text;
alter table $TRACK_TABLE add column if not exists applied_at timestamptz not null default now();
revoke all on schema supabase_migrations from public;
SQL

# 4. Ficheiros e versões.
applied_file=$(mktemp)
pending_file=$(mktemp)
trap 'rm -f "$applied_file" "$pending_file"' EXIT INT TERM

psql_value "select version from $TRACK_TABLE order by version" > "$applied_file"

total=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$f" ] || continue
  base=$(basename "$f" .sql)
  version=${base%%_*}
  name=${base#*_}
  [ "$name" = "$base" ] && name=""
  case "$version" in
    ''|*[!0-9]*) fail "nome de migration inválido (tem de começar por dígitos e _): $(basename "$f")" ;;
  esac
  case "$name" in
    *[!A-Za-z0-9_.-]*) fail "nome de migration com caracteres inválidos: $(basename "$f")" ;;
  esac
  total=$((total + 1))
  if ! grep -qx "$version" "$applied_file"; then
    printf '%s\n' "$f" >> "$pending_file"
  fi
done

dups=$(for f in "$MIGRATIONS_DIR"/*.sql; do b=$(basename "$f"); echo "${b%%_*}"; done | sort | uniq -d)
[ -z "$dups" ] || fail "há migrations com a mesma versão: $(echo "$dups" | tr '\n' ' ')"

n_applied=$(grep -c . "$applied_file" || true)
n_pending=$(grep -c . "$pending_file" || true)

if [ "$MODE" = "status" ]; then
  log "migrations no repositório: $total; registadas na base: $n_applied; pendentes: $n_pending"
  while IFS= read -r f; do
    [ -n "$f" ] && echo "  pendente: $(basename "$f")"
  done < "$pending_file"
  exit 0
fi

# 5. Cópia de segurança antes de mexer na base.
backup() {
  if [ "${MIGRATE_SKIP_BACKUP:-0}" = "1" ]; then
    log "cópia de segurança desligada (MIGRATE_SKIP_BACKUP=1)."
    return 0
  fi
  mkdir -p "$BACKUP_DIR" || fail "não consegui criar a pasta de cópias $BACKUP_DIR"
  # Só restos das cópias de antes das migrations (nunca o .part de uma cópia diária a decorrer).
  rm -f "$BACKUP_DIR"/loja3d-[0-9]*.dump.part "$BACKUP_DIR"/loja3d-[0-9]*.dump.part.err 2>/dev/null || true
  stamp=$(date -u '+%Y%m%d-%H%M%S')
  dump="$BACKUP_DIR/loja3d-$stamp.dump"
  tmp="$dump.part"
  log "cópia de segurança: $(basename "$dump")"
  # Formato custom (-Fc), já comprimido; restaura-se com pg_restore (ver o fim deste ficheiro).
  if pg_dump -U "$BACKUP_USER" -Fc -Z 6 -f "$tmp" 2>"$tmp.err" \
     || { [ "$BACKUP_USER" != "$MIGRATE_USER" ] && pg_dump -U "$MIGRATE_USER" -Fc -Z 6 -f "$tmp" 2>"$tmp.err"; }; then
    mv "$tmp" "$dump"
    rm -f "$tmp.err"
    chmod 600 "$dump" 2>/dev/null || true
  else
    sed 's/^/  pg_dump: /' "$tmp.err" >&2 || true
    rm -f "$tmp" "$tmp.err"
    fail "a cópia de segurança falhou; nenhuma migration foi aplicada."
  fi
  # Manter só as últimas BACKUP_KEEP cópias (o nome tem a data, por isso a ordem é cronológica).
  ls -1 "$BACKUP_DIR" | grep -E '^loja3d-[0-9]{8}-[0-9]{6}\.dump$' | sort -r \
    | tail -n +"$((BACKUP_KEEP + 1))" | while IFS= read -r old; do
        rm -f "$BACKUP_DIR/$old" && log "cópia antiga removida: $old"
      done
}

# 6. Aplicar, por ordem, cada ficheiro na sua transação (com o registo na mesma transação).
count=0
apply_pending() {
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    base=$(basename "$f" .sql)
    version=${base%%_*}
    name=${base#*_}
    [ "$name" = "$base" ] && name=""
    log "a aplicar $base"
    if ! psql_run --single-transaction -o /dev/null \
        -c "do \$m\$ begin perform pg_advisory_xact_lock($LOCK_KEY); if exists (select 1 from $TRACK_TABLE where version = '$version') then raise exception 'a migration $version já foi aplicada por outro processo'; end if; end \$m\$" \
        -f "$f" \
        -c "reset role" \
        -c "reset all" \
        -c "insert into $TRACK_TABLE (version, name) values ('$version', '$name')"; then
      log "ERRO ao aplicar $base. Nada desta migration ficou na base (a transação foi desfeita)."
      log "migrations aplicadas nesta execução antes do erro: $count. Corrija o ficheiro e volte a correr."
      exit 1
    fi
    count=$((count + 1))
  done < "$pending_file"
}

if [ "$n_pending" -eq 0 ]; then
  log "nada a aplicar ($total migrations, todas já registadas)."
else
  log "$n_pending migration(s) pendente(s) de $total."
  backup
  apply_pending
fi

# 7. Segredos usados pelos cron jobs (pg_cron + pg_net) no Vault da base, a partir do env:
#    cron_secret = CRON_SECRET (cabeçalho x-cron-secret do ctt-track)
#    anon_key    = ANON_KEY (chave pública; passa a verificação de JWT do router das funções)
#    Os valores vão como parâmetros (\bind), nunca no texto da consulta nem no ecrã.
#    Sem a variável, o segredo fica como está.
vault_sync() {
  vname="$1"; venv="$2"
  eval "vval=\${$venv:-}"
  if [ -z "$vval" ]; then
    log "Vault: $venv não definido; segredo '$vname' não alterado."
    return 0
  fi
  if [ "$(psql_value "select (to_regclass('vault.secrets') is not null)::int")" != "1" ]; then
    log "AVISO: extensão Vault indisponível; segredo '$vname' não guardado (os cron jobs seguem sem ele)."
    return 0
  fi
  # Exportado só durante esta chamada: o psql lê-o com printf (nunca entra na linha de comando).
  export VAULT_VALUE="$vval"
  if psql_run -o /dev/null 2>/dev/null <<SQL
\\set VERBOSITY terse
\\set SHOW_CONTEXT never
\\set vault_value \`printf '%s' "\$VAULT_VALUE"\`
select vault.update_secret(s.id, \$1) from vault.decrypted_secrets s
 where s.name = '$vname' and s.decrypted_secret is distinct from \$1 \\bind :vault_value \\g
select vault.create_secret(\$1, '$vname')
 where not exists (select 1 from vault.secrets where name = '$vname') \\bind :vault_value \\g
SQL
  then
    log "Vault: segredo '$vname' sincronizado."
  # Segredo ilegível (ex.: base restaurada de uma cópia com outra chave do pgsodium): recriar.
  elif psql_run -o /dev/null <<SQL
\\set VERBOSITY terse
\\set SHOW_CONTEXT never
\\set vault_value \`printf '%s' "\$VAULT_VALUE"\`
begin;
delete from vault.secrets where name = '$vname';
select vault.create_secret(\$1, '$vname') \\bind :vault_value \\g
commit;
SQL
  then
    log "Vault: segredo '$vname' recriado (o anterior não se conseguia ler)."
  else
    log "AVISO: não consegui guardar o segredo '$vname' no Vault."
  fi
  unset VAULT_VALUE vval
}
vault_sync cron_secret CRON_SECRET
if [ -z "${ANON_KEY:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then ANON_KEY="$SUPABASE_ANON_KEY"; fi
vault_sync anon_key ANON_KEY

# 8. Pedir ao PostgREST que releia o schema (novas tabelas e funções RPC).
psql_value "notify pgrst, 'reload schema'" >/dev/null 2>&1 || true

log "concluído: $count migration(s) aplicada(s)."

# Restaurar uma cópia: deploy/restore.sh (cópia do estado atual antes, restauro numa só transação,
# serviços parados e religados, migrate no fim). No VPS:
#   bash ~/monicakes/src/deploy/restore.sh --listar
#   bash ~/monicakes/src/deploy/restore.sh ~/monicakes/backups/loja3d-AAAAMMDD-HHMMSS.dump
# (o migrate volta a gravar no Vault os segredos dos cron jobs, se a chave do pgsodium for outra).
