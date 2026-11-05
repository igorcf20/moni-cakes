// Router principal das Edge Functions da Moni Cakes (supabase/edge-runtime, serviço "functions" do
// deploy/compose.yaml). Adaptado do router oficial do self-hosting da Supabase
// (docker/volumes/functions/main/index.ts), sem nenhum serviço externo.
//
// O que faz:
// - /<nome>[/...] corre FUNCTIONS_PATH/<nome>/index.ts (pasta supabase/functions montada só de leitura).
//   O nginx do serviço web corta o prefixo /functions/v1/ antes de chegar aqui.
// - Só aceita nomes de função (começa por letra; letras, números, "-" e "_") cuja pasta tenha index.ts.
//   _shared, pastas sem index.ts, nomes com "." ou "%" e funções que não existem dão 404.
//   Nunca serve ficheiros: cada pedido só pode arrancar o index.ts de uma função.
// - JWT (HS256 assinado com JWT_SECRET: chave anon, service_role ou sessão do GoTrue) verificado por
//   função conforme FUNCTIONS_CONFIG (supabase/config.toml): [functions.<nome>] verify_jwt = false desliga.
//   Por omissão verifica (VERIFY_JWT=false muda a omissão; não recomendado). OPTIONS passa sem JWT
//   (pré-verificação CORS), como no Supabase alojado.
// - [functions.<nome>] enabled = false: responde 503 com mensagem clara, sem arrancar a função
//   (usado nas funções que dependiam da Lovable para e-mail ou IA).
// - As funções recebem as variáveis do contentor, exceto JWT_SECRET e as do próprio router.
//
// Sem importações remotas: o router arranca mesmo sem internet (as funções descarregam as suas
// dependências npm:/esm.sh na primeira execução e ficam na cache do volume deno-cache).

const FUNCTIONS_PATH = (Deno.env.get('FUNCTIONS_PATH') || '/home/deno/functions').replace(/\/+$/, '')
const FUNCTIONS_CONFIG = Deno.env.get('FUNCTIONS_CONFIG') || '/home/deno/config.toml'
const JWT_SECRET = Deno.env.get('JWT_SECRET') || ''
const VERIFY_JWT_DEFAULT = (Deno.env.get('VERIFY_JWT') || 'true').trim().toLowerCase() !== 'false'

const MAX_WORKER_RETRIES = 3
const WORKER_MEMORY_MB = positiveInt(Deno.env.get('FUNCTIONS_WORKER_MEMORY_MB'), 150)
// Acima do limite de inatividade de 150 s definido no compose (--user-worker-request-idle-timeout).
const WORKER_TIMEOUT_MS = 400_000
const REQUEST_ABSENT_TIMEOUT_MS = 60_000
// Intervalo mínimo entre verificações de alterações ao config.toml.
const CONFIG_CHECK_MS = 5_000
// Funções ativas ao mesmo tempo (cada uma tem o seu worker, de cerca de 20 MB, que fica vivo até
// REQUEST_ABSENT_TIMEOUT_MS depois do último pedido). Acima disto a função nova responde 503 com
// Retry-After em vez de o contentor ficar sem memória (o que cortaria os pedidos de todas as funções).
// 18 (cerca de 360 MB) cabem nos 512 MB do serviço functions com margem; subir este valor obriga a subir o mem_limit.
const MAX_ACTIVE_FUNCTIONS = positiveInt(Deno.env.get('FUNCTIONS_MAX_ACTIVE'), 18)
// Margem sobre REQUEST_ABSENT_TIMEOUT_MS até considerar que o worker de uma função já terminou.
const ACTIVE_MARGIN_MS = 10_000

// Variáveis que ficam só no router (nunca passam para as funções).
const ROUTER_ONLY_ENV = new Set([
  'JWT_SECRET',
  'VERIFY_JWT',
  'FUNCTIONS_PATH',
  'FUNCTIONS_CONFIG',
  'FUNCTIONS_WORKER_MEMORY_MB',
  'FUNCTIONS_MAX_ACTIVE',
])

// Mesmo formato de nome que a Supabase aceita para funções.
const FUNCTION_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/

enum RequestErrors {
  InvalidLegacyJWT = 'UNAUTHORIZED_LEGACY_JWT',
  InvalidTokenFormat = 'UNAUTHORIZED_INVALID_JWT_FORMAT',
  UnsupportedTokenAlgorithm = 'UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM',
  MissingAuthHeader = 'UNAUTHORIZED_NO_AUTH_HEADER',
  NotFound = 'NOT_FOUND',
  FunctionDisabled = 'FUNCTION_DISABLED',
  BootError = 'BOOT_ERROR',
  EdgeFunctionError = 'EDGE_FUNCTION_ERROR',
  IdleTimeout = 'IDLE_TIMEOUT',
  WorkerResourceLimit = 'WORKER_RESOURCE_LIMIT',
  TooManyActiveFunctions = 'TOO_MANY_ACTIVE_FUNCTIONS',
  WorkerError = 'WORKER_ERROR',
  InvalidResponseStatusCode = 'INVALID_RESPONSE_STATUS_CODE',
}

type Failure = { code: RequestErrors; message: string; status: number }

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

// ---------------------------------------------------------------------------------------------
// Configuração por função (subconjunto do supabase/config.toml)
// ---------------------------------------------------------------------------------------------

type FunctionSettings = { verifyJwt?: boolean; enabled?: boolean }

let functionSettings = new Map<string, FunctionSettings>()
let configMtime: number | null = null
let configCheckedAt = 0

// Lê só o que o router usa: secções [functions.<nome>] com verify_jwt e enabled (true/false).
// O resto do ficheiro é ignorado. Um valor que não seja true/false é ignorado (fica a omissão).
function parseFunctionsToml(text: string): Map<string, FunctionSettings> {
  const result = new Map<string, FunctionSettings>()
  let current: FunctionSettings | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').replace(/^#.*$/, '').trim()
    if (!line) continue
    if (line.startsWith('[')) {
      const m = line.match(/^\[\s*functions\s*\.\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*\]$/)
      const name = m ? (m[1] ?? m[2] ?? m[3]) : null
      if (name) {
        current = result.get(name) ?? {}
        result.set(name, current)
      } else {
        current = null
      }
      continue
    }
    if (!current) continue
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(true|false)$/)
    if (!kv) continue
    if (kv[1] === 'verify_jwt') current.verifyJwt = kv[2] === 'true'
    else if (kv[1] === 'enabled') current.enabled = kv[2] === 'true'
  }
  return result
}

function loadConfig(force = false): void {
  const now = Date.now()
  if (!force && now - configCheckedAt < CONFIG_CHECK_MS) return
  configCheckedAt = now
  let mtime: number
  try {
    mtime = Deno.statSync(FUNCTIONS_CONFIG).mtime?.getTime() ?? 0
  } catch (e) {
    if (configMtime !== -1) {
      console.warn(`[router] ${FUNCTIONS_CONFIG} não encontrado (${(e as Error).message}): todas as funções exigem JWT.`)
    }
    configMtime = -1
    functionSettings = new Map()
    return
  }
  if (!force && mtime === configMtime) return
  try {
    functionSettings = parseFunctionsToml(Deno.readTextFileSync(FUNCTIONS_CONFIG))
    configMtime = mtime
  } catch (e) {
    // Em caso de erro fica a configuração anterior (ou nenhuma: tudo exige JWT).
    console.error(`[router] Erro ao ler ${FUNCTIONS_CONFIG}:`, (e as Error).message)
    return
  }
  const publicas = [...functionSettings].filter(([, s]) => s.verifyJwt === false).map(([n]) => n)
  const desativadas = [...functionSettings].filter(([, s]) => s.enabled === false).map(([n]) => n)
  console.log(
    `[router] Configuração lida. Sem JWT: ${publicas.join(', ') || '(nenhuma)'}.` +
      ` Desativadas: ${desativadas.join(', ') || '(nenhuma)'}. Omissão: ${VERIFY_JWT_DEFAULT ? 'verifica JWT' : 'sem JWT'}.`,
  )
}

function settingsFor(name: string): Required<FunctionSettings> {
  loadConfig()
  const s = functionSettings.get(name) ?? {}
  return { verifyJwt: s.verifyJwt ?? VERIFY_JWT_DEFAULT, enabled: s.enabled ?? true }
}

// ---------------------------------------------------------------------------------------------
// Respostas de erro (mesmo formato do router oficial: { code, message } + cabeçalho sb-error-code)
// ---------------------------------------------------------------------------------------------

function errorResponse({ code, message, status }: Failure, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(
    status === 401 ? { code, message, msg: message } : { code, message },
    {
      status,
      headers: {
        'sb-error-code': code,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'sb-error-code',
        ...extraHeaders,
      },
    },
  )
}

const notFound = (): Response =>
  errorResponse({ code: RequestErrors.NotFound, message: 'Requested function was not found', status: 404 })

function handleWorkerResponse(response: Response): Response {
  if (response.status < 500) return response
  const headers = new Headers(response.headers)
  headers.set('sb-error-code', RequestErrors.EdgeFunctionError)
  const exposed = (headers.get('Access-Control-Expose-Headers') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  if (!exposed.some((h) => h.toLowerCase() === 'sb-error-code')) exposed.push('sb-error-code')
  headers.set('Access-Control-Expose-Headers', exposed.join(', '))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function resolveRuntimeError(e: unknown): Failure {
  // Classes de erro do edge-runtime (não existem no Deno normal).
  const errors = Deno.errors as unknown as Record<string, (new (...args: unknown[]) => Error) | undefined>
  const is = (name: string) => typeof errors[name] === 'function' && e instanceof (errors[name] as never)
  if (is('InvalidWorkerCreation')) {
    return { code: RequestErrors.BootError, message: 'Function failed to start (please check logs)', status: 503 }
  }
  if (is('WorkerRequestCancelled')) {
    return {
      code: RequestErrors.WorkerResourceLimit,
      message: 'Function failed due to not having enough compute resources (please check logs)',
      status: 546,
    }
  }
  if (is('WorkerRequestIdleTimeout')) {
    return { code: RequestErrors.IdleTimeout, message: 'Request idle timeout limit (150s) reached', status: 504 }
  }
  if (
    (e instanceof RangeError || is('InvalidWorkerResponse')) &&
    (e as Error).message.includes('is not equal to 101 and outside the range [200, 599]')
  ) {
    return {
      code: RequestErrors.InvalidResponseStatusCode,
      message: 'Function returned an invalid HTTP status code (please check logs)',
      status: 500,
    }
  }
  if (is('WorkerAlreadyRetired') || is('InvalidWorkerResponse')) {
    return { code: RequestErrors.WorkerError, message: 'Function exited due to an error (please check logs)', status: 500 }
  }
  return { code: RequestErrors.EdgeFunctionError, message: 'Internal Server Error', status: 500 }
}

// ---------------------------------------------------------------------------------------------
// JWT HS256 (Web Crypto, sem bibliotecas)
// ---------------------------------------------------------------------------------------------

const encoder = new TextEncoder()
const hmacKey: Promise<CryptoKey> | null = JWT_SECRET
  ? crypto.subtle.importKey('raw', encoder.encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  : null

function base64UrlDecode(segment: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) throw new Error('base64url inválido')
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((segment.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function unauthorized(code: RequestErrors, message = 'Invalid JWT'): Failure {
  return { code, message, status: 401 }
}

function extractToken(req: Request): string | Failure {
  const auth = req.headers.get('authorization')
  if (auth) {
    const parts = auth.trim().split(/\s+/)
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
      return unauthorized(RequestErrors.InvalidTokenFormat, 'Invalid JWT format')
    }
    return parts[1]
  }
  // Pedidos só com "apikey" (o nginx do web já os converte em Authorization; fica por compatibilidade).
  const apikey = req.headers.get('apikey')?.trim()
  if (apikey) return apikey
  return unauthorized(RequestErrors.MissingAuthHeader, 'Missing authorization header')
}

async function verifyJwt(token: string): Promise<Failure | null> {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return unauthorized(RequestErrors.InvalidTokenFormat, 'Invalid JWT format')
  }
  const header = decodeJson(parts[0])
  const payload = decodeJson(parts[1])
  if (!header || !payload) return unauthorized(RequestErrors.InvalidTokenFormat, 'Invalid JWT format')
  if (header.alg !== 'HS256') {
    return unauthorized(RequestErrors.UnsupportedTokenAlgorithm, `Unsupported JWT algorithm ${String(header.alg)}`)
  }
  if (!hmacKey) {
    console.error('[router] JWT_SECRET em falta: não é possível verificar tokens HS256.')
    return unauthorized(RequestErrors.InvalidLegacyJWT)
  }
  let signature: Uint8Array
  try {
    signature = base64UrlDecode(parts[2])
  } catch {
    return unauthorized(RequestErrors.InvalidTokenFormat, 'Invalid JWT format')
  }
  const valid = await crypto.subtle.verify('HMAC', await hmacKey, signature, encoder.encode(`${parts[0]}.${parts[1]}`))
  if (!valid) return unauthorized(RequestErrors.InvalidLegacyJWT)
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp !== undefined && (typeof payload.exp !== 'number' || payload.exp <= now)) {
    return unauthorized(RequestErrors.InvalidLegacyJWT, 'JWT expired')
  }
  if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > now)) {
    return unauthorized(RequestErrors.InvalidLegacyJWT)
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Limite de funções ativas (memória)
// ---------------------------------------------------------------------------------------------

// nome -> pedidos em curso e fim previsto do worker (quando já não há pedidos em curso).
const activeFunctions = new Map<string, { inFlight: number; until: number }>()

function acquireSlot(name: string): boolean {
  const now = Date.now()
  for (const [n, a] of activeFunctions) {
    if (a.inFlight === 0 && a.until <= now) activeFunctions.delete(n)
  }
  const current = activeFunctions.get(name)
  if (!current && activeFunctions.size >= MAX_ACTIVE_FUNCTIONS) return false
  const slot = current ?? { inFlight: 0, until: 0 }
  slot.inFlight++
  activeFunctions.set(name, slot)
  return true
}

function releaseSlot(name: string): void {
  const slot = activeFunctions.get(name)
  if (!slot) return
  slot.inFlight = Math.max(0, slot.inFlight - 1)
  if (slot.inFlight === 0) slot.until = Date.now() + REQUEST_ABSENT_TIMEOUT_MS + ACTIVE_MARGIN_MS
}

// ---------------------------------------------------------------------------------------------
// Encaminhamento
// ---------------------------------------------------------------------------------------------

function isFile(path: string): boolean {
  try {
    return Deno.statSync(path).isFile
  } catch {
    return false
  }
}

// Variáveis passadas a cada função: as do contentor, sem as do router; SUPABASE_FUNCTION_SLUG por último.
function workerEnv(name: string): [string, string][] {
  const env = Deno.env.toObject()
  for (const key of ROUTER_ONLY_ENV) delete env[key]
  env.SUPABASE_FUNCTION_SLUG = name
  return Object.entries(env)
}

if (!JWT_SECRET) console.error('[router] JWT_SECRET em falta: as funções com verify_jwt recusam todos os pedidos.')
loadConfig(true)

Deno.serve(async (req: Request) => {
  const { pathname } = new URL(req.url)
  const name = pathname.split('/')[1] ?? ''
  if (!FUNCTION_NAME_RE.test(name)) return notFound()

  const servicePath = `${FUNCTIONS_PATH}/${name}`
  const entrypoint = `${servicePath}/index.ts`
  if (!isFile(entrypoint)) return notFound()

  const settings = settingsFor(name)
  if (!settings.enabled) {
    return errorResponse({
      code: RequestErrors.FunctionDisabled,
      message:
        `A função ${name} está desativada neste servidor (enabled = false em supabase/config.toml). ` +
        'Envio de e-mail e IA dependiam da Lovable e ainda não têm substituto.',
      status: 503,
    })
  }

  if (settings.verifyJwt && req.method !== 'OPTIONS') {
    const token = extractToken(req)
    if (typeof token !== 'string') return errorResponse(token)
    const failure = await verifyJwt(token)
    if (failure) return errorResponse(failure)
  }

  // deno.json próprio da função (ex.: JSX dos modelos de e-mail), como no Supabase CLI.
  const importMapPath = [`${servicePath}/deno.json`, `${servicePath}/deno.jsonc`].find(isFile) ?? null
  const envVars = workerEnv(name)

  const callWorker = async (request: Request, retriesLeft = MAX_WORKER_RETRIES): Promise<Response> => {
    // Guardar o corpo antes do fetch() o consumir, para poder repetir se o worker já estiver retirado.
    const retryReq = retriesLeft > 0 ? request.clone() : null
    try {
      const worker = await EdgeRuntime.userWorkers.create({
        servicePath,
        maybeEntrypoint: `file://${entrypoint}`,
        memoryLimitMb: WORKER_MEMORY_MB,
        workerTimeoutMs: WORKER_TIMEOUT_MS,
        context: { supervisor: { requestAbsentTimeoutMs: REQUEST_ABSENT_TIMEOUT_MS } },
        noModuleCache: false,
        importMapPath,
        envVars,
      })
      const userReq = new Request(request)
      userReq.headers.delete('sb-api-key')
      if (typeof EdgeRuntime.applySupabaseTag === 'function') EdgeRuntime.applySupabaseTag(request, userReq)
      return handleWorkerResponse(await worker.fetch(userReq))
    } catch (e) {
      // Worker retirado antes de receber o pedido: o código da função ainda não correu, pode repetir.
      const retired = (Deno.errors as unknown as Record<string, unknown>).WorkerAlreadyRetired
      if (typeof retired === 'function' && e instanceof (retired as never) && retryReq) {
        console.warn(`[router] ${name}: worker retirado antes do pedido; nova tentativa (${retriesLeft} restantes)`)
        if (typeof EdgeRuntime.applySupabaseTag === 'function') EdgeRuntime.applySupabaseTag(request, retryReq)
        return await callWorker(retryReq, retriesLeft - 1)
      }
      console.error(`[router] ${name}:`, e)
      return errorResponse(resolveRuntimeError(e))
    }
  }

  if (!acquireSlot(name)) {
    console.warn(`[router] ${name}: ${MAX_ACTIVE_FUNCTIONS} funções já ativas; pedido recusado com 503 (FUNCTIONS_MAX_ACTIVE).`)
    return errorResponse(
      {
        code: RequestErrors.TooManyActiveFunctions,
        message: 'Servidor ocupado: demasiadas funções ativas ao mesmo tempo. Tente de novo dentro de alguns segundos.',
        status: 503,
      },
      { 'Retry-After': '10' },
    )
  }
  try {
    return await callWorker(req)
  } finally {
    releaseSlot(name)
  }
})
