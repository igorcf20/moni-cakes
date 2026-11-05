#!/usr/bin/env bash
# Gera os segredos que faltarem no ficheiro env da Loja 3D, SEM os mostrar e SEM apagar os existentes.
#   bash deploy/gen-secrets.sh [ficheiro]      (por omissão ~/loja3d/env)
#
# Segredos:
#   POSTGRES_PASSWORD  palavra-passe da base (letras e números; não mudar depois do 1.º arranque)
#   JWT_SECRET         assina sessões e chaves (64 caracteres)
#   ANON_KEY           chave pública do site: JWT HS256, papel anon, iss "supabase", válida 10 anos
#   SERVICE_ROLE_KEY   chave de serviço (só no servidor): JWT HS256, papel service_role
#   CRON_SECRET        cabeçalho x-cron-secret dos pedidos agendados do pg_cron (ex.: ctt-track); o migrate
#                      copia-o para o Vault da base e o serviço functions recebe-o do env
# Uma chave que não tenha sido assinada com o JWT_SECRET atual, tenha outro papel ou expire em menos de
# 30 dias é gerada de novo (a antiga não serviria para nada). O ficheiro fica com chmod 600.
# Os valores nunca passam pela linha de comandos (não aparecem no "ps") nem pelo ecrã.
#
# Variável opcional: LOJA3D_PROJECT (nome do projeto Compose, por omissão loja3d), para recusar gerar uma
# POSTGRES_PASSWORD nova quando o volume da base já existe (a antiga perdeu-se e a nova não funcionaria).
set -euo pipefail
umask 077

f=${1:-$HOME/loja3d/env}
project=${LOJA3D_PROJECT:-loja3d}
mkdir -p "$(dirname "$f")"
if [ ! -f "$f" ]; then
  printf '# Loja 3D: variáveis do servidor (chmod 600, nunca no Git). Modelo: deploy/env.example\n' > "$f"
fi
chmod 600 "$f"

say() { echo "gen-secrets: $*"; }

# Último valor da variável no ficheiro (aceita "export NOME=" e aspas simples ou duplas).
get() {
  local v
  v=$(sed -n "s/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}$1=//p" "$f" | tail -n 1)
  v=${v%$'\r'}
  case $v in
    \"*\") v=${v#\"}; v=${v%\"} ;;
    \'*\') v=${v#\'}; v=${v%\'} ;;
  esac
  printf '%s' "$v"
}

# Grava NOME=valor: substitui a linha existente ou acrescenta no fim. O valor vai por variável de ambiente.
set_var() {
  local name=$1 tmp
  if grep -q "^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}$name=" "$f"; then
    tmp=$(mktemp "$f.XXXXXX")
    K="$name" V="$2" awk '
      BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; re = "^[[:space:]]*(export[[:space:]]+)?" k "=" }
      $0 ~ re { if (!done) print k "=" v; done = 1; next }
      { print }
    ' "$f" > "$tmp"
    chmod 600 "$tmp"
    mv "$tmp" "$f"
  else
    if [ -s "$f" ] && [ -n "$(tail -c 1 "$f")" ]; then echo >> "$f"; fi
    printf '%s=%s\n' "$name" "$2" >> "$f"
  fi
}

# Hexadecimal aleatório (n bytes).
rand_hex() { head -c "$1" /dev/urandom | od -An -vtx1 | tr -d ' \n'; }

# Assinar / verificar JWT HS256. Entrada só por variáveis de ambiente:
#   JWT_MODE=sign|check  JWT_ROLE  JWT_KEY (segredo)  JWT_TOKEN (para check)
PY_JWT='
import base64, hashlib, hmac, json, os, sys, time
e = os.environ
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
unb64 = lambda s: base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
key = e["JWT_KEY"].encode()
sig = lambda msg: b64(hmac.new(key, msg.encode(), hashlib.sha256).digest())
if e["JWT_MODE"] == "sign":
    now = int(time.time())
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    p = b64(json.dumps({"role": e["JWT_ROLE"], "iss": "supabase", "iat": now, "exp": now + 10 * 365 * 86400}, separators=(",", ":")).encode())
    sys.stdout.write(h + "." + p + "." + sig(h + "." + p))
else:
    try:
        h, p, s = e.get("JWT_TOKEN", "").split(".")
        c = json.loads(unb64(p))
        ok = (hmac.compare_digest(sig(h + "." + p), s) and json.loads(unb64(h)).get("alg") == "HS256"
              and c.get("role") == e["JWT_ROLE"] and float(c.get("exp", 0)) > time.time() + 30 * 86400)
    except Exception:
        ok = False
    sys.exit(0 if ok else 1)
'
JS_JWT='
const c = require("crypto"), e = process.env;
const b64 = (x) => Buffer.from(x).toString("base64url");
const sig = (m) => c.createHmac("sha256", e.JWT_KEY).update(m).digest("base64url");
if (e.JWT_MODE === "sign") {
  const now = Math.floor(Date.now() / 1000);
  const h = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64(JSON.stringify({ role: e.JWT_ROLE, iss: "supabase", iat: now, exp: now + 10 * 365 * 86400 }));
  process.stdout.write(h + "." + p + "." + sig(h + "." + p));
} else {
  let ok = false;
  try {
    const [h, p, s] = (e.JWT_TOKEN || "").split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    const a = Buffer.from(sig(h + "." + p)), b = Buffer.from(s || "");
    ok = a.length === b.length && c.timingSafeEqual(a, b)
      && JSON.parse(Buffer.from(h, "base64url").toString()).alg === "HS256"
      && claims.role === e.JWT_ROLE && Number(claims.exp || 0) > Date.now() / 1000 + 30 * 86400;
  } catch { ok = false; }
  process.exit(ok ? 0 : 1);
}
'
jwt_tool() {
  export JWT_MODE JWT_ROLE JWT_KEY JWT_TOKEN
  if [ "${GEN_SECRETS_TOOL:-}" != node ] && command -v python3 >/dev/null 2>&1; then
    python3 -c "$PY_JWT"
  elif command -v node >/dev/null 2>&1; then
    node -e "$JS_JWT"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm -i -e JWT_MODE -e JWT_ROLE -e JWT_KEY -e JWT_TOKEN node:22-alpine node -e "$JS_JWT"
  else
    say "ERRO: preciso de python3, node ou docker para assinar as chaves." >&2
    return 2
  fi
}

changed=0

# 1. Palavra-passe da base.
pg=$(get POSTGRES_PASSWORD)
if [ -z "$pg" ]; then
  if command -v docker >/dev/null 2>&1 && docker volume inspect "${project}_db-data" >/dev/null 2>&1; then
    say "ERRO: o volume ${project}_db-data já existe mas falta POSTGRES_PASSWORD em $f." >&2
    say "Recupere a palavra-passe antiga (uma nova não abriria a base existente)." >&2
    exit 1
  fi
  set_var POSTGRES_PASSWORD "$(rand_hex 24)"
  say "POSTGRES_PASSWORD gerada."
  changed=1
elif ! [[ $pg =~ ^[A-Za-z0-9._~-]+$ ]]; then
  say "AVISO: POSTGRES_PASSWORD tem caracteres especiais; os endereços postgres:// dos serviços podem falhar." >&2
fi

# 2. Segredo dos JWT.
jwt=$(get JWT_SECRET)
if [ -z "$jwt" ]; then
  jwt=$(rand_hex 32)
  set_var JWT_SECRET "$jwt"
  say "JWT_SECRET gerado."
  changed=1
elif [ "${#jwt}" -lt 40 ]; then
  say "ERRO: JWT_SECRET em $f tem menos de 40 caracteres. Apague a linha para gerar um novo" >&2
  say "(isso termina as sessões abertas e gera chaves novas)." >&2
  exit 1
fi

# 3. Chaves (JWT assinados com o JWT_SECRET).
for pair in ANON_KEY:anon SERVICE_ROLE_KEY:service_role; do
  name=${pair%%:*}; role=${pair#*:}
  cur=$(get "$name")
  JWT_KEY=$jwt JWT_ROLE=$role JWT_TOKEN=$cur JWT_MODE=check
  if [ -n "$cur" ] && jwt_tool; then
    continue
  fi
  JWT_TOKEN="" JWT_MODE=sign
  token=$(jwt_tool)
  [ -n "$token" ] || { say "ERRO: não consegui assinar $name." >&2; exit 1; }
  # Confirma a chave nova antes de a gravar.
  JWT_TOKEN=$token JWT_MODE=check
  jwt_tool || { say "ERRO: a chave $name gerada não passou na verificação." >&2; exit 1; }
  set_var "$name" "$token"
  if [ -n "$cur" ]; then
    say "$name não correspondia ao JWT_SECRET (ou ia expirar): gerada de novo."
  else
    say "$name gerada."
  fi
  changed=1
done
unset JWT_KEY JWT_TOKEN JWT_ROLE JWT_MODE token jwt pg cur

# 4. Segredo dos pedidos agendados (pg_cron -> funções). Sem ele, o cron do ctt-track é recusado (401).
if [ -z "$(get CRON_SECRET)" ]; then
  set_var CRON_SECRET "$(rand_hex 32)"
  say "CRON_SECRET gerado."
  changed=1
fi

chmod 600 "$f"
if [ "$changed" -eq 1 ]; then
  say "segredos gravados em $f (chmod 600). Não os copie para o chat nem para o Git."
else
  say "segredos completos em $f; nada a gerar."
fi
