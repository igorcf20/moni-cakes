#!/usr/bin/env bash
# Preparação ÚNICA no VPS, como administrator (com acesso ao Docker). Correr duas vezes:
#   1.ª vez: cria a chave de leitura do GitHub e mostra-a para cadastrar no repositório.
#   2.ª vez (depois de cadastrar a chave): gera os segredos, sobe a stack completa (base de dados, login,
#            ficheiros, funções e site), aplica as migrations e liga a atualização automática.
# A partir daí, cada push na main é publicado sozinho em até ~2 minutos (mais o tempo do build).
# Tudo fica em ~/monicakes e nos volumes Docker do projeto loja3d; só usa a porta local LOJA3D_HTTP_PORT (8191).
set -euo pipefail
R=$HOME/monicakes; KEY=$HOME/.ssh/monicakes_deploy
REPO=${LOJA3D_REPO:-git@github-monicakes:igorcf20/moni-cakes.git}
mkdir -p "$R" "$HOME/.ssh" "$HOME/.config/systemd/user"; chmod 700 "$HOME/.ssh" "$R"
[ -f "$R/env" ] || { ( umask 077; : > "$R/env" ); }
chmod 600 "$R/env"

if [ ! -f "$KEY" ]; then
  ssh-keygen -q -t ed25519 -N "" -C "monicakes-vps-deploy" -f "$KEY"
  grep -q "Host github-monicakes" "$HOME/.ssh/config" 2>/dev/null || printf '\nHost github-monicakes\n  HostName github.com\n  User git\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$KEY" >> "$HOME/.ssh/config"
  chmod 600 "$HOME/.ssh/config"
  echo "1) No GitHub: repositório > Settings > Deploy keys > Add deploy key, SEM permissão de escrita, com esta chave:"
  cat "$KEY.pub"
  echo "2) Opcional: ajustar $R/env com base em deploy/env.example (SITE_URL, SMTP...)."
  echo "   Os segredos (base de dados e chaves) são gerados sozinhos no passo seguinte."
  echo "3) Correr este script outra vez."
  exit 0
fi

# ssh -T ao GitHub sai sempre com código 1: guardar a saída antes de procurar (por causa do pipefail).
auth=$(ssh -o StrictHostKeyChecking=accept-new -T git@github-monicakes 2>&1 || true)
grep -q "successfully authenticated" <<<"$auth" || { echo "A chave ainda não foi aceite pelo GitHub (Deploy keys)."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Este utilizador não tem acesso ao Docker."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Falta o plugin docker compose."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "Falta o curl (usado para confirmar que o site responde)."; exit 1; }
port=$(sed -n 's/^LOJA3D_HTTP_PORT=//p' "$R/env" | tail -n 1); port=${port:-8191}
busy=$(ss -ltnH "sport = :$port" 2>/dev/null || true)
[ -z "$busy" ] || [ -f "$R/current-sha" ] || { echo "A porta $port já está ocupada. Escolha outra em LOJA3D_HTTP_PORT ($R/env)."; exit 1; }
# A stack usa até ~1,5 GB de memória (limites por serviço em deploy/compose.yaml).
avail=$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
[ "$avail" -ge 1600 ] || [ -f "$R/current-sha" ] || echo "AVISO: só ${avail} MB de memória livre; a stack da loja usa até ~1,5 GB."
# Sem linger, o timer do utilizador para quando a sessão SSH fecha.
[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ] || echo "AVISO: correr 'sudo loginctl enable-linger $USER' para o timer funcionar sem sessão aberta."

tmp=$(mktemp -d); git clone -q --depth 1 "$REPO" "$tmp/r"
# Segredos que faltarem em ~/monicakes/env (nunca são mostrados).
LOJA3D_PROJECT=monicakes bash "$tmp/r/deploy/gen-secrets.sh" "$R/env"
cp "$tmp/r/deploy/sync.sh" "$R/sync.sh"
cp "$tmp/r/deploy/"monicakes-*.service "$tmp/r/deploy/"monicakes-*.timer "$HOME/.config/systemd/user/"
# Descarrega já as imagens da base, login, API, ficheiros e funções (cerca de 4 GB na 1.ª vez).
echo "A descarregar as imagens Docker (pode demorar alguns minutos na primeira vez)..."
( set -a; . "$R/env"; set +a; docker compose -p monicakes -f "$tmp/r/deploy/compose.yaml" pull db auth rest storage functions ) \
  || echo "AVISO: não consegui descarregar as imagens agora; o sync.sh tenta outra vez."
rm -rf "$tmp"
systemctl --user daemon-reload
bash "$R/sync.sh" force
systemctl --user enable --now monicakes-sync.timer
# Cópia diária da base e dos ficheiros enviados (deploy/backup.sh), de madrugada.
systemctl --user enable --now monicakes-backup.timer
echo "Pronto. Site em http://127.0.0.1:$port (no VPS). Pré-visualizar do seu computador: ssh -N -L $port:127.0.0.1:$port integranext-vps"
echo "Quando o domínio apontar para esta porta (nginx do servidor com Host, X-Forwarded-For e X-Forwarded-Proto):"
echo "  definir SITE_URL=https://seu-dominio em $R/env e correr: bash $R/sync.sh force"
echo "Cópias de segurança em $R/backups: base e ficheiros enviados todos os dias de madrugada (monicakes-backup.timer)"
echo "  e a base antes de cada migration nova. Fazer uma já: systemctl --user start monicakes-backup.service"
echo "  Registo: journalctl --user -u monicakes-backup   Próxima: systemctl --user list-timers monicakes-backup.timer"
echo "  As cópias ficam só neste VPS até definir LOJA3D_BACKUP_REMOTE em $R/env (ver deploy/env.example)."
echo "Restaurar: bash $R/src/deploy/restore.sh --listar   (e depois com o nome do ficheiro; ver o topo do script)"
