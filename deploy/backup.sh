#!/usr/bin/env bash
# Moni Cakes: cópia de segurança DIÁRIA da base de dados e dos ficheiros enviados. Corre NO VPS, como
# administrator, pelo timer systemd de utilizador monicakes-backup.timer (de madrugada) ou à mão:
#   bash ~/monicakes/src/deploy/backup.sh
#   systemctl --user start monicakes-backup.service     (o mesmo pelo systemd; registo: journalctl --user -u monicakes-backup)
#
# O que faz, por ordem:
#   1. espera pelo bloqueio ~/monicakes/sync.lock (o mesmo do sync.sh e do restore.sh): nunca corre a meio de um
#      deploy ou de um restauro, e o sync.sh espera pela vez seguinte enquanto esta cópia corre;
#   2. confirma o espaço livre na pasta das cópias: abaixo de LOJA3D_BACKUP_MIN_FREE_MB não começa (e não deixa
#      o disco da base de dados encher a meio de uma cópia);
#   3. base de dados: pg_dump -Fc pelo serviço migrate (deploy/migrate.sh --backup), no ficheiro
#      loja3d-diaria-AAAAMMDD-HHMMSS.dump, verificado com pg_restore (--list e leitura até ao fim);
#   4. ficheiros enviados (fotos dos produtos, comprovativos de pagamento, modelos 3D): tar.gz do volume
#      <projeto>_storage-data, montado SÓ DE LEITURA num contentor da imagem das funções (já existe no servidor:
#      nada é descarregado; sem rede), com os atributos estendidos user.* onde o storage guarda o tipo de cada
#      ficheiro, no ficheiro loja3d-ficheiros-AAAAMMDD-HHMMSS.tar.gz (mesma data e hora da base), verificado com
#      tar -tzf. Um ficheiro que não se consiga ler (erro de disco, permissão) faz falhar a cópia: nunca conta como
#      boa uma cópia com ficheiros em falta. A base é copiada primeiro: um ficheiro enviado entre as duas cópias
#      fica a mais (sem problema); um apagado entre as duas fica referido na base sem ficheiro (já tinha sido apagado);
#   5. retenção, para cada tipo: guarda as LOJA3D_BACKUP_KEEP_DAILY mais recentes e, das semanas já terminadas
#      (segunda a domingo), a mais recente de cada uma das últimas LOJA3D_BACKUP_KEEP_WEEKLY (normalmente a de
#      domingo). Só apaga cópias de um tipo depois de a cópia nova desse tipo passar a verificação, e nunca apaga
#      a mais recente nem a que acabou de fazer. Não mexe nas cópias de antes das migrations (loja3d-AAAA...dump,
#      retenção do migrate) nem nas de antes de um restauro (loja3d-*antes-do-restauro-*);
#   6. LOJA3D_BACKUP_REMOTE (opcional): envia as cópias novas para fora do VPS (rsync por SSH, ou scp), ou para um
#      disco montado (/caminho/absoluto/). Só aceita servidor:pasta, utilizador@servidor:pasta ou /pasta, com
#      letras, números e . _ - / + = (nada que o rsync, o ssh ou a shell do destino possam ler como opção ou comando);
#   7. resumo curto: nomes, tamanhos, quantas cópias há, espaço livre. Nunca mostra segredos.
# Cada ficheiro é escrito como <nome>.part (chmod 600) e só recebe o nome final depois de verificado.
# Sai com erro (o systemd marca o serviço como falhado) se alguma cópia ou o envio remoto falhar.
#
# Restaurar: deploy/restore.sh (--listar; <cópia.dump>; --ficheiros <cópia.tar.gz>; ver o topo desse script).
#
# Variáveis (em ~/monicakes/env; as definidas no ambiente ao chamar o script ganham às do ficheiro):
#   LOJA3D_BACKUP_DIR (~/monicakes/backups)      LOJA3D_BACKUP_MIN_FREE_MB (2048)
#   LOJA3D_BACKUP_KEEP_DAILY (7)              LOJA3D_BACKUP_KEEP_WEEKLY (4)
#   LOJA3D_BACKUP_REMOTE (vazio = as cópias ficam só neste VPS)
#   LOJA3D_BACKUP_LOCK_WAIT (2700)            segundos de espera pelo bloqueio (um deploy demora até ~40 min)
#   Só para testes: LOJA3D_PROJECT (loja3d), LOJA3D_ENV_FILE (~/monicakes/env), LOJA3D_COMPOSE_EXTRA.
set -euo pipefail
umask 077
export LC_ALL=C

say() { echo "backup: $*"; }
err() { echo "backup: ERRO: $*" >&2; }
die() { err "$*"; exit 1; }

case "${1:-}" in
  "") ;;
  -h|--help) awk 'NR > 1 && /^set -euo pipefail/ {exit} NR > 1' "$0"; exit 0 ;;
  *) die "opção desconhecida: $1 (este script não tem opções; use --help)" ;;
esac

here=$(cd "$(dirname "$0")" && pwd)
project=${LOJA3D_PROJECT:-monicakes}
envf=${LOJA3D_ENV_FILE:-$HOME/monicakes/env}
[ -f "$envf" ] || die "falta o ficheiro de variáveis $envf"
for c in docker flock tar df awk date; do command -v "$c" >/dev/null 2>&1 || die "falta o comando $c."; done

# Ambiente primeiro, ficheiro env depois, e o que já vinha no ambiente volta a ganhar.
keep_env=$(declare -p LOJA3D_BACKUP_DIR LOJA3D_BACKUP_KEEP_DAILY LOJA3D_BACKUP_KEEP_WEEKLY \
  LOJA3D_BACKUP_MIN_FREE_MB LOJA3D_BACKUP_REMOTE LOJA3D_BACKUP_LOCK_WAIT 2>/dev/null || true)
set -a
# shellcheck disable=SC1090
. "$envf"
set +a
eval "$keep_env"

backups=${LOJA3D_BACKUP_DIR:-$(dirname "$envf")/backups}
# Caminho absoluto: o Compose leria um relativo a partir de deploy/ (dentro de ~/monicakes/src, substituído em cada deploy).
case $backups in /*) ;; *) die "LOJA3D_BACKUP_DIR tem de ser um caminho absoluto (ver deploy/env.example)." ;; esac
remote=${LOJA3D_BACKUP_REMOTE:-}
# Destino remoto: validado já (antes de qualquer cópia); um valor inválido não impede as cópias locais, mas o
# serviço termina com erro. O valor nunca é mostrado.
remote_kind=""
if [ -n "$remote" ]; then
  if [[ $remote =~ ^/[A-Za-z0-9._/+=-]*$ ]]; then
    remote_kind=local
  elif [[ $remote =~ ^([A-Za-z0-9._][A-Za-z0-9._-]*@)?[A-Za-z0-9][A-Za-z0-9._-]*:([A-Za-z0-9._/+=][A-Za-z0-9._/+=-]*)?$ ]]; then
    remote_kind=ssh
  else
    remote_kind=invalid
    err "LOJA3D_BACKUP_REMOTE tem um formato inválido: use servidor:/pasta/, utilizador@servidor:/pasta/ ou /pasta/local/,"
    err "só com letras, números e . _ - / + = (sem espaços nem ~). As cópias locais fazem-se na mesma; nada é enviado."
  fi
fi
num() { # nome valor-por-omissão: número inteiro >= 0, senão erro claro
  local v=${!1:-$2}
  [[ $v =~ ^[0-9]+$ ]] || die "$1 tem de ser um número inteiro (ver deploy/env.example)."
  printf '%s' "$((10#$v))"
}
keep_daily=$(num LOJA3D_BACKUP_KEEP_DAILY 7)
keep_weekly=$(num LOJA3D_BACKUP_KEEP_WEEKLY 4)
min_free=$(num LOJA3D_BACKUP_MIN_FREE_MB 2048)
lock_wait=$(num LOJA3D_BACKUP_LOCK_WAIT 2700)
if [ "$keep_daily" -lt 1 ]; then say "LOJA3D_BACKUP_KEEP_DAILY=0 não é permitido; guardo pelo menos 1."; keep_daily=1; fi

compose_files=(-f "$here/compose.yaml")
if [ -n "${LOJA3D_COMPOSE_EXTRA:-}" ]; then
  IFS=: read -r -a extra_files <<< "$LOJA3D_COMPOSE_EXTRA"
  for x in "${extra_files[@]}"; do [ -z "$x" ] || compose_files+=(-f "$x"); done
fi
compose() { docker compose -p "$project" "${compose_files[@]}" "$@"; }

# 1. Bloqueio partilhado com o sync.sh (deploy) e o restore.sh.
exec 9>"$(dirname "$envf")/sync.lock"
if ! flock -n 9; then
  [ "$lock_wait" -gt 0 ] || die "um deploy (sync.sh), um restauro ou outra cópia está a correr. Nenhuma cópia feita."
  say "um deploy (sync.sh), um restauro ou outra cópia está a correr; espero até ${lock_wait}s..."
  flock -w "$lock_wait" 9 || die "o deploy, restauro ou cópia continua a correr ao fim de ${lock_wait}s. Nenhuma cópia feita."
fi

started=$SECONDS
mkdir -p "$backups"; chmod 700 "$backups"
# Restos de uma cópia interrompida (com o bloqueio na mão, nada mais escreve estes ficheiros).
rm -f "$backups"/loja3d-diaria-*.part* "$backups"/loja3d-ficheiros-*.part*

# 2. Espaço livre (MB) na pasta das cópias.
free_mb() { df -Pk "$backups" | awk 'NR==2 {print int($4/1024)}'; }
# need_space <MB estimados> <o quê>: falha se, depois da cópia, ficariam menos de min_free MB livres.
need_space() {
  local free; free=$(free_mb)
  if [ $((free - $1)) -lt "$min_free" ]; then
    err "espaço livre insuficiente em $backups para $2: ${free} MB livres, a cópia precisa de ~$1 MB e têm de ficar pelo menos ${min_free} MB livres (LOJA3D_BACKUP_MIN_FREE_MB)."
    err "liberte espaço (cópias antigas nesta pasta, docker system df) ou ajuste o mínimo em $envf."
    return 1
  fi
}
need_space 0 "começar" || die "nenhuma cópia feita."

# A base tem de estar ligada (depois de um arranque do VPS pode demorar um pouco).
db_id="" st=missing deadline=$((SECONDS + 300))
while :; do
  db_id=$(compose ps -q db 2>/dev/null || true)
  st=missing
  [ -z "$db_id" ] || st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$db_id" 2>/dev/null || echo missing)
  [ "$st" != healthy ] || break
  [ "$SECONDS" -lt "$deadline" ] || die "a base de dados do projeto $project não está a correr ($st). Nenhuma cópia feita."
  sleep 3
done

stamp=$(date -u '+%Y%m%d-%H%M%S')
dump_name="loja3d-diaria-$stamp.dump"
files_name="loja3d-ficheiros-$stamp.tar.gz"
failures=() new_files=() removed=()
dump_info="" files_info=""
part="" run_label="monicakes.backup.run=$$-$stamp"
on_exit() {
  [ -z "$part" ] || rm -f "$part" "$part.err" "$part.lst"
  # Contentor auxiliar ainda a ler o volume (ex.: o systemd parou o serviço a meio): parado já, sem ficar órfão.
  docker ps -q --filter "label=$run_label" 2>/dev/null | xargs -r docker rm -f >/dev/null 2>&1 || true
}
trap on_exit EXIT

size_mb() { local b; b=$(stat -c %s "$1" 2>/dev/null || echo 0); echo $(((b + 1048575) / 1048576)); }
human() { du -h "$1" 2>/dev/null | cut -f1; }
# Nomes das cópias de um tipo, da mais antiga para a mais recente (o nome tem a data). Só nomes finais
# (verificados), nunca .part. list_kind <prefixo> <sufixo>, ex.: list_kind loja3d-diaria- .dump
list_kind() {
  local f n re="^${1}[0-9]{8}-[0-9]{6}${2//./\\.}\$"
  for f in "$backups/$1"*"$2"; do
    n=${f##*/}
    if [ -f "$f" ] && [[ $n =~ $re ]]; then printf '%s\n' "$n"; fi
  done
}
newest() { list_kind "$1" "$2" | tail -n 1; }

# 3. Base de dados (pg_dump do próprio migrate.sh, no contentor da imagem da base, com o dono deste utilizador).
db_backup() {
  local prev est out
  # Estimativa: o tamanho da última cópia diária (ou, na primeira, da última de antes de uma migration).
  prev=$(newest loja3d-diaria- .dump); [ -n "$prev" ] || prev=$(newest loja3d- .dump)
  est=0; [ -z "$prev" ] || est=$(size_mb "$backups/$prev")
  need_space "$est" "a cópia da base" || return 1
  export LOJA3D_BACKUP_DIR=$backups
  LOJA3D_UID=$(id -u); LOJA3D_GID=$(id -g); export LOJA3D_UID LOJA3D_GID
  # A imagem do migrate (a mesma da base) tem de já estar neste servidor: nada é descarregado de madrugada.
  # --pull never só existe nas versões mais recentes do Compose; sem ele, a imagem local chega (a política
  # por omissão só descarrega imagens em falta, e esta foi confirmada aqui).
  # (config --images migrate lista também as imagens das dependências, que já estão a correr.)
  local mig_imgs i pull=()
  mig_imgs=$(compose config --images migrate 2>/dev/null) || mig_imgs=""
  [ -n "$mig_imgs" ] || { err "não consegui ler a imagem do serviço migrate (docker compose config)."; return 1; }
  for i in $mig_imgs; do
    docker image inspect "$i" >/dev/null 2>&1 \
      || { err "a imagem $i não está neste servidor; não descarrego imagens novas."; return 1; }
  done
  i=$(compose run --help 2>/dev/null || true)
  case $i in *--pull*) pull=(--pull never) ;; esac
  out=$(mktemp) || return 1
  if ! compose run --rm -T --no-deps ${pull[@]+"${pull[@]}"} -e BACKUP_STAMP="$stamp" migrate --backup 2>&1 | tee "$out"; then
    rm -f "$out"
    err "a cópia da base falhou (ver acima)."
    return 1
  fi
  dump_info=$(sed -n 's/.*cópia diária verificada: .* (\([0-9]*\) entradas no índice).*/\1/p' "$out" | tail -n 1)
  rm -f "$out"
  [ -s "$backups/$dump_name" ] || { err "o migrate terminou mas $dump_name não existe."; return 1; }
  chmod 600 "$backups/$dump_name" || { err "não consegui pôr $dump_name com permissões 600."; return 1; }
}

# Imagem para ler o volume: a das funções (Debian com GNU tar, que guarda os atributos estendidos).
helper_image() {
  local id img=""
  id=$(compose ps -a -q functions 2>/dev/null | head -n 1 || true)
  [ -z "$id" ] || img=$(docker inspect -f '{{.Image}}' "$id" 2>/dev/null || true)
  [ -n "$img" ] || img=$(compose config --images 2>/dev/null | grep -m 1 '^supabase/edge-runtime:' || true)
  [ -n "$img" ] && docker image inspect "$img" >/dev/null 2>&1 || return 1
  printf '%s' "$img"
}

# Contentor descartável para ler o volume: sem rede, sem registo (o arquivo sai pelo stdout), volume só de
# leitura e só a capacidade de ler ficheiros de qualquer dono. Prioridade baixa (ionice/nice) lá dentro.
vol="" img=""
run_ro() {
  docker run --rm --pull never --network none --log-driver none --security-opt no-new-privileges:true \
    --cap-drop ALL --cap-add DAC_READ_SEARCH --label monicakes.backup=ficheiros --label "$run_label" \
    -v "$vol:/dados:ro" --entrypoint sh "$img" -c \
    'if ionice -c 2 -n 7 true 2>/dev/null; then exec ionice -c 2 -n 7 nice -n 19 "$@"; else exec nice -n 19 "$@"; fi' sh "$@"
}

# 4. Ficheiros enviados.
files_backup() {
  local est rc nfiles first
  vol="${project}_storage-data"
  docker volume inspect "$vol" >/dev/null 2>&1 || { err "o volume $vol não existe."; return 1; }
  img=$(helper_image) || { err "não encontrei neste servidor a imagem das funções (supabase/edge-runtime); não descarrego imagens novas."; return 1; }
  est=$(run_ro du -sk /dados 2>/dev/null | awk '{print int(($1 + 1023) / 1024)}') || est=""
  [ -n "$est" ] || { err "não consegui ler o volume $vol."; return 1; }
  need_space "$est" "a cópia dos ficheiros" || return 1
  part="$backups/$files_name.part"
  rc=0
  # Sem --ignore-failed-read: um ficheiro que não se lê (erro de disco, permissão) dá o código 2 e a cópia falha,
  # em vez de ficar de fora em silêncio (a retenção apagaria depois as cópias antigas que ainda o têm).
  run_ro tar --create --gzip --file=- --directory=/dados --numeric-owner \
    --xattrs --xattrs-include='user.*' \
    --exclude=./.loja3d-restauro-novo --exclude=./.loja3d-restauro-antigo . > "$part" 2> "$part.err" || rc=$?
  case $rc in
    0) ;;
    # GNU tar: 1 = um ficheiro mudou ou foi apagado enquanto era lido (envios a decorrer); o arquivo é válido.
    1) say "aviso: houve ficheiros alterados ou apagados durante a cópia (envios a decorrer); ficam na versão lida."
       sed 's/^/  tar: /' "$part.err" | tail -n 5 ;;
    *) sed 's/^/  tar: /' "$part.err" | tail -n 20 >&2
       err "a cópia dos ficheiros falhou (código $rc)."; rm -f "$part" "$part.err"; part=""; return 1 ;;
  esac
  # Verificação: o gzip lê-se até ao fim e o tar lista todas as entradas.
  if ! tar -tvzf "$part" > "$part.lst" 2> "$part.err"; then
    sed 's/^/  tar: /' "$part.err" | tail -n 20 >&2
    err "a cópia dos ficheiros não passou na verificação (tar -tzf); foi apagada."
    rm -f "$part" "$part.err" "$part.lst"; part=""; return 1
  fi
  first=$(head -n 1 "$part.lst" | awk '{print $NF}')
  if [ "$first" != "./" ]; then
    err "a cópia dos ficheiros não começa pela raiz do volume (./); foi apagada."
    rm -f "$part" "$part.err" "$part.lst"; part=""; return 1
  fi
  nfiles=$(grep -c '^-' "$part.lst" || true)
  # Esta função corre dentro de um "if" (sem set -e): cada passo é verificado. sync grava o arquivo no disco
  # antes de lhe dar o nome final (um corte de energia não deixa um arquivo vazio com nome de cópia boa).
  if ! chmod 600 "$part" || ! sync -- "$part" || ! mv -- "$part" "$backups/$files_name"; then
    err "não consegui gravar ou dar o nome final a $files_name; foi apagada."
    rm -f "$part" "$part.err" "$part.lst"; part=""; return 1
  fi
  rm -f "$part.err" "$part.lst"; part=""
  files_info=$nfiles
}

# 5. Retenção de um tipo de cópia: retain <prefixo> <sufixo> <cópia nova, nunca apagada>.
retain() {
  local prefix=$1 suffix=$2 newf=$3 f day week cur_week i=0 nweek=0 keep
  local -a files=()
  local -A seen=()
  mapfile -t files < <(list_kind "$prefix" "$suffix" | sort -r)
  cur_week=$(date -u '+%G-%V')
  for f in "${files[@]}"; do
    keep=0
    [ "$i" -ge "$keep_daily" ] || keep=1
    [ "$i" -ne 0 ] || keep=1              # a mais recente boa
    [ "$f" != "$newf" ] || keep=1         # a que acabou de ser feita
    day=${f#"$prefix"}; day=${day:0:8}
    week=$(date -u -d "$day" '+%G-%V' 2>/dev/null || true)
    # Lista da mais nova para a mais antiga: a 1.ª de cada semana é a mais recente dessa semana.
    if [ -n "$week" ] && [ "$week" != "$cur_week" ] && [ -z "${seen[$week]:-}" ]; then
      seen[$week]=1
      [ "$nweek" -ge "$keep_weekly" ] || keep=1
      nweek=$((nweek + 1))
    fi
    if [ "$keep" = 0 ]; then
      rm -f -- "${backups:?}/$f" && removed+=("$f") && say "cópia antiga removida: $f"
    fi
    i=$((i + 1))
  done
}

if db_backup; then
  new_files+=("$backups/$dump_name")
  retain loja3d-diaria- .dump "$dump_name"
else
  failures+=("base de dados")
fi
if files_backup; then
  new_files+=("$backups/$files_name")
  retain loja3d-ficheiros- .tar.gz "$files_name"
else
  failures+=("ficheiros")
fi

# 6. Cópia para fora do VPS (opcional). Sem palavra-passe: chave SSH (BatchMode), nunca pergunta nada. O destino
#    foi validado no início, e o "--" antes dos nomes impede que o rsync ou o scp leiam algum deles como opção.
remote_status="" same_disk=""
if [ -z "$remote" ]; then
  remote_status="AVISO: sem LOJA3D_BACKUP_REMOTE, as cópias estão só neste VPS (se o disco ou o servidor se perderem, perdem-se também)."
elif [ "$remote_kind" = invalid ]; then
  remote_status="FALHOU: LOJA3D_BACKUP_REMOTE com formato inválido (ver o erro no início); nada enviado. As cópias locais estão boas."
  failures+=("envio remoto")
elif [ "${#new_files[@]}" -eq 0 ]; then
  remote_status="nada enviado para LOJA3D_BACKUP_REMOTE (nenhuma cópia nova)."
else
  rc=0
  if [ "$remote_kind" = local ]; then
    # Disco montado neste servidor (ex.: /mnt/copias/): tem de existir (um disco desmontado não pode virar uma
    # pasta nova no disco do sistema).
    if [ ! -d "$remote" ]; then
      rc=2; err "a pasta de destino de LOJA3D_BACKUP_REMOTE não existe (disco desmontado?)."
    else
      [ "$(stat -c %d "$remote")" != "$(stat -c %d "$backups")" ] || same_disk=1
      if command -v rsync >/dev/null 2>&1; then
        rsync -t --perms --chmod=F600 -- "${new_files[@]}" "$remote" || rc=$?
      else
        for f in "${new_files[@]}"; do
          n=${f##*/}
          { cp -- "$f" "$remote/.$n.part" && chmod 600 "$remote/.$n.part" && mv -- "$remote/.$n.part" "$remote/$n"; } \
            || { rc=1; rm -f -- "$remote/.$n.part"; break; }
        done
      fi
    fi
  else
    ssh_opts="ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=30"
    if command -v rsync >/dev/null 2>&1; then
      # rsync escreve num ficheiro temporário no destino e só no fim lhe dá o nome (atómico).
      rsync -t --perms --chmod=F600 --timeout=600 -e "$ssh_opts" -- "${new_files[@]}" "$remote" || rc=$?
    elif command -v scp >/dev/null 2>&1; then
      scp -q -p -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 -- "${new_files[@]}" "$remote" || rc=$?
    else
      rc=127; err "LOJA3D_BACKUP_REMOTE está definido, mas não há rsync nem scp neste servidor."
    fi
  fi
  if [ "$rc" -eq 0 ]; then
    remote_status="${#new_files[@]} cópia(s) nova(s) enviada(s) para LOJA3D_BACKUP_REMOTE."
    [ -z "$same_disk" ] || remote_status="$remote_status AVISO: o destino está no mesmo disco destas cópias (não as protege se o disco se perder)."
  else
    remote_status="FALHOU o envio para LOJA3D_BACKUP_REMOTE (código $rc); as cópias locais estão boas."
    failures+=("envio remoto")
  fi
fi

# 7. Resumo (sem segredos).
count() { list_kind "$1" "$2" | wc -l; }
say "resumo da cópia $stamp (UTC):"
if [ -f "$backups/$dump_name" ]; then
  say "  base:      $dump_name  $(human "$backups/$dump_name")  verificada${dump_info:+ ($dump_info entradas no índice)}"
else
  say "  base:      FALHOU"
fi
if [ -f "$backups/$files_name" ]; then
  say "  ficheiros: $files_name  $(human "$backups/$files_name")  verificado ($files_info ficheiros)"
else
  say "  ficheiros: FALHOU"
fi
say "  guardadas: $(count loja3d-diaria- .dump) cópias da base e $(count loja3d-ficheiros- .tar.gz) de ficheiros (retenção: $keep_daily diárias + $keep_weekly semanais); removidas agora: ${#removed[@]}"
say "  pasta:     $backups ($(du -sh "$backups" 2>/dev/null | cut -f1) no total; $(free_mb) MB livres)"
say "  remoto:    $remote_status"
say "  duração:   $((SECONDS - started)) s"
# Sem linger, o systemd do utilizador para quando a última sessão SSH fecha e o timer de madrugada não corre.
if command -v loginctl >/dev/null 2>&1; then
  linger=$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || true)
  [ "$linger" != no ] || say "  AVISO: sem linger, o timer das cópias só corre com uma sessão aberta: sudo loginctl enable-linger $(id -un)"
fi
if [ "${#failures[@]}" -gt 0 ]; then
  die "cópia incompleta: falhou ${failures[*]}."
fi
say "concluído."
