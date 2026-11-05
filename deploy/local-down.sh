#!/usr/bin/env bash
# Para a stack de testes criada por deploy/local-up.sh.
#   bash deploy/local-down.sh                  para os contentores (os dados ficam nos volumes)
#   bash deploy/local-down.sh --apagar-dados   apaga também volumes (base de dados, ficheiros) e a imagem do site
# Variáveis: LOJA3D_PROJECT (loja3d-local), LOJA3D_ENV_FILE e LOJA3D_COMPOSE_EXTRA (iguais aos do local-up.sh).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
project=${LOJA3D_PROJECT:-loja3d-local}
# O projeto monicakes é a loja real do VPS: este script de testes nunca lhe apaga os dados.
if { [ "$project" = monicakes ] || [ "$project" = loja3d ]; } && [ "${1:-}" = --apagar-dados ]; then
  echo "local-down: recusado. O projeto $project é uma loja real (volumes monicakes_db-data e monicakes_storage-data)." >&2
  exit 2
fi
envf=${LOJA3D_ENV_FILE:-/tmp/loja3d-local/$project.env}
if [ -f "$envf" ]; then
  set -a; . "$envf"; set +a
else
  # O Compose exige estas variáveis para ler o ficheiro, mesmo só para parar.
  export POSTGRES_PASSWORD=x JWT_SECRET=x ANON_KEY=x SERVICE_ROLE_KEY=x
fi
args=(down --remove-orphans)
[ "${1:-}" != --apagar-dados ] || args+=(-v)
compose_files=(-f "$here/compose.yaml")
if [ -n "${LOJA3D_COMPOSE_EXTRA:-}" ]; then
  IFS=: read -r -a extra_files <<< "$LOJA3D_COMPOSE_EXTRA"
  for x in "${extra_files[@]}"; do [ -z "$x" ] || compose_files+=(-f "$x"); done
fi
docker compose -p "$project" "${compose_files[@]}" --profile tools "${args[@]}"
if [ "${1:-}" = --apagar-dados ]; then
  docker image rm -f "monicakes-web:${IMAGE_TAG:-$project}" >/dev/null 2>&1 || true
  echo "Stack $project parada e dados de teste apagados."
else
  echo "Stack $project parada (dados mantidos nos volumes)."
fi
