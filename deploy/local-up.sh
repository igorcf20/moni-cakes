#!/usr/bin/env bash
# Sobe a stack completa da Loja 3D NESTE computador, para testes (não é para o VPS: lá usa-se o sync.sh).
#   bash deploy/local-up.sh
# Depois: site e API em http://127.0.0.1:18190 (ou LOJA3D_HTTP_PORT). Parar: bash deploy/local-down.sh
#
# Variáveis opcionais:
#   LOJA3D_PROJECT     nome do projeto Compose (loja3d-local); volumes <projeto>_db-data, etc.
#   LOJA3D_HTTP_PORT   porta local (18190)
#   LOJA3D_ENV_FILE    ficheiro env de teste, com os segredos gerados por gen-secrets.sh
#                      (por omissão /tmp/loja3d-local/<projeto>.env; nunca dentro do repositório)
#   LOJA3D_BACKUP_DIR  cópias de segurança do migrate (ao lado do ficheiro env)
#   LOJA3D_SKIP_BUILD=1  não reconstrói a imagem do site
#   LOJA3D_SKIP_MIGRATE=1  não corre as migrations
#   LOJA3D_COMPOSE_EXTRA ficheiros Compose extra, separados por ":" (ex.: uma cache do Deno já preenchida só neste
#                      computador). Caminhos absolutos dentro desses ficheiros. Nunca usado no VPS.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
project=${LOJA3D_PROJECT:-loja3d-local}
port=${LOJA3D_HTTP_PORT:-18190}
envf=${LOJA3D_ENV_FILE:-/tmp/loja3d-local/$project.env}
case $envf in "$(cd "$here/.." && pwd)"/*) echo "LOJA3D_ENV_FILE não pode ficar dentro do repositório." >&2; exit 1 ;; esac

LOJA3D_PROJECT=$project bash "$here/gen-secrets.sh" "$envf"
set -a; . "$envf"; set +a
# Os valores deste script ganham aos do ficheiro env.
export LOJA3D_HTTP_PORT=$port
export SITE_URL=${LOJA3D_SITE_URL:-http://127.0.0.1:$port}
export LOJA3D_BACKUP_DIR=${LOJA3D_BACKUP_DIR:-$(dirname "$envf")/backups-$project}
export IMAGE_TAG=${IMAGE_TAG:-$project}
LOJA3D_UID=$(id -u); LOJA3D_GID=$(id -g); export LOJA3D_UID LOJA3D_GID
if [ -z "${ENABLE_EMAIL_AUTOCONFIRM:-}" ]; then
  if [ -n "${SMTP_HOST:-}" ]; then export ENABLE_EMAIL_AUTOCONFIRM=false; else export ENABLE_EMAIL_AUTOCONFIRM=true; fi
fi
mkdir -p "$LOJA3D_BACKUP_DIR"; chmod 700 "$LOJA3D_BACKUP_DIR"

compose_files=(-f "$here/compose.yaml")
if [ -n "${LOJA3D_COMPOSE_EXTRA:-}" ]; then
  IFS=: read -r -a extra_files <<< "$LOJA3D_COMPOSE_EXTRA"
  for x in "${extra_files[@]}"; do [ -z "$x" ] || compose_files+=(-f "$x"); done
fi
compose() { docker compose -p "$project" "${compose_files[@]}" "$@"; }

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
    [ "$SECONDS" -lt "$deadline" ] || { echo "Serviços sem ficar saudáveis:$pending" >&2; compose ps >&2; return 1; }
    sleep 3
  done
}

[ "${LOJA3D_SKIP_BUILD:-0}" = 1 ] || compose build web

services="db auth rest storage"
if [ -f "$here/functions/main/index.ts" ]; then
  services="$services functions"
else
  echo "AVISO: falta deploy/functions/main/index.ts; o serviço functions não arranca." >&2
fi
# shellcheck disable=SC2086
compose up -d $services
# shellcheck disable=SC2086
wait_healthy $services

if [ "${LOJA3D_SKIP_MIGRATE:-0}" = 1 ]; then
  echo "Migrations não aplicadas (LOJA3D_SKIP_MIGRATE=1)."
elif [ -f "$here/migrate.sh" ]; then
  compose run --rm migrate
else
  echo "AVISO: falta deploy/migrate.sh; migrations não aplicadas." >&2
fi

compose up -d --no-deps web
ok=""
for _ in $(seq 60); do
  curl -fs -o /dev/null --max-time 5 "http://127.0.0.1:$port/healthz" && ok=1 && break
  sleep 1
done
[ -n "$ok" ] || { echo "O site não respondeu em http://127.0.0.1:$port/healthz" >&2; exit 1; }
echo "Stack $project pronta: http://127.0.0.1:$port (segredos de teste em $envf)."
echo "Parar: LOJA3D_PROJECT=$project bash deploy/local-down.sh   (com --apagar-dados apaga os volumes)"
