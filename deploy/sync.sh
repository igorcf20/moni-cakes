#!/usr/bin/env bash
# Corre NO VPS (timer de 2 em 2 min). Se a main do GitHub tem commit novo:
#   1. gera os segredos que faltarem em ~/loja3d/env (deploy/gen-secrets.sh; nunca os mostra);
#   2. constrói a imagem nova do site (o site atual continua no ar);
#   3. põe o código novo em ~/loja3d/src e sobe db, auth, rest, storage e functions
#      (os dados ficam nos volumes loja3d_db-data e loja3d_storage-data: nunca são apagados);
#   4. corre o migrate: cópia de segurança + migrations pendentes. Se falhar, o site antigo fica;
#   5. troca o contentor do site e confirma que o site, o login e a API respondem.
# Se algum passo falhar, volta à versão anterior e não repete esse commit.
#   bash ~/loja3d/sync.sh         só se houver commit novo
#   bash ~/loja3d/sync.sh force   reconstrói mesmo sem commit novo (ex.: depois de mudar ~/loja3d/env)
# Em cada execução liga também o timer da cópia diária (loja3d-backup.timer) se ainda não estiver ligado
# (LOJA3D_BACKUP_TIMER=off em ~/loja3d/env deixa-o como estiver). O sync.lock é partilhado com o backup.sh e o
# restore.sh: enquanto um deles corre, o sync.sh sai sem fazer nada e tenta outra vez na vez seguinte.
set -euo pipefail
R=$HOME/loja3d
REPO=${LOJA3D_REPO:-git@github-loja3d:igorcf20/loja3d.git}
# Nome do projeto Compose (volumes loja3d_db-data, etc.). Só se muda para testes.
PROJECT=${LOJA3D_PROJECT:-loja3d}
mkdir -p "$R"
exec 9>"$R/sync.lock"; flock -n 9 || exit 0

# Timer da cópia diária: liga-o (enable --now) se ainda não estiver ligado, sem reiniciar mais nada. Corre também
# sem commit novo, para apanhar o primeiro deploy que trouxe a unidade (feito ainda pelo sync.sh anterior).
backup_timer() {
  local u=loja3d-backup.timer off
  [ -f "$HOME/.config/systemd/user/$u" ] && [ -f "$R/src/deploy/backup.sh" ] || return 0
  command -v systemctl >/dev/null 2>&1 || return 0
  off=$(sed -n 's/^[[:space:]]*LOJA3D_BACKUP_TIMER=//p' "$R/env" 2>/dev/null | tail -n 1 | tr -d "\"' ")
  [ "$off" != off ] || return 0
  if ! systemctl --user is-enabled --quiet "$u" 2>/dev/null; then
    if systemctl --user enable --now "$u" >/dev/null 2>&1; then
      echo "Timer $u ligado (cópia diária da base e dos ficheiros)."
      # Sem linger, os timers do utilizador param quando a última sessão SSH fecha (a cópia de madrugada não corre).
      [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || true)" != no ] \
        || echo "AVISO: sem linger, as cópias diárias só correm com uma sessão aberta: sudo loginctl enable-linger $(id -un)" >&2
    else echo "AVISO: não consegui ligar o $u (cópias diárias)." >&2; fi
  elif ! systemctl --user is-active --quiet "$u" 2>/dev/null; then
    systemctl --user start "$u" >/dev/null 2>&1 || echo "AVISO: não consegui arrancar o $u (cópias diárias)." >&2
  fi
  return 0
}
backup_timer

[ -d "$R/repo" ] || git clone -q --bare "$REPO" "$R/repo"
git -C "$R/repo" fetch -q origin +main:main
sha=$(git -C "$R/repo" rev-parse main); tag=${sha:0:12}
[ "${1:-}" = force ] || [ "$sha" != "$(cat "$R/current-sha" 2>/dev/null)" ] || exit 0
[ "${1:-}" = force ] || [ "$sha" != "$(cat "$R/failed-sha" 2>/dev/null)" ] || exit 0

prev=$(cat "$R/current-sha" 2>/dev/null || true)
new=$R/src.new
swapped=0 web_swapped=0

compose() { docker compose -p "$PROJECT" -f "$R/src/deploy/compose.yaml" "$@"; }

# Espera que os serviços fiquem saudáveis (ou só "running", se não tiverem healthcheck).
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
    [ "$SECONDS" -lt "$deadline" ] || { echo "Serviços sem ficar saudáveis:$pending" >&2; return 1; }
    sleep 3
  done
}

# Site, login e API a responder pelo gateway. O /rest/v1/ do PostgREST responde 404 (PGRST126, descrição
# OpenAPI desligada no compose); um 502/504 do nginx quer dizer que o REST não está a responder.
site_ok() {
  local base="http://127.0.0.1:$port" rest
  curl -fsS -o /dev/null --max-time 5 "$base/healthz" &&
  curl -fsS -o /dev/null --max-time 5 "$base/auth/v1/health" &&
  rest=$(curl -sS --max-time 5 -H "apikey: $ANON_KEY" "$base/rest/v1/") &&
  case $rest in *PGRST126*|*'"swagger"'*) true ;; *) false ;; esac
}

rollback() {
  rc=$?
  [ "$rc" -ne 0 ] || return 0
  set +e
  echo "$sha" > "$R/failed-sha"
  if [ "$swapped" -eq 1 ] && [ -d "$R/src.prev" ]; then
    rm -rf "$R/src.failed"; mv "$R/src" "$R/src.failed"; mv "$R/src.prev" "$R/src"
    # As funções voltam ao código anterior; o site volta à imagem anterior se já tinha sido trocado.
    compose up -d --no-deps --force-recreate functions >/dev/null 2>&1
    if [ "$web_swapped" -eq 1 ] && [ -n "$prev" ]; then IMAGE_TAG=${prev:0:12} compose up -d --no-deps web; fi
  fi
  rm -rf "$new"
  echo "SYNC FALHOU em ${sha:0:7}; versão anterior mantida (código em $R/src.failed)" >&2
}
trap rollback EXIT

rm -rf "$new"; mkdir -p "$new"
git -C "$R/repo" archive main | tar -x -C "$new"

# Segredos que faltarem (nunca impressos) e variáveis do servidor.
LOJA3D_PROJECT=$PROJECT bash "$new/deploy/gen-secrets.sh" "$R/env"
set -a; . "$R/env"; set +a
port=${LOJA3D_HTTP_PORT:-8190}
export LOJA3D_BACKUP_DIR=${LOJA3D_BACKUP_DIR:-$R/backups}
mkdir -p "$LOJA3D_BACKUP_DIR"; chmod 700 "$LOJA3D_BACKUP_DIR"
LOJA3D_UID=$(id -u); LOJA3D_GID=$(id -g); export LOJA3D_UID LOJA3D_GID
# Sem SMTP, as contas ficam ativas no registo; com SMTP, pedem confirmação por e-mail.
if [ -z "${ENABLE_EMAIL_AUTOCONFIRM:-}" ]; then
  if [ -n "${SMTP_HOST:-}" ]; then export ENABLE_EMAIL_AUTOCONFIRM=false; else export ENABLE_EMAIL_AUTOCONFIRM=true; fi
fi
[ -z "${VITE_SUPABASE_URL:-}" ] || echo "AVISO: VITE_SUPABASE_URL em $R/env já não é usado (o site usa o próprio domínio); pode apagar a linha."

# 1. Imagem nova do site (não mexe no que está no ar).
IMAGE_TAG=$tag nice -n 19 docker compose -p "$PROJECT" -f "$new/deploy/compose.yaml" build web

# 2. Código novo em $R/src (caminho fixo dos volumes dos contentores). O anterior fica em src.prev.
rm -rf "$R/src.prev"
[ ! -d "$R/src" ] || mv "$R/src" "$R/src.prev"
mv "$new" "$R/src"; swapped=1

# 3. Backend. As funções são recriadas para lerem o código novo.
compose up -d db auth rest storage
compose up -d --no-deps --force-recreate functions
wait_healthy db auth rest storage functions

# 4. Cópia de segurança + migrations pendentes (para aqui se alguma falhar).
compose run --rm migrate

# 5. Site novo.
IMAGE_TAG=$tag compose up -d --no-deps web; web_swapped=1
ok=""; for _ in $(seq 60); do site_ok 2>/dev/null && ok=1 && break; sleep 1; done
[ -n "$ok" ] || { echo "O site novo não respondeu em /healthz, /auth/v1/health ou /rest/v1/." >&2; exit 1; }

# Unidades systemd e este script vêm do repositório (só recarrega se mudaram).
mkdir -p "$HOME/.config/systemd/user"; reload=0
for u in "$R"/src/deploy/*.service "$R"/src/deploy/*.timer; do
  cmp -s "$u" "$HOME/.config/systemd/user/$(basename "$u")" || { cp "$u" "$HOME/.config/systemd/user/"; reload=1; }
done
[ $reload -eq 0 ] || systemctl --user daemon-reload
backup_timer
cp "$R/src/deploy/sync.sh" "$R/sync.sh.new" && mv "$R/sync.sh.new" "$R/sync.sh"
rm -rf "$R/src.prev" "$R/src.failed"
echo "$sha" > "$R/current-sha"; rm -f "$R/failed-sha"
# guarda as 3 imagens mais recentes do site para poder voltar atrás (docker image ls lista da mais nova para a mais antiga)
docker image ls loja3d-web --format '{{.Tag}}' | grep -E '^[0-9a-f]{12}$' | tail -n +4 | xargs -r -I{} docker image rm -f "loja3d-web:{}" >/dev/null || true
echo "SYNC OK ${sha:0:7}"
