#!/usr/bin/env bash
# Liga o domínio público à loja (corre UMA vez no VPS, com sudo):
#   sudo bash ~/loja3d/src/deploy/expose-domain.sh loja3d.kodemi.pt
# Só cria o ficheiro deste subdomínio no nginx do servidor; não altera os outros sites.
# Se o teste do nginx falhar, apaga o ficheiro novo e não recarrega nada.
set -euo pipefail
D=${1:?Indique o domínio, ex.: loja3d.kodemi.pt}
PORT=${LOJA3D_HTTP_PORT:-8190}
HERE=$(cd "$(dirname "$0")" && pwd)
[ "$(id -u)" -eq 0 ] || { echo "Corra com sudo."; exit 1; }
command -v nginx >/dev/null || { echo "nginx não encontrado neste servidor."; exit 1; }

# 1) O DNS do subdomínio tem de apontar para este servidor
ip_dns=$(getent ahostsv4 "$D" | awk '{print $1; exit}' || true)
ip_srv=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
[ -n "$ip_dns" ] || { echo "O DNS de $D ainda não existe. Crie um registo A: ${D%%.*} -> $ip_srv e espere alguns minutos."; exit 1; }
[ "$ip_dns" = "$ip_srv" ] || echo "AVISO: $D aponta para $ip_dns e este servidor é $ip_srv (normal se houver proxy/CDN)."

# 2) A loja tem de estar a responder na porta local
curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/healthz" || { echo "A loja não responde em 127.0.0.1:$PORT. Corra primeiro o bootstrap/sync."; exit 1; }

# 3) Nenhum outro site pode já usar este nome
if grep -rlsE "server_name[^;]*\b${D//./\\.}\b" /etc/nginx | grep -v "loja3d-$D" | grep -q .; then
  echo "Já existe configuração com server_name $D:"; grep -rlsE "server_name[^;]*\b${D//./\\.}\b" /etc/nginx; exit 1
fi

# 4) Ficheiro próprio (sites-available/enabled se existir, senão conf.d)
if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ]; then
  F=/etc/nginx/sites-available/loja3d-$D; L=/etc/nginx/sites-enabled/loja3d-$D
else
  F=/etc/nginx/conf.d/loja3d-$D.conf; L=""
fi
new=0
if [ ! -f "$F" ]; then
  sed -e "s/__DOMAIN__/$D/g" -e "s/__PORT__/$PORT/g" "$HERE/host-nginx/loja3d.conf.template" > "$F"; new=1
  # IPv6 só se os outros sites do servidor já o usam
  grep -rqsE "listen +\[::\]" /etc/nginx --exclude="loja3d-$D*" || sed -i '/listen \[::\]/d' "$F"
  [ -z "$L" ] || ln -sf "$F" "$L"
fi
if ! nginx -t 2>/tmp/loja3d-nginx-test.log; then
  cat /tmp/loja3d-nginx-test.log
  [ $new -eq 0 ] || { rm -f "$F"; [ -z "$L" ] || rm -f "$L"; }
  echo "Teste do nginx falhou: nada foi alterado."; exit 1
fi
systemctl reload nginx 2>/dev/null || nginx -s reload
# Confirma que o subdomínio chega à loja (o reload do nginx é gradual)
ok=""; for _ in 1 2 3 4 5 6 7 8 9 10; do
  [ "$(curl -s --max-time 3 -H "Host: $D" http://127.0.0.1/healthz)" = ok ] && ok=1 && break; sleep 1
done
[ -n "$ok" ] || { echo "O nginx recarregou, mas $D ainda não chega à loja. Veja: nginx -T | grep -n $D"; exit 1; }

# 5) HTTPS com Let's Encrypt (certbot com o plugin nginx)
scheme=http
if command -v certbot >/dev/null; then
  if [ -n "${CERTBOT_EMAIL:-}" ]; then acct=(-m "$CERTBOT_EMAIL"); else acct=(--register-unsafely-without-email); fi
  certbot --nginx -d "$D" --redirect --non-interactive --agree-tos "${acct[@]}" \
    || { echo "O certbot falhou. O site já abre em http://$D; repita com CERTBOT_EMAIL=seu@email sudo -E bash $0 $D"; exit 1; }
  scheme=https
else
  echo "certbot não está instalado: o site abre em http://$D (sem HTTPS). Instale com: sudo apt install certbot python3-certbot-nginx"
fi
echo "Pronto: $scheme://$D"
echo "Agora, como administrator: defina SITE_URL=$scheme://$D em ~/loja3d/env e corra bash ~/loja3d/sync.sh force"
