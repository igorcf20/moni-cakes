#!/usr/bin/env bash
# Restaura a Loja 3D a partir das cópias de segurança: a base de dados (pg_dump -Fc) e/ou os ficheiros enviados
# (fotos dos produtos, comprovativos de pagamento, modelos 3D; tar.gz do volume loja3d_storage-data).
# Corre NO VPS, como administrator.
#
# Cópias em ~/loja3d/backups (ver: --listar):
#   loja3d-diaria-AAAAMMDD-HHMMSS.dump         base, todos os dias de madrugada (deploy/backup.sh)
#   loja3d-ficheiros-AAAAMMDD-HHMMSS.tar.gz    ficheiros, na mesma cópia diária (mesma data e hora no nome)
#   loja3d-AAAAMMDD-HHMMSS.dump                base, antes de cada migration nova (deploy/migrate.sh)
#   loja3d-antes-do-restauro-*.dump, loja3d-ficheiros-antes-do-restauro-*.tar.gz   estado antes de um restauro
#
#   bash ~/loja3d/src/deploy/restore.sh --listar                              mostra as cópias disponíveis
#   bash ~/loja3d/src/deploy/restore.sh <cópia.dump>                          restaura a base de dados
#   bash ~/loja3d/src/deploy/restore.sh --ficheiros <cópia.tar.gz>            restaura os ficheiros enviados
#   ... --sim                                                                 sem pergunta (para scripts)
#
# RESTAURAR TUDO como estava num dia (base + ficheiros da mesma cópia diária), num só comando:
#   bash ~/loja3d/src/deploy/restore.sh --listar
#   bash ~/loja3d/src/deploy/restore.sh ~/loja3d/backups/loja3d-diaria-AAAAMMDD-HHMMSS.dump \
#        --ficheiros ~/loja3d/backups/loja3d-ficheiros-AAAAMMDD-HHMMSS.tar.gz
# Primeiro a base, depois os ficheiros (também se pode fazer em dois comandos, por esta ordem). Use as duas
# cópias com a MESMA data e hora: só restaurar uma delas pode deixar fotos sem produto ou produtos sem foto.
#
# Base de dados, por ordem:
#   1. confirma que a cópia é um pg_dump válido (pg_restore --list) e bloqueia o sync.sh e o backup.sh (sync.lock);
#   2. faz uma cópia do estado ATUAL (loja3d-antes-do-restauro-<data>.dump, na mesma pasta), para poder
#      voltar atrás, e só continua se ela se ler até ao fim (pg_restore);
#   3. para o site, o login, a API, os ficheiros e as funções (só a base fica ligada: a loja fica fora do
#      ar durante o restauro);
#   4. restaura numa só transação (pg_restore --clean --if-exists --single-transaction, como supabase_admin):
#      se algo falhar, a base fica exatamente como estava;
#   5. volta a ligar tudo e corre o migrate (aplica as migrations mais novas do que a cópia e volta a
#      gravar no Vault os segredos dos cron jobs).
# Ficheiros, por ordem:
#   1. confirma que o arquivo é um tar.gz legível (tar -tzf) feito pelo backup.sh (começa pela raiz ./, sem
#      caminhos absolutos nem ..) e que há espaço livre para a cópia do estado atual e para o arquivo extraído;
#   2. para só o serviço storage (as fotos e os envios ficam indisponíveis; o resto da loja continua no ar);
#   3. faz uma cópia do volume ATUAL (loja3d-ficheiros-antes-do-restauro-<data>.tar.gz), para poder voltar atrás;
#   4. extrai o arquivo para uma pasta temporária DENTRO do volume (com os atributos user.* onde o storage guarda
#      o tipo de cada ficheiro) e só depois troca o conteúdo: se a extração ou a troca falharem, o volume fica como
#      estava (um ficheiro que não se consiga ler na cópia do estado atual também faz parar antes de mexer);
#   5. volta a ligar o storage e confirma que responde.
# Os contentores auxiliares usam a imagem das funções, que já existe no servidor (nada é descarregado), sem rede.
# Os dados nunca são apagados por este script além do que a própria cópia substitui.
#
# Variáveis opcionais: LOJA3D_PROJECT (loja3d), LOJA3D_ENV_FILE (~/loja3d/env),
# LOJA3D_BACKUP_DIR (~/loja3d/backups), LOJA3D_COMPOSE_EXTRA (ficheiros Compose extra separados por ":",
# só para testes).
set -euo pipefail
# Cópias e registos só para este utilizador (têm dados pessoais: contas, pedidos, comprovativos).
umask 077
here=$(cd "$(dirname "$0")" && pwd)
project=${LOJA3D_PROJECT:-loja3d}
envf=${LOJA3D_ENV_FILE:-$HOME/loja3d/env}

say() { echo "restore: $*"; }
die() { echo "restore: ERRO: $*" >&2; exit 1; }
# stderr original no fd 8: o trap de saída pode correr a meio de uma chamada com o stderr redirecionado (ex.: o
# pg_restore escreve para restauro-erro.log) e as mensagens dele têm de chegar ao ecrã na mesma.
exec 8>&2

dump="" files="" yes=0 list=0
while [ $# -gt 0 ]; do
  case $1 in
    --listar) list=1 ;;
    --sim) yes=1 ;;
    --ficheiros) [ $# -ge 2 ] || die "--ficheiros precisa do arquivo (loja3d-ficheiros-AAAAMMDD-HHMMSS.tar.gz)"
                 [ -z "$files" ] || die "indique só um arquivo de ficheiros"; files=$2; shift ;;
    --ficheiros=*) [ -z "$files" ] || die "indique só um arquivo de ficheiros"; files=${1#--ficheiros=} ;;
    -h|--help) awk 'NR > 1 && /^set -euo pipefail/ {exit} NR > 1' "$0"; exit 0 ;;
    -*) die "opção desconhecida: $1 (use --listar, --ficheiros, --sim ou --help)" ;;
    *) [ -z "$dump" ] || die "indique só uma cópia da base"; dump=$1 ;;
  esac
  shift
done

# Pasta das cópias: a do ambiente, senão a do ficheiro env, senão ~/loja3d/backups.
backups=${LOJA3D_BACKUP_DIR:-}
if [ -z "$backups" ] && [ -f "$envf" ]; then
  # shellcheck disable=SC1090
  backups=$( set +u; set -a; . "$envf" >/dev/null 2>&1; printf '%s' "${LOJA3D_BACKUP_DIR:-}" ) || backups=""
fi
backups=${backups:-$(dirname "$envf")/backups}
case $backups in /*) ;; *) die "LOJA3D_BACKUP_DIR tem de ser um caminho absoluto (ver deploy/env.example)." ;; esac

# Lista um grupo de cópias (da mais recente para a mais antiga): show <título> <padrão>...
show() {
  local title=$1 n=0 f; shift
  echo "  $title:"
  for pat in "$@"; do
    # shellcheck disable=SC2086
    while IFS= read -r f; do
      [ -f "$f" ] || continue
      printf '    %6s  %s\n' "$(du -h "$f" | cut -f1)" "$f"; n=$((n + 1))
    done < <(ls -1t "$backups"/$pat 2>/dev/null || true)
  done
  [ "$n" -gt 0 ] || echo "    (nenhuma)"
}

if [ "$list" = 1 ] || { [ -z "$dump" ] && [ -z "$files" ]; }; then
  say "cópias em $backups (da mais recente para a mais antiga):"
  show "Base de dados, cópias diárias (backup.sh)" 'loja3d-diaria-[0-9]*.dump'
  show "Ficheiros enviados, cópias diárias (backup.sh; mesma data e hora da base)" 'loja3d-ficheiros-[0-9]*.tar.gz'
  show "Base de dados, antes de migrations (migrate.sh)" 'loja3d-[0-9]*.dump'
  show "Estado antes de um restauro (restore.sh)" 'loja3d-antes-do-restauro-*.dump' 'loja3d-ficheiros-antes-do-restauro-*.tar.gz'
  if [ "$list" != 1 ]; then
    echo "Uso: bash $0 <cópia.dump> [--ficheiros <cópia.tar.gz>] [--sim]   (ou só --ficheiros <cópia.tar.gz>)"
    exit 2
  fi
  exit 0
fi

[ -z "$dump" ] || [ -f "$dump" ] || die "cópia não encontrada: $dump"
[ -z "$files" ] || [ -f "$files" ] || die "arquivo de ficheiros não encontrado: $files"
[ -f "$envf" ] || die "falta o ficheiro de variáveis $envf"
set -a
# shellcheck disable=SC1090
. "$envf"
set +a
port=${LOJA3D_HTTP_PORT:-8190}

compose_files=(-f "$here/compose.yaml")
if [ -n "${LOJA3D_COMPOSE_EXTRA:-}" ]; then
  IFS=: read -r -a extra_files <<< "$LOJA3D_COMPOSE_EXTRA"
  for x in "${extra_files[@]}"; do [ -z "$x" ] || compose_files+=(-f "$x"); done
fi
compose() { docker compose -p "$project" "${compose_files[@]}" "$@"; }

# Nada de deploy automático nem de cópia diária a meio do restauro (o sync.sh e o backup.sh usam o mesmo bloqueio).
exec 9>"$(dirname "$envf")/sync.lock"
flock -n 9 || die "outro processo da loja está a correr (deploy sync.sh, cópia diária backup.sh ou outro restauro); tente de novo dentro de alguns minutos."

db_id=$(compose ps -q db 2>/dev/null || true)
[ -n "$db_id" ] && [ "$(docker inspect -f '{{.State.Running}}' "$db_id" 2>/dev/null)" = true ] \
  || die "a base de dados do projeto $project não está a correr."

tmp_in_db=/tmp/loja3d-restauro.dump
storage_stopped=0 all_stopped=0 work_files=()
start_all() {
  compose start rest auth storage functions >/dev/null 2>&1 || true
  compose start web >/dev/null 2>&1 || true
  all_stopped=0 storage_stopped=0
}
cleanup() {
  [ -z "$dump" ] || compose exec -T db rm -f "$tmp_in_db" >/dev/null 2>&1 || true
  [ "${#work_files[@]}" -eq 0 ] || rm -f "${work_files[@]}"
  # Nunca deixar a loja (ou só o storage) parada por causa de um erro ou de uma interrupção deste script.
  if [ "$all_stopped" = 1 ]; then
    echo "restore: o restauro da base foi interrompido; a voltar a ligar os serviços. A base fica toda restaurada ou como" >&8
    echo "restore: estava (uma só transação). Para a pôr em dia com o código (migrate e Vault): bash ~/loja3d/sync.sh force" >&8
    start_all
  elif [ "$storage_stopped" = 1 ]; then
    compose start storage >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Imagem auxiliar (GNU tar com atributos estendidos): a das funções, que já existe no servidor.
vol="${project}_storage-data" img=""
helper_image() {
  local id i=""
  id=$(compose ps -a -q functions 2>/dev/null | head -n 1 || true)
  [ -z "$id" ] || i=$(docker inspect -f '{{.Image}}' "$id" 2>/dev/null || true)
  [ -n "$i" ] || i=$(compose config --images 2>/dev/null | grep -m 1 '^supabase/edge-runtime:' || true)
  [ -n "$i" ] && docker image inspect "$i" >/dev/null 2>&1 || return 1
  printf '%s' "$i"
}
# Contentores descartáveis sobre o volume dos ficheiros: sem rede, sem registo, só as capacidades precisas.
run_ro() {
  docker run --rm --pull never --network none --log-driver none --security-opt no-new-privileges:true \
    --cap-drop ALL --cap-add DAC_READ_SEARCH --label loja3d.restore=ficheiros \
    -v "$vol:/dados:ro" --entrypoint sh "$img" -c 'exec nice -n 10 "$@"' sh "$@"
}
run_rw() {
  docker run --rm -i --pull never --network none --log-driver none --security-opt no-new-privileges:true \
    --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add FSETID \
    --label loja3d.restore=ficheiros -v "$vol:/dados" --entrypoint sh "$img" -c "$@"
}
tar_volume() { # tar_volume <destino.part>: arquivo do volume, como o backup.sh (um ficheiro ilegível faz falhar)
  run_ro tar --create --gzip --file=- --directory=/dados --numeric-owner --xattrs --xattrs-include='user.*' \
    --exclude=./.loja3d-restauro-novo --exclude=./.loja3d-restauro-antigo . > "$1"
}
kb_free() { df -Pk "$1" | awk 'NR==2 {print $4}'; }

# 1. Verificações antes de parar o que quer que seja.
if [ -n "$dump" ]; then
  cp_out=$(compose cp "$dump" "db:$tmp_in_db" 2>&1) || die "não consegui copiar a cópia para o contentor da base: $cp_out"
  compose exec -T db pg_restore --list "$tmp_in_db" >/dev/null 2>&1 \
    || die "$dump não é uma cópia válida (pg_restore --list falhou). Nada foi alterado."
  # Espaço para a cópia do estado atual da base (estimativa: o tamanho da cópia a restaurar), com 100 MB de margem.
  mkdir -p "$backups"; chmod 700 "$backups"
  est_kb=$(( $(stat -c %s "$dump") / 1024 ))
  [ "$(kb_free "$backups")" -ge $((est_kb + 102400)) ] \
    || die "espaço insuficiente em $backups para a cópia do estado atual da base: ~$((est_kb / 1024 + 100)) MB precisos, $(($(kb_free "$backups") / 1024)) MB livres. Nada foi alterado."
fi
if [ -n "$files" ]; then
  command -v tar >/dev/null 2>&1 || die "falta o comando tar."
  docker volume inspect "$vol" >/dev/null 2>&1 || die "o volume $vol não existe."
  img=$(helper_image) || die "não encontrei neste servidor a imagem das funções (supabase/edge-runtime); não descarrego imagens novas."
  names=$(mktemp); listing=$(mktemp); work_files+=("$names" "$listing")
  tar -tzf "$files" > "$names" 2>/dev/null && tar -tvzf "$files" > "$listing" 2>/dev/null \
    || die "$files não é um tar.gz válido (tar -tzf falhou). Nada foi alterado."
  [ "$(head -n 1 "$names")" = "./" ] \
    || die "$files não começa pela raiz ./ (não parece uma cópia do backup.sh). Nada foi alterado."
  ! grep -qE '^/|(^|/)\.\.(/|$)' "$names" \
    || die "$files tem caminhos absolutos ou com '..'; recusado. Nada foi alterado."
  # As pastas temporárias da troca (passo 4) nunca entram numa cópia do backup.sh; com elas a troca colidia.
  ! grep -qE '^\./\.loja3d-restauro-(novo|antigo)(/|$)' "$names" \
    || die "$files tem as pastas temporárias do restauro (.loja3d-restauro-*); recusado. Nada foi alterado."
  n_files=$(grep -c '^-' "$listing" || true)
  need_kb=$(awk '{s += $3} END {print int(s / 1024) + 1}' "$listing")
  grep -q '^\./loja3d/' "$names" \
    || say "AVISO: o arquivo não tem a pasta loja3d/ (nenhum ficheiro da loja); o volume vai ficar vazio."
  # Espaço: a cópia do estado atual vai para a pasta das cópias; o arquivo é extraído dentro do volume, ao lado
  # do conteúdo atual, até à troca. Margem de 100 MB em cada disco.
  read -r cur_kb vol_free_kb vol_dev < <(run_ro sh -c \
    'echo "$(du -sk /dados | cut -f1) $(df -Pk /dados | awk "NR==2 {print \$4}") $(stat -c %d /dados)"') \
    || die "não consegui ler o volume $vol."
  mkdir -p "$backups"; chmod 700 "$backups"
  bk_free_kb=$(kb_free "$backups")
  if [ "$(stat -c %d "$backups")" = "$vol_dev" ]; then
    [ "$bk_free_kb" -ge $((cur_kb + need_kb + 102400)) ] \
      || die "espaço insuficiente: são precisos ~$(((cur_kb + need_kb) / 1024 + 100)) MB livres (cópia do estado atual + arquivo extraído) e há $((bk_free_kb / 1024)) MB. Nada foi alterado."
  else
    [ "$bk_free_kb" -ge $((cur_kb + 102400)) ] \
      || die "espaço insuficiente em $backups para a cópia do estado atual: ~$((cur_kb / 1024 + 100)) MB precisos, $((bk_free_kb / 1024)) MB livres. Nada foi alterado."
    [ "$vol_free_kb" -ge $((need_kb + 102400)) ] \
      || die "espaço insuficiente no disco dos volumes Docker para extrair o arquivo: ~$((need_kb / 1024 + 100)) MB precisos, $((vol_free_kb / 1024)) MB livres. Nada foi alterado."
  fi
fi

if [ "$yes" != 1 ]; then
  [ -t 0 ] || die "sem terminal para confirmar; use --sim."
  [ -z "$dump" ] || { echo "Vai SUBSTITUIR a base de dados do projeto $project pelo conteúdo de:"; echo "  $dump"; }
  [ -z "$files" ] || { echo "Vai SUBSTITUIR os ficheiros enviados (volume $vol) por $n_files ficheiro(s) de:"; echo "  $files"; }
  echo "Durante o restauro, a loja (base) ou as fotos e envios (ficheiros) ficam fora do ar."
  echo "Antes disso é feita uma cópia do estado atual."
  read -r -p "Escreva RESTAURAR para continuar: " answer
  [ "$answer" = RESTAURAR ] || die "cancelado. Nada foi alterado."
fi

# Site, login e ficheiros a responder pelo gateway (até 2 minutos).
wait_site() {
  local ok="" _
  for _ in $(seq 60); do
    curl -fs -o /dev/null --max-time 5 "http://127.0.0.1:$port/healthz" \
      && curl -fs -o /dev/null --max-time 5 "http://127.0.0.1:$port/auth/v1/health" \
      && curl -fs -o /dev/null --max-time 5 "http://127.0.0.1:$port/storage/v1/status" && ok=1 && break
    sleep 2
  done
  [ -n "$ok" ]
}

restore_db() {
  # 2. Cópia do estado atual.
  mkdir -p "$backups"; chmod 700 "$backups"
  safety="$backups/loja3d-antes-do-restauro-$(date -u '+%Y%m%d-%H%M%S').dump"
  work_files+=("$safety.part")
  ( umask 077; compose exec -T db pg_dump -U supabase_admin -d postgres -Fc -Z 6 > "$safety.part" ) \
    || die "a cópia do estado atual falhou. Nada foi alterado."
  # Só se avança com uma cópia do estado atual que se lê até ao fim (sem ela não há como desfazer o restauro):
  # um disco cheio a meio, por exemplo, deixava um ficheiro cortado.
  compose exec -T db pg_restore -f /dev/null < "$safety.part" > /dev/null 2>&1 \
    || die "a cópia do estado atual não se consegue ler até ao fim (disco cheio?). Nada foi alterado."
  { sync "$safety.part" && mv "$safety.part" "$safety"; } || die "não consegui gravar a cópia do estado atual. Nada foi alterado."
  say "estado atual da base guardado em $safety"

  # 3. Parar tudo menos a base (sem ligações abertas durante o restauro).
  say "a parar site, login, API, ficheiros e funções..."
  all_stopped=1
  compose stop web functions storage auth rest >/dev/null 2>&1 || true

  # 4. Restaurar numa só transação.
  say "a restaurar a base (pode demorar alguns minutos)..."
  if ! compose exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists \
       --single-transaction --exit-on-error "$tmp_in_db" > /dev/null 2> "$backups/restauro-erro.log"; then
    start_all
    sed 's/^/  pg_restore: /' "$backups/restauro-erro.log" | tail -n 20 >&2
    die "o restauro falhou e foi desfeito: a base ficou como estava. Detalhes em $backups/restauro-erro.log"
  fi
  rm -f "$backups/restauro-erro.log"

  # 5. Voltar a ligar e pôr a base em dia com o código atual.
  start_all
  export LOJA3D_BACKUP_DIR=$backups
  LOJA3D_UID=$(id -u); LOJA3D_GID=$(id -g); export LOJA3D_UID LOJA3D_GID
  compose run --rm --no-deps migrate || die "base restaurada, mas o migrate falhou (ver acima). O site já está ligado."
  wait_site || die "base restaurada, mas o site não respondeu em 127.0.0.1:$port. Veja: docker compose -p $project ps"
  say "concluído: base restaurada a partir de $(basename "$dump")."
  say "para desfazer a base: bash $(printf '%q' "$0") $(printf '%q' "$safety")"
}

restore_files() {
  local stamp safety rc=0 deadline st sid
  stamp=$(date -u '+%Y%m%d-%H%M%S')
  safety="$backups/loja3d-ficheiros-antes-do-restauro-$stamp.tar.gz"

  # 2. Parar só o storage (nada escreve no volume durante a troca).
  say "a parar o serviço de ficheiros (storage)..."
  storage_stopped=1
  compose stop storage >/dev/null 2>&1 || die "não consegui parar o storage. Nada foi alterado."

  # 3. Cópia do volume atual, verificada.
  work_files+=("$safety.part")
  ( umask 077; tar_volume "$safety.part" ) 2> >(sed 's/^/  tar: /' >&2) || rc=$?
  # GNU tar: 1 = ficheiro alterado durante a leitura (não deve acontecer com o storage parado); arquivo válido.
  [ "$rc" -le 1 ] && tar -tzf "$safety.part" >/dev/null 2>&1 \
    || die "a cópia do estado atual dos ficheiros falhou. Nada foi alterado (o storage volta a ser ligado)."
  { sync "$safety.part" && mv "$safety.part" "$safety"; } \
    || die "não consegui gravar a cópia do estado atual dos ficheiros. Nada foi alterado (o storage volta a ser ligado)."
  say "estado atual dos ficheiros guardado em $safety"

  # 4. Extrair para uma pasta temporária dentro do volume e trocar no fim (renomear no mesmo disco).
  say "a restaurar os ficheiros ($n_files)..."
  rc=0
  run_rw '
    set -u
    cd /dados || exit 2
    novo=.loja3d-restauro-novo antigo=.loja3d-restauro-antigo
    rm -rf "$novo" "$antigo" && mkdir "$novo" || exit 2
    if ! tar --extract --gzip --file=- --directory="$novo" --numeric-owner --same-owner --same-permissions \
         --xattrs --xattrs-include="user.*"; then
      rm -rf "$novo"; echo "a extração falhou; o volume ficou como estava." >&2; exit 3
    fi
    mkdir "$antigo" || { rm -rf "$novo"; exit 3; }
    if ! find . -mindepth 1 -maxdepth 1 ! -name "$novo" ! -name "$antigo" -exec mv -t "$antigo" -- {} +; then
      find "$antigo" -mindepth 1 -maxdepth 1 -exec mv -t . -- {} + ; rm -rf "$novo"; rmdir "$antigo"
      echo "não consegui afastar o conteúdo atual; o volume ficou como estava." >&2; exit 3
    fi
    if ! find "$novo" -mindepth 1 -maxdepth 1 -exec mv -t . -- {} +; then
      # Desfazer: na raiz só estão entradas vindas do arquivo (o conteúdo atual está todo em $antigo).
      find . -mindepth 1 -maxdepth 1 ! -name "$novo" ! -name "$antigo" -exec rm -rf -- {} +
      if find "$antigo" -mindepth 1 -maxdepth 1 -exec mv -t . -- {} + && rmdir "$antigo"; then
        rm -rf "$novo"; echo "a troca falhou a meio e foi desfeita; o volume ficou como estava." >&2; exit 3
      fi
      echo "a troca falhou a meio e não foi possível desfazê-la." >&2; exit 4
    fi
    rmdir "$novo" && rm -rf "$antigo"
  ' < "$files" || rc=$?
  case $rc in
    0) ;;
    3) die "o restauro dos ficheiros falhou e foi desfeito: o volume ficou como estava (o storage volta a ser ligado)." ;;
    *) die "o restauro dos ficheiros falhou a meio (código $rc). Reponha o estado anterior com: bash $(printf '%q' "$0") --ficheiros $(printf '%q' "$safety") --sim" ;;
  esac

  # 5. Voltar a ligar o storage e confirmar que responde.
  compose start storage >/dev/null 2>&1 || die "ficheiros restaurados, mas o storage não arrancou. Veja: docker compose -p $project ps"
  storage_stopped=0
  deadline=$((SECONDS + 180))
  while :; do
    sid=$(compose ps -q storage 2>/dev/null || true); st=missing
    [ -z "$sid" ] || st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$sid" 2>/dev/null || echo missing)
    [ "$st" != healthy ] || break
    [ "$SECONDS" -lt "$deadline" ] || die "ficheiros restaurados, mas o storage não ficou saudável ($st). Veja: docker compose -p $project ps"
    sleep 2
  done
  wait_site || die "ficheiros restaurados, mas o site ou o storage não responderam em 127.0.0.1:$port."
  say "concluído: $n_files ficheiro(s) restaurado(s) a partir de $(basename "$files")."
  say "para desfazer os ficheiros: bash $(printf '%q' "$0") --ficheiros $(printf '%q' "$safety")"
}

[ -z "$dump" ] || restore_db
[ -z "$files" ] || restore_files
