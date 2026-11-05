// =====================================================================================
// Pop-ups de captação (recurso lead_popups em Admin > Recursos da loja). Cada pop-up é um desenho livre:
//   Desenho     content: tamanho no computador e no celular, cantos, sombra, botão fechar, posição na tela,
//               fundo escurecido, animação, botão discreto para reabrir e dois passos (form = antes de enviar,
//               success = depois de enviar). Cada passo tem fundo (cor, imagem, imagem própria do celular,
//               película) e elementos soltos (texto, imagem, forma, campo, aceite, botão, cupom), cada um com
//               posição e largura em % da área, uma para o computador e outra para o celular.
//   Regras      rules: quando abre (tempo, rolagem, intenção de sair, logo), páginas, aparelhos, público,
//               frequência, países e idiomas. Datas de início e fim, prioridade e cupom ficam em colunas.
// Funções puras (sem imports com @/) para o teste em node: scripts/test-lead-popups.mjs. As mesmas regras de
// envio estão no servidor (submit_popup_lead, migration 20261008100000_lead_popups.sql).
// =====================================================================================

export const POPUP_LOCALES = ['pt-BR', 'pt-PT', 'en', 'es'] as const;
export type PopupLocale = (typeof POPUP_LOCALES)[number];
export type L10n = Partial<Record<PopupLocale, string>>;
export type Device = 'desktop' | 'mobile';
export const DEVICES: Device[] = ['desktop', 'mobile'];
export type StepId = 'form' | 'success';

/** Posição e largura em % da área do pop-up; h só em imagem e forma (os outros crescem com o conteúdo). */
export type Box = { x: number; y: number; w: number; h: number | null };

type Base = { id: string; name: string; desktop: Box; mobile: Box; hidden: { desktop: boolean; mobile: boolean } };

export type TextEl = Base & {
  type: 'text';
  text: L10n;
  size: number;
  /** tamanho no celular; null = proporcional ao computador */
  mobileSize: number | null;
  weight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  italic: boolean;
  upper: boolean;
  lineHeight: number;
  letterSpacing: number;
  bg: string;
  padding: number;
  radius: number;
};
export type ImageEl = Base & { type: 'image'; src: string; fit: 'cover' | 'contain'; radius: number; opacity: number; alt: L10n; href: string };
export type ShapeEl = Base & { type: 'shape'; color: string; opacity: number; radius: number; borderColor: string; borderWidth: number };
export type FieldKind = 'email' | 'phone' | 'name' | 'custom';
export type FieldEl = Base & {
  type: 'field';
  field: FieldKind;
  /** identificador do campo livre (letras, números e _) */
  key: string;
  label: L10n;
  placeholder: L10n;
  required: boolean;
  showLabel: boolean;
  bg: string;
  color: string;
  borderColor: string;
  labelColor: string;
  radius: number;
  height: number;
  size: number;
};
export type ConsentEl = Base & { type: 'consent'; text: L10n; required: boolean; color: string; size: number; privacyLink: boolean };
export type ButtonAction = 'submit' | 'close' | 'link';
export type ButtonEl = Base & {
  type: 'button';
  text: L10n;
  action: ButtonAction;
  href: string;
  newTab: boolean;
  variant: 'solid' | 'outline' | 'text';
  bg: string;
  color: string;
  radius: number;
  height: number;
  size: number;
  weight: number;
  upper: boolean;
};
export type CouponEl = Base & { type: 'coupon'; label: L10n; copyText: L10n; bg: string; color: string; borderColor: string; size: number; radius: number };
export type PopupElement = TextEl | ImageEl | ShapeEl | FieldEl | ConsentEl | ButtonEl | CouponEl;
export type ElementType = PopupElement['type'];

export type Background = {
  color: string;
  image: string;
  /** imagem só do celular (ex.: versão vertical da arte); vazia = a mesma do computador */
  mobileImage: string;
  fit: 'cover' | 'contain';
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
  overlay: string;
  overlayOpacity: number;
};
export type Step = { bg: Background; elements: PopupElement[] };
export type ScreenPosition = 'center' | 'bottom-right' | 'bottom-left' | 'bottom' | 'top';
export type Size = { w: number; h: number };

export type PopupContent = {
  version: 1;
  size: Record<Device, Size>;
  radius: number;
  shadow: 'none' | 'soft' | 'strong';
  borderColor: string;
  borderWidth: number;
  close: { show: boolean; color: string; bg: string; size: 'sm' | 'md' | 'lg'; delay: number };
  position: Record<Device, ScreenPosition>;
  backdrop: { show: boolean; color: string; opacity: number; blur: boolean; closeOnClick: boolean };
  animation: 'fade' | 'zoom' | 'slide' | 'none';
  /** botão pequeno no canto para reabrir depois de fechar (modo discreto) */
  teaser: { enabled: boolean; text: L10n; side: 'left' | 'right'; bg: string; color: string };
  successAutoClose: number;
  form: Step;
  success: Step;
};

export type Trigger = 'delay' | 'scroll' | 'exit' | 'immediate';
export type PageScope = 'all' | 'home' | 'products' | 'catalog' | 'custom';
export type Audience = 'all' | 'guests' | 'customers';
export type Frequency = 'once' | 'session' | 'days' | 'always';

export type PopupRules = {
  trigger: Trigger;
  delay: number;
  scroll: number;
  pages: PageScope;
  include: string[];
  exclude: string[];
  devices: Record<Device, boolean>;
  audience: Audience;
  frequency: Frequency;
  days: number;
  hideAfterSubmit: boolean;
  countries: string[];
  locales: PopupLocale[];
  waitConsent: boolean;
};

export type PopupStatus = 'draft' | 'active' | 'paused';
export const POPUP_STATUSES: PopupStatus[] = ['draft', 'active', 'paused'];

/** Linha da tabela lead_popups como o Admin a lê. */
export type LeadPopup = {
  id: string;
  name: string;
  status: PopupStatus;
  content: PopupContent;
  rules: PopupRules;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  coupon_code: string | null;
  save_newsletter: boolean;
  views: number;
  created_at: string;
  updated_at: string;
};

/** O que o site recebe (site_popups): sem cupom nem números. */
export type SitePopup = { id: string; priority: number; content: PopupContent; rules: PopupRules };

// ---------------------------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------------------------

export const SIZE_LIMITS: Record<Device, { minW: number; maxW: number; minH: number; maxH: number }> = {
  desktop: { minW: 240, maxW: 1000, minH: 120, maxH: 900 },
  mobile: { minW: 240, maxW: 430, minH: 120, maxH: 820 },
};
export const MAX_ELEMENTS = 40;
export const MAX_TEXT = 600;
export const MAX_VALUE = 300;
export const PREVIEW_PARAM = 'popup_preview';

// ---------------------------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------------------------

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX_RE.test(v);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const round = (n: number, step = 0.1) => Math.round(n / step) * step;
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
const color = (v: unknown) => (isHex(v) ? v.toUpperCase() : '');
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Endereço seguro: https, http ou caminho do próprio site ("/..."). Outro esquema (javascript:, data:) = vazio. */
export function safeUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim().slice(0, 1000);
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : '';
}

export function l10n(v: unknown, max = MAX_TEXT): L10n {
  const o = obj(v);
  const out: L10n = {};
  for (const l of POPUP_LOCALES) if (typeof o[l] === 'string') out[l] = (o[l] as string).slice(0, max);
  return out;
}

/** Texto no idioma pedido; sem tradução, o pt-BR, depois qualquer um preenchido. */
export function pickText(t: L10n | undefined, locale: string): string {
  if (!t) return '';
  const own = t[locale as PopupLocale];
  if (own && own.trim()) return own;
  if (t['pt-BR']?.trim()) return t['pt-BR'];
  for (const l of POPUP_LOCALES) if (t[l]?.trim()) return t[l] as string;
  return '';
}

/** Idiomas que ainda faltam traduzir num texto preenchido. */
export function missingLocales(t: L10n): PopupLocale[] {
  if (!POPUP_LOCALES.some((l) => t[l]?.trim())) return [];
  return POPUP_LOCALES.filter((l) => !t[l]?.trim());
}

const L = (pt: string, ptPT: string, en: string, es: string): L10n => ({ 'pt-BR': pt, 'pt-PT': ptPT, en, es });

/** Textos de partida das peças novas (o dono troca no painel). */
export const SAMPLES = {
  title: L('Seu título aqui', 'O seu título aqui', 'Your headline here', 'Tu título aquí'),
  close: L('Agora não', 'Agora não', 'Not now', 'Ahora no'),
  link: L('Ver ofertas', 'Ver ofertas', 'See offers', 'Ver ofertas'),
};

let seq = 0;
export function newId(prefix = 'e'): string {
  seq = (seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------------------------
// Padrões
// ---------------------------------------------------------------------------------------------

export const box = (x: number, y: number, w: number, h: number | null = null): Box => ({ x, y, w, h });
const both = (b: Box) => ({ desktop: { ...b }, mobile: { ...b } });

export function defaultBackground(): Background {
  return { color: '#FFFFFF', image: '', mobileImage: '', fit: 'cover', position: 'center', overlay: '#000000', overlayOpacity: 0 };
}

export function defaultRules(): PopupRules {
  return {
    trigger: 'delay', delay: 5, scroll: 40, pages: 'all', include: [], exclude: ['/checkout*', '/carrinho*', '/auth*'],
    devices: { desktop: true, mobile: true }, audience: 'all', frequency: 'days', days: 7, hideAfterSubmit: true,
    countries: [], locales: [], waitConsent: true,
  };
}

export function defaultContent(): PopupContent {
  return {
    version: 1,
    size: { desktop: { w: 520, h: 560 }, mobile: { w: 340, h: 540 } },
    radius: 20, shadow: 'soft', borderColor: '', borderWidth: 0,
    close: { show: true, color: '#171717', bg: '#FFFFFF', size: 'md', delay: 0 },
    position: { desktop: 'center', mobile: 'center' },
    backdrop: { show: true, color: '#171717', opacity: 55, blur: false, closeOnClick: true },
    animation: 'zoom',
    teaser: { enabled: false, text: L('Ganhe seu desconto', 'Ganhe o seu desconto', 'Get your discount', 'Obtén tu descuento'), side: 'left', bg: '', color: '' },
    successAutoClose: 0,
    form: { bg: defaultBackground(), elements: [] },
    success: { bg: defaultBackground(), elements: [] },
  };
}

/** Elemento novo com valores bons de partida; y = onde entra (em %). */
export function newElement(type: ElementType, y = 40, extra: Partial<FieldEl> = {}): PopupElement {
  const id = newId();
  const hidden = { desktop: false, mobile: false };
  switch (type) {
    case 'text':
      return { id, name: '', type, ...both(box(8, y, 84)), hidden, text: L('Escreva aqui', 'Escreva aqui', 'Write here', 'Escribe aquí'), size: 18,
        mobileSize: null, weight: 500, color: '#171717', align: 'center', italic: false, upper: false, lineHeight: 1.35, letterSpacing: 0,
        bg: '', padding: 0, radius: 0 };
    case 'image':
      return { id, name: '', type, ...both(box(30, y, 40, 22)), hidden, src: '', fit: 'contain', radius: 12, opacity: 100, alt: {}, href: '' };
    case 'shape':
      return { id, name: '', type, ...both(box(6, y, 88, 20)), hidden, color: '#FFFFFF', opacity: 90, radius: 16, borderColor: '', borderWidth: 0 };
    case 'field': {
      const field = extra.field ?? 'email';
      const texts: Record<FieldKind, [L10n, L10n]> = {
        email: [L('E-mail', 'E-mail', 'Email', 'Correo electrónico'), L('Seu melhor e-mail', 'O seu melhor e-mail', 'Your best email', 'Tu mejor correo')],
        phone: [L('WhatsApp', 'Telemóvel', 'Phone', 'Teléfono'), L('Seu WhatsApp com DDD', 'O seu número de telemóvel', 'Your phone number', 'Tu número de teléfono')],
        name: [L('Nome', 'Nome', 'Name', 'Nombre'), L('Seu nome', 'O seu nome', 'Your name', 'Tu nombre')],
        custom: [L('Pergunta', 'Pergunta', 'Question', 'Pregunta'), L('Sua resposta', 'A sua resposta', 'Your answer', 'Tu respuesta')],
      };
      return { id, name: '', type, ...both(box(10, y, 80)), hidden, field, key: field === 'custom' ? `campo_${id.slice(-4)}` : field,
        label: texts[field][0], placeholder: texts[field][1], required: field === 'email' || field === 'phone', showLabel: false,
        bg: '#FFFFFF', color: '#171717', borderColor: '#EDE9E3', labelColor: '#404040', radius: 14, height: 48, size: 16, ...extra } as FieldEl;
    }
    case 'consent':
      return { id, name: '', type, ...both(box(10, y, 80)), hidden,
        text: L('Aceito receber novidades e ofertas por e-mail ou WhatsApp.', 'Aceito receber novidades e ofertas por e-mail ou telemóvel.',
          'I agree to receive news and offers by email or phone.', 'Acepto recibir novedades y ofertas por correo o teléfono.'),
        required: true, color: '#404040', size: 13, privacyLink: true };
    case 'button':
      return { id, name: '', type, ...both(box(10, y, 80)), hidden, text: L('Quero meu desconto', 'Quero o meu desconto', 'Get my discount', 'Quiero mi descuento'),
        action: 'submit', href: '', newTab: false, variant: 'solid', bg: '', color: '', radius: 14, height: 50, size: 16, weight: 700, upper: false };
    case 'coupon':
      return { id, name: '', type, ...both(box(15, y, 70)), hidden, label: L('Seu cupom', 'O seu cupão', 'Your coupon', 'Tu cupón'),
        copyText: L('Copiar', 'Copiar', 'Copy', 'Copiar'), bg: '#FFF0E7', color: '#171717', borderColor: '#FF5A0A', size: 26, radius: 16 };
  }
}

// ---------------------------------------------------------------------------------------------
// Limpeza (o que vem da base ou do navegador pode ter lixo)
// ---------------------------------------------------------------------------------------------

function normBox(v: unknown, fallback: Box, withH: boolean): Box {
  const o = obj(v);
  const w = round(num(o.w, 4, 100, fallback.w));
  const x = round(num(o.x, -20, 100, fallback.x));
  const y = round(num(o.y, -20, 100, fallback.y));
  const h = withH ? round(num(o.h, 2, 120, fallback.h ?? 20)) : null;
  return { x, y, w, h };
}

const FIELD_KEY_RE = /^[a-z0-9_]{1,40}$/;

export function normalizeElement(v: unknown): PopupElement | null {
  const o = obj(v);
  const type = o.type as ElementType;
  if (!['text', 'image', 'shape', 'field', 'consent', 'button', 'coupon'].includes(type)) return null;
  const field = type === 'field' ? pick(o.field, ['email', 'phone', 'name', 'custom'] as const, 'email') : 'email';
  const def = newElement(type, 40, type === 'field' ? { field } : {}) as PopupElement & Record<string, unknown>;
  const withH = type === 'image' || type === 'shape';
  const desktop = normBox(o.desktop, def.desktop, withH);
  const hiddenO = obj(o.hidden);
  const base = {
    id: typeof o.id === 'string' && /^[\w-]{1,60}$/.test(o.id) ? o.id : def.id,
    name: str(o.name, 60),
    desktop,
    mobile: normBox(o.mobile ?? o.desktop, desktop, withH),
    hidden: { desktop: bool(hiddenO.desktop, false), mobile: bool(hiddenO.mobile, false) },
  };
  switch (type) {
    case 'text':
      return { ...base, type, text: l10n(o.text), size: num(o.size, 8, 96, 18), mobileSize: o.mobileSize == null ? null : num(o.mobileSize, 8, 96, 16),
        weight: pick(Number(o.weight) as never, [300, 400, 500, 600, 700, 800, 900] as never[], 500 as never),
        color: color(o.color), align: pick(o.align, ['left', 'center', 'right'] as const, 'center'), italic: bool(o.italic, false),
        upper: bool(o.upper, false), lineHeight: num(o.lineHeight, 0.8, 2.5, 1.35), letterSpacing: num(o.letterSpacing, -5, 20, 0),
        bg: color(o.bg), padding: num(o.padding, 0, 60, 0), radius: num(o.radius, 0, 60, 0) };
    case 'image':
      return { ...base, type, src: safeUrl(o.src), fit: pick(o.fit, ['cover', 'contain'] as const, 'contain'), radius: num(o.radius, 0, 300, 12),
        opacity: num(o.opacity, 0, 100, 100), alt: l10n(o.alt, 200), href: safeUrl(o.href) };
    case 'shape':
      return { ...base, type, color: color(o.color) || '#FFFFFF', opacity: num(o.opacity, 0, 100, 90), radius: num(o.radius, 0, 300, 16),
        borderColor: color(o.borderColor), borderWidth: num(o.borderWidth, 0, 12, 0) };
    case 'field': {
      const d = def as FieldEl;
      const key = field === 'custom' ? (typeof o.key === 'string' && FIELD_KEY_RE.test(o.key) ? o.key : d.key) : field;
      return { ...base, type, field, key, label: l10n(o.label, 120), placeholder: l10n(o.placeholder, 120), required: bool(o.required, d.required),
        showLabel: bool(o.showLabel, false), bg: color(o.bg), color: color(o.color), borderColor: color(o.borderColor),
        labelColor: color(o.labelColor), radius: num(o.radius, 0, 40, 14), height: num(o.height, 32, 80, 48), size: num(o.size, 12, 24, 16) };
    }
    case 'consent':
      return { ...base, type, text: l10n(o.text, 400), required: bool(o.required, true), color: color(o.color), size: num(o.size, 10, 20, 13),
        privacyLink: bool(o.privacyLink, true) };
    case 'button':
      return { ...base, type, text: l10n(o.text, 120), action: pick(o.action, ['submit', 'close', 'link'] as const, 'submit'), href: safeUrl(o.href),
        newTab: bool(o.newTab, false), variant: pick(o.variant, ['solid', 'outline', 'text'] as const, 'solid'), bg: color(o.bg), color: color(o.color),
        radius: num(o.radius, 0, 40, 14), height: num(o.height, 28, 90, 50), size: num(o.size, 11, 30, 16),
        weight: pick(Number(o.weight) as never, [400, 500, 600, 700, 800, 900] as never[], 700 as never), upper: bool(o.upper, false) };
    case 'coupon':
      return { ...base, type, label: l10n(o.label, 80), copyText: l10n(o.copyText, 40), bg: color(o.bg), color: color(o.color),
        borderColor: color(o.borderColor), size: num(o.size, 14, 48, 26), radius: num(o.radius, 0, 40, 16) };
  }
}

function normBackground(v: unknown): Background {
  const o = obj(v);
  const d = defaultBackground();
  return {
    color: color(o.color) || (o.color === '' ? '' : d.color),
    image: safeUrl(o.image),
    mobileImage: safeUrl(o.mobileImage),
    fit: pick(o.fit, ['cover', 'contain'] as const, d.fit),
    position: pick(o.position, ['center', 'top', 'bottom', 'left', 'right'] as const, d.position),
    overlay: color(o.overlay) || d.overlay,
    overlayOpacity: num(o.overlayOpacity, 0, 90, 0),
  };
}

function normStep(v: unknown, step: StepId): Step {
  const o = obj(v);
  const list = Array.isArray(o.elements) ? o.elements : [];
  const seen = new Set<string>();
  const elements: PopupElement[] = [];
  for (const raw of list.slice(0, MAX_ELEMENTS)) {
    const el = normalizeElement(raw);
    if (!el) continue;
    // Campos e aceite só antes de enviar; cupom só depois.
    if (step === 'success' && (el.type === 'field' || el.type === 'consent')) continue;
    if (step === 'form' && el.type === 'coupon') continue;
    if (step === 'success' && el.type === 'button' && el.action === 'submit') (el as ButtonEl).action = 'close';
    if (seen.has(el.id)) el.id = newId();
    seen.add(el.id);
    elements.push(el);
  }
  // Campo livre com identificador repetido: o segundo ganha outro.
  const keys = new Set<string>();
  for (const el of elements) {
    if (el.type !== 'field') continue;
    if (el.field !== 'custom') {
      if (keys.has(el.field)) el.field = 'custom';
      else { keys.add(el.field); continue; }
    }
    let k = el.key && el.field === 'custom' && FIELD_KEY_RE.test(el.key) && !['email', 'phone', 'name'].includes(el.key) ? el.key : `campo_${keys.size + 1}`;
    while (keys.has(k)) k = `${k.slice(0, 34)}_${keys.size + 1}`;
    el.key = k;
    keys.add(k);
  }
  return { bg: normBackground(o.bg), elements };
}

function normSize(v: unknown, d: Device, def: Size): Size {
  const o = obj(v);
  const lim = SIZE_LIMITS[d];
  return { w: Math.round(num(o.w, lim.minW, lim.maxW, def.w)), h: Math.round(num(o.h, lim.minH, lim.maxH, def.h)) };
}

export function normalizeContent(v: unknown): PopupContent {
  const o = obj(v);
  const d = defaultContent();
  const size = obj(o.size);
  const close = obj(o.close);
  const pos = obj(o.position);
  const back = obj(o.backdrop);
  const teaser = obj(o.teaser);
  const positions = ['center', 'bottom-right', 'bottom-left', 'bottom', 'top'] as const;
  return {
    version: 1,
    size: { desktop: normSize(size.desktop, 'desktop', d.size.desktop), mobile: normSize(size.mobile, 'mobile', d.size.mobile) },
    radius: num(o.radius, 0, 48, d.radius),
    shadow: pick(o.shadow, ['none', 'soft', 'strong'] as const, d.shadow),
    borderColor: color(o.borderColor),
    borderWidth: num(o.borderWidth, 0, 12, 0),
    close: {
      show: bool(close.show, true), color: color(close.color) || d.close.color, bg: color(close.bg),
      size: pick(close.size, ['sm', 'md', 'lg'] as const, 'md'), delay: num(close.delay, 0, 30, 0),
    },
    position: { desktop: pick(pos.desktop, positions, 'center'), mobile: pick(pos.mobile, positions, 'center') },
    backdrop: {
      show: bool(back.show, true), color: color(back.color) || d.backdrop.color, opacity: num(back.opacity, 0, 95, d.backdrop.opacity),
      blur: bool(back.blur, false), closeOnClick: bool(back.closeOnClick, true),
    },
    animation: pick(o.animation, ['fade', 'zoom', 'slide', 'none'] as const, d.animation),
    teaser: {
      enabled: bool(teaser.enabled, false), text: teaser.text === undefined ? d.teaser.text : l10n(teaser.text, 60),
      side: pick(teaser.side, ['left', 'right'] as const, 'left'), bg: color(teaser.bg), color: color(teaser.color),
    },
    successAutoClose: num(o.successAutoClose, 0, 60, 0),
    form: normStep(o.form, 'form'),
    success: normStep(o.success, 'success'),
  };
}

const PATH_RE = /^\/[^\s]{0,200}$/;
const cleanPaths = (v: unknown) =>
  (Array.isArray(v) ? v : []).map((p) => (typeof p === 'string' ? p.trim() : '')).filter((p) => PATH_RE.test(p)).slice(0, 30);

export function normalizeRules(v: unknown): PopupRules {
  const o = obj(v);
  const d = defaultRules();
  const dev = obj(o.devices);
  const devices = { desktop: bool(dev.desktop, true), mobile: bool(dev.mobile, true) };
  return {
    trigger: pick(o.trigger, ['delay', 'scroll', 'exit', 'immediate'] as const, d.trigger),
    delay: Math.round(num(o.delay, 0, 600, d.delay)),
    scroll: Math.round(num(o.scroll, 5, 100, d.scroll)),
    pages: pick(o.pages, ['all', 'home', 'products', 'catalog', 'custom'] as const, d.pages),
    include: cleanPaths(o.include),
    exclude: o.exclude === undefined ? d.exclude : cleanPaths(o.exclude),
    devices,
    audience: pick(o.audience, ['all', 'guests', 'customers'] as const, 'all'),
    frequency: pick(o.frequency, ['once', 'session', 'days', 'always'] as const, d.frequency),
    days: Math.round(num(o.days, 1, 365, d.days)),
    hideAfterSubmit: bool(o.hideAfterSubmit, true),
    countries: (Array.isArray(o.countries) ? o.countries : []).filter((c): c is string => typeof c === 'string' && /^[A-Z]{2}$/.test(c)).slice(0, 60),
    locales: (Array.isArray(o.locales) ? o.locales : []).filter((l): l is PopupLocale => POPUP_LOCALES.includes(l as PopupLocale)),
    waitConsent: bool(o.waitConsent, true),
  };
}

// ---------------------------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------------------------

export const formFields = (c: PopupContent) => c.form.elements.filter((e): e is FieldEl => e.type === 'field');
export const formConsent = (c: PopupContent) => c.form.elements.find((e): e is ConsentEl => e.type === 'consent') ?? null;
export const hasSubmit = (c: PopupContent) => c.form.elements.some((e) => e.type === 'button' && e.action === 'submit');

export type ContentProblem =
  | 'no_elements' | 'submit_without_fields' | 'fields_without_submit' | 'no_contact_field' | 'empty_text' | 'image_without_src'
  | 'link_without_href' | 'coupon_without_code' | 'hidden_everywhere' | 'outside';

/** Problemas que impedem ativar (os primeiros) ou merecem aviso. */
export function contentProblems(c: PopupContent, couponCode?: string | null): { id: ContentProblem; el?: string; step?: StepId }[] {
  const out: { id: ContentProblem; el?: string; step?: StepId }[] = [];
  const fields = formFields(c);
  const submit = hasSubmit(c);
  if (!c.form.elements.length && !c.form.bg.image) out.push({ id: 'no_elements', step: 'form' });
  if (submit && !fields.length) out.push({ id: 'submit_without_fields', step: 'form' });
  if (fields.length && !submit) out.push({ id: 'fields_without_submit', step: 'form' });
  if (fields.length && !fields.some((f) => f.field === 'email' || f.field === 'phone')) out.push({ id: 'no_contact_field', step: 'form' });
  for (const step of ['form', 'success'] as StepId[]) {
    for (const el of c[step].elements) {
      if ((el.type === 'text' || el.type === 'button') && !pickText(el.text, 'pt-BR').trim()) out.push({ id: 'empty_text', el: el.id, step });
      if (el.type === 'image' && !el.src) out.push({ id: 'image_without_src', el: el.id, step });
      if (el.type === 'button' && el.action === 'link' && !el.href) out.push({ id: 'link_without_href', el: el.id, step });
      if (el.type === 'coupon' && !couponCode?.trim()) out.push({ id: 'coupon_without_code', el: el.id, step });
      if (el.hidden.desktop && el.hidden.mobile) out.push({ id: 'hidden_everywhere', el: el.id, step });
      for (const d of DEVICES) {
        const b = el[d];
        if (!el.hidden[d] && (b.x >= 98 || b.y >= 98 || b.x + b.w <= 2 || b.y < -10)) { out.push({ id: 'outside', el: el.id, step }); break; }
      }
    }
  }
  return out;
}

/** Problemas que impedem ativar (os outros são só avisos). */
export const BLOCKING: ContentProblem[] = ['no_elements', 'submit_without_fields', 'fields_without_submit', 'no_contact_field', 'link_without_href'];

export type LeadValues = { email?: string; phone?: string; name?: string; extra?: Record<string, string> };
export type LeadError = 'required' | 'email' | 'phone' | 'consent' | 'empty' | 'too_long';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const phoneDigits = (s: string) => s.replace(/\D/g, '');

/** Confere o que o visitante preencheu (o servidor confere de novo, com as mesmas regras). */
export function leadErrors(c: PopupContent, values: LeadValues, consent: boolean): Record<string, LeadError> {
  const errs: Record<string, LeadError> = {};
  const val = (f: FieldEl) => ((f.field === 'custom' ? values.extra?.[f.key] : values[f.field]) ?? '').trim();
  let any = false;
  for (const f of formFields(c)) {
    const v = val(f);
    if (v) any = true;
    if (v.length > MAX_VALUE) errs[f.id] = 'too_long';
    else if (!v) { if (f.required) errs[f.id] = 'required'; }
    else if (f.field === 'email' && !EMAIL_RE.test(v)) errs[f.id] = 'email';
    else if (f.field === 'phone' && (phoneDigits(v).length < 8 || phoneDigits(v).length > 15)) errs[f.id] = 'phone';
  }
  const cons = formConsent(c);
  if (cons?.required && !consent) errs[cons.id] = 'consent';
  if (!any && !Object.keys(errs).length) errs._form = 'empty';
  return errs;
}

// ---------------------------------------------------------------------------------------------
// Quando aparece
// ---------------------------------------------------------------------------------------------

/** Caminho bate com o padrão? "*" no fim = começa por; sem "*" = igual (barra final não conta). */
export function pathMatches(path: string, pattern: string): boolean {
  const p = (path.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  const pat = pattern.trim();
  if (!pat) return false;
  if (pat.endsWith('*')) return p.startsWith(pat.slice(0, -1).replace(/\/+$/, '') || '/');
  return p === (pat.replace(/\/+$/, '') || '/');
}

/** Páginas onde nenhum pop-up aparece, seja qual for a regra. */
export const NEVER_PATHS = ['/admin*', '/punchout*', '/newsletter/cancelar*', '/unsubscribe*'];

export function pageAllowed(r: PopupRules, path: string): boolean {
  if (NEVER_PATHS.some((p) => pathMatches(path, p))) return false;
  if (r.exclude.some((p) => pathMatches(path, p))) return false;
  switch (r.pages) {
    case 'home': return pathMatches(path, '/');
    case 'products': return pathMatches(path, '/produto/*');
    case 'catalog': return ['/produtos*', '/categoria/*', '/produto/*', '/kits*', '/kit/*'].some((p) => pathMatches(path, p));
    case 'custom': return r.include.some((p) => pathMatches(path, p));
    default: return true;
  }
}

/** O que o aparelho lembra de cada pop-up (ms desde 1970). */
export type PopupMemory = { seen?: number; closed?: number; submitted?: number };

export type VisitContext = {
  path: string;
  device: Device;
  loggedIn: boolean;
  country: string | null;
  locale: string;
  /** já apareceu nesta visita (aba) */
  seenThisSession: boolean;
  memory: PopupMemory | undefined;
  now: number;
};

const DAY = 86_400_000;

export type Blocked = 'page' | 'device' | 'audience' | 'country' | 'locale' | 'submitted' | 'frequency';

/** Motivo para não mostrar (null = pode mostrar). */
export function popupBlocked(r: PopupRules, ctx: VisitContext): Blocked | null {
  if (!pageAllowed(r, ctx.path)) return 'page';
  if (!r.devices[ctx.device]) return 'device';
  if (r.audience === 'guests' && ctx.loggedIn) return 'audience';
  if (r.audience === 'customers' && !ctx.loggedIn) return 'audience';
  if (r.countries.length && (!ctx.country || !r.countries.includes(ctx.country))) return 'country';
  if (r.locales.length && !r.locales.includes(ctx.locale as PopupLocale)) return 'locale';
  const m = ctx.memory ?? {};
  if (r.hideAfterSubmit && m.submitted) return 'submitted';
  switch (r.frequency) {
    case 'once': if (m.seen) return 'frequency'; break;
    case 'session': if (ctx.seenThisSession) return 'frequency'; break;
    case 'days': {
      const last = Math.max(m.seen ?? 0, m.closed ?? 0);
      if (ctx.seenThisSession || (last && ctx.now - last < r.days * DAY)) return 'frequency';
      break;
    }
    case 'always': break;
  }
  return null;
}

/** O primeiro pop-up que pode aparecer (menor prioridade primeiro). */
export function choosePopup<T extends { id: string; priority: number; rules: PopupRules }>(list: T[], ctx: (p: T) => VisitContext): T | null {
  const sorted = [...list].sort((a, b) => a.priority - b.priority);
  return sorted.find((p) => popupBlocked(p.rules, ctx(p)) === null) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Medidas e celular
// ---------------------------------------------------------------------------------------------

/** Escala para caber na janela (nunca aumenta). */
export function fitScale(size: Size, viewW: number, viewH: number, margin = 24): number {
  const k = Math.min(1, (viewW - margin) / size.w, (viewH - margin) / size.h);
  return Math.max(0.2, Number.isFinite(k) ? k : 1);
}

/** Tamanho da letra no celular quando não foi escolhido: proporcional à largura, nunca abaixo de 12px. */
export function mobileFont(size: number, c: Pick<PopupContent, 'size'>): number {
  return Math.max(12, Math.round(size * Math.min(1, c.size.mobile.w / c.size.desktop.w)));
}

/** Altura aproximada de um elemento em px (para empilhar no celular). */
export function estimateHeight(el: PopupElement, widthPx: number, fontSize?: number): number {
  switch (el.type) {
    case 'text': {
      const size = fontSize ?? el.size;
      const chars = Math.max(1, pickText(el.text, 'pt-BR').length);
      const perLine = Math.max(4, Math.floor((widthPx - el.padding * 2) / (size * 0.55)));
      const lines = pickText(el.text, 'pt-BR').split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0) || Math.ceil(chars / perLine);
      return lines * size * el.lineHeight + el.padding * 2;
    }
    case 'field': return el.height + (el.showLabel ? el.size + 8 : 0);
    case 'button': return el.height;
    case 'consent': return Math.ceil((pickText(el.text, 'pt-BR').length * el.size * 0.55) / Math.max(40, widthPx - 30)) * el.size * 1.4 + 4;
    case 'coupon': return el.size * 1.3 + 56;
    default: return el.mobile.h != null ? 0 : 40;
  }
}

/**
 * Arruma o celular automaticamente: os elementos visíveis um abaixo do outro, pela ordem em que aparecem no
 * computador (de cima para baixo), com margens iguais. Imagens mantêm a proporção; formas passam a cobrir a área.
 * fitHeight = a altura do celular passa a caber tudo (dentro dos limites); senão a pilha fica centrada na altura
 * que já existe (o passo "depois de enviar" usa a mesma caixa do formulário).
 */
export function stackForMobile(c: PopupContent, step: StepId, fitHeight = true): PopupContent {
  const W = c.size.mobile.w;
  const pad = 24;
  const gap = 12;
  const inner = W - pad * 2;
  const els = c[step].elements;
  const flow = els.filter((e) => !e.hidden.mobile && e.type !== 'shape')
    .sort((a, b) => a.desktop.y - b.desktop.y || a.desktop.x - b.desktop.x);
  const top = pad + (c.close.show ? 28 : 0);
  let y = top;
  const rows = new Map<string, { px: number; h: number; w: number }>();
  for (const el of flow) {
    let wPx = inner;
    let h: number;
    if (el.type === 'image') {
      const ratio = ((el.desktop.h ?? 20) * c.size.desktop.h) / Math.max(1, el.desktop.w * c.size.desktop.w);
      wPx = Math.min(inner, (el.desktop.w / 100) * c.size.desktop.w);
      h = wPx * ratio;
    } else {
      h = estimateHeight(el, inner, el.type === 'text' ? el.mobileSize ?? mobileFont(el.size, c) : undefined);
    }
    rows.set(el.id, { px: y, h, w: wPx });
    y += h + gap;
  }
  const needed = (flow.length ? y - gap : top) + pad;
  const lim = SIZE_LIMITS.mobile;
  const total = fitHeight ? Math.round(Math.min(lim.maxH, Math.max(lim.minH, needed))) : c.size.mobile.h;
  const offset = fitHeight ? 0 : Math.max(0, (total - needed) / 2);
  const elements = els.map((el) => {
    const r = rows.get(el.id);
    if (r) {
      const wPct = round((100 * r.w) / W);
      const mobile: Box = { x: round((100 - wPct) / 2), y: round((100 * (r.px + offset)) / total), w: wPct, h: null };
      if (el.type === 'image') mobile.h = round((100 * r.h) / total);
      return { ...el, mobile };
    }
    if (el.type === 'shape') return { ...el, mobile: { x: 0, y: 0, w: 100, h: 100 } };
    return el;
  });
  return { ...c, size: { ...c.size, mobile: { w: W, h: total } }, [step]: { ...c[step], elements } };
}

/**
 * Depois de mudar a altura (ex.: "Ajustar à imagem"), afasta as peças que passaram a ficar umas por cima das outras:
 * cada uma desce até ficar abaixo da anterior (com gap px) e, se o grupo sair da caixa, sobe tudo o que foi mexido.
 */
export function keepApart(c: PopupContent, step: StepId, d: Device, gap = 8): PopupContent {
  const { w: W, h: H } = c.size[d];
  const px = (el: PopupElement) => {
    const b = el[d] ?? el.desktop;
    const font = d === 'mobile' && el.type === 'text' ? el.mobileSize ?? mobileFont(el.size, c) : undefined;
    const h = b.h != null ? (b.h / 100) * H : estimateHeight(el, (b.w / 100) * W, font);
    return { top: (b.y / 100) * H, h, x0: b.x, x1: b.x + b.w };
  };
  const list = c[step].elements
    .filter((e) => !e.hidden[d] && e.type !== 'shape' && !((e[d] ?? e.desktop).h != null && (e[d] ?? e.desktop).h! >= 90))
    .map((el) => ({ el, ...px(el) }))
    .sort((a, b) => a.top - b.top);
  const moved = new Map<string, number>();
  for (let i = 1; i < list.length; i++) {
    const cur = list[i];
    for (let j = 0; j < i; j++) {
      const prev = list[j];
      const crossX = cur.x0 < prev.x1 && prev.x0 < cur.x1;
      const bottom = prev.top + prev.h + gap;
      if (crossX && cur.top < bottom && cur.top + cur.h > prev.top) { cur.top = bottom; moved.set(cur.el.id, cur.top); }
    }
  }
  if (!moved.size) return c;
  const last = Math.max(...list.map((r) => r.top + r.h));
  const over = Math.max(0, last - (H - gap * 2));
  if (over) {
    // sobe o bloco inteiro a partir da peça logo acima da primeira que desceu
    const first = list.findIndex((r) => moved.has(r.el.id));
    for (const r of list.slice(Math.max(0, first - 1))) moved.set(r.el.id, Math.max(0, r.top - over));
  }
  const elements = c[step].elements.map((el) => {
    const y = moved.get(el.id);
    if (y == null) return el;
    const b = el[d] ?? el.desktop;
    return { ...el, [d]: { ...b, y: round((100 * y) / H) } };
  });
  return { ...c, [step]: { ...c[step], elements } };
}

/** Copia as posições do computador para o celular (mesmas % da área). */
export function copyDesktopToMobile(c: PopupContent, step: StepId): PopupContent {
  return { ...c, [step]: { ...c[step], elements: c[step].elements.map((e) => ({ ...e, mobile: { ...e.desktop } })) } };
}

/** Altura que mantém a proporção de uma imagem (para "ajustar à imagem"). */
export function heightForImage(width: number, natW: number, natH: number, d: Device): number {
  const lim = SIZE_LIMITS[d];
  if (!natW || !natH) return lim.minH;
  return Math.round(Math.min(lim.maxH, Math.max(lim.minH, width * natH / natW)));
}

// ---------------------------------------------------------------------------------------------
// Modelos prontos
// ---------------------------------------------------------------------------------------------

export type TemplateId = 'vip' | 'image' | 'corner' | 'announce' | 'blank';
export const TEMPLATE_IDS: TemplateId[] = ['vip', 'image', 'corner', 'announce', 'blank'];

/** Textos do antigo Modal VIP (visual_settings.broadcast_modal), quando a loja já os tinha. */
export type LegacyVip = { title?: string; description?: string; button_text?: string; discount_code?: string; terms_text?: string };

function successStep(withCoupon: boolean): Step {
  const title = { ...newElement('text', 22) as TextEl, text: L('Tudo certo!', 'Tudo certo!', 'All set!', '¡Listo!'), size: 30, weight: 800 };
  const body = { ...newElement('text', 36) as TextEl,
    text: withCoupon
      ? L('Use o cupom abaixo na sua primeira compra.', 'Use o cupão abaixo na sua primeira compra.', 'Use the coupon below on your first order.', 'Usa el cupón de abajo en tu primera compra.')
      : L('Recebemos o seu contato. Em breve você recebe novidades.', 'Recebemos o seu contacto. Em breve recebe novidades.', 'We got your details. News is on the way.', 'Recibimos tus datos. Pronto recibirás novedades.'),
    size: 16, weight: 400, color: '#404040' };
  const btn = { ...newElement('button', withCoupon ? 74 : 56) as ButtonEl, action: 'close' as const,
    text: L('Continuar comprando', 'Continuar a comprar', 'Keep shopping', 'Seguir comprando') };
  const els: PopupElement[] = [title, body];
  if (withCoupon) els.push(newElement('coupon', 50));
  els.push(btn);
  return { bg: defaultBackground(), elements: els };
}

/** Pop-up novo a partir de um modelo. O modelo "vip" usa os textos do antigo Modal VIP quando existirem. */
export function templateContent(id: TemplateId, legacy?: LegacyVip | null): { content: PopupContent; rules: PopupRules; coupon: string } {
  const c = defaultContent();
  const r = defaultRules();
  const pt = (v: string | undefined, fb: L10n): L10n => (v && v.trim() ? { ...fb, 'pt-BR': v.trim() } : fb);
  switch (id) {
    case 'vip': {
      const coupon = (legacy?.discount_code ?? 'VIP10').trim().toUpperCase() || 'VIP10';
      const title = { ...newElement('text', 9) as TextEl, text: pt(legacy?.title, L('Participe da nossa Lista VIP', 'Junte-se à nossa Lista VIP', 'Join our VIP list', 'Únete a nuestra lista VIP')), size: 30, weight: 800, lineHeight: 1.15, letterSpacing: -0.5 };
      const desc = { ...newElement('text', 25) as TextEl, text: pt(legacy?.description, L('Receba descontos exclusivos e novidades em primeira mão.', 'Receba descontos exclusivos e novidades em primeira mão.', 'Get exclusive discounts and news first.', 'Recibe descuentos exclusivos y novedades antes que nadie.')), size: 16, weight: 400, color: '#404040' };
      const name = newElement('field', 39, { field: 'name', required: false });
      const email = newElement('field', 50, { field: 'email' });
      const phone = newElement('field', 61, { field: 'phone', required: false });
      const consent = { ...newElement('consent', 72.5) as ConsentEl, text: pt(legacy?.terms_text, (newElement('consent') as ConsentEl).text) };
      const btn = { ...newElement('button', 84) as ButtonEl, text: pt(legacy?.button_text, L('Quero entrar na lista', 'Quero entrar na lista', 'Join the list', 'Quiero unirme')) };
      c.form.elements = [title, desc, name, email, phone, consent, btn];
      c.form.bg = { ...c.form.bg, color: '#FFFFFF' };
      c.size.desktop = { w: 520, h: 600 };
      c.success = successStep(true);
      return { content: stackForMobile(stackForMobile(c, 'form'), 'success', false), rules: r, coupon };
    }
    case 'image': {
      // A arte explica tudo: só a imagem de fundo, o campo e o botão.
      c.size.desktop = { w: 600, h: 600 };
      c.size.mobile = { w: 340, h: 520 };
      c.close = { ...c.close, bg: '#FFFFFF' };
      const email = newElement('field', 73, { field: 'email' }) as FieldEl;
      const btn = newElement('button', 84) as ButtonEl;
      email.desktop = { x: 12, y: 72, w: 76, h: null };
      btn.desktop = { x: 12, y: 83, w: 76, h: null };
      email.mobile = { x: 8, y: 70, w: 84, h: null };
      btn.mobile = { x: 8, y: 82, w: 84, h: null };
      c.form.elements = [email, btn];
      c.form.bg = { ...c.form.bg, color: '#F5F1EA', fit: 'cover' };
      c.success = successStep(true);
      return { content: stackForMobile(c, 'success', false), rules: r, coupon: 'BEMVINDO10' };
    }
    case 'corner': {
      c.size = { desktop: { w: 360, h: 300 }, mobile: { w: 340, h: 280 } };
      c.position = { desktop: 'bottom-right', mobile: 'bottom' };
      c.backdrop = { ...c.backdrop, show: false };
      c.animation = 'slide';
      c.teaser.enabled = true;
      const title = { ...newElement('text', 10) as TextEl, text: L('10% na primeira compra', '10% na primeira compra', '10% off your first order', '10% en tu primera compra'), size: 22, weight: 800, align: 'left' as const };
      const desc = { ...newElement('text', 30) as TextEl, text: L('Deixe seu e-mail e receba o cupom.', 'Deixe o seu e-mail e receba o cupão.', 'Leave your email and get the coupon.', 'Deja tu correo y recibe el cupón.'), size: 15, weight: 400, color: '#404040', align: 'left' as const };
      const email = newElement('field', 50, { field: 'email' });
      const btn = { ...newElement('button', 72) as ButtonEl, text: L('Receber cupom', 'Receber cupão', 'Get coupon', 'Recibir cupón') };
      for (const el of [title, desc, email, btn]) { el.desktop = { ...el.desktop, x: 7, w: 86 }; el.mobile = { ...el.desktop }; }
      c.form.elements = [title, desc, email, btn];
      c.success = successStep(true);
      return { content: stackForMobile(c, 'success', false), rules: { ...r, trigger: 'scroll', scroll: 30 }, coupon: 'PRIMEIRA10' };
    }
    case 'announce': {
      c.size.desktop = { w: 640, h: 400 };
      c.size.mobile = { w: 340, h: 460 };
      const btn = { ...newElement('button', 80) as ButtonEl, action: 'link' as const, href: '/produtos?promo=1',
        text: L('Ver ofertas', 'Ver ofertas', 'See offers', 'Ver ofertas') };
      btn.desktop = { x: 30, y: 78, w: 40, h: null };
      btn.mobile = { x: 10, y: 80, w: 80, h: null };
      const skip = { ...newElement('button', 90) as ButtonEl, action: 'close' as const, variant: 'text' as const, size: 14, height: 32, weight: 500,
        text: L('Agora não', 'Agora não', 'Not now', 'Ahora no') };
      skip.desktop = { x: 35, y: 90, w: 30, h: null };
      skip.mobile = { x: 25, y: 91, w: 50, h: null };
      c.form.elements = [btn, skip];
      c.form.bg = { ...c.form.bg, color: '#FFF0E7' };
      c.success = { bg: defaultBackground(), elements: [] };
      return { content: c, rules: { ...r, frequency: 'session' }, coupon: '' };
    }
    default:
      c.success = successStep(false);
      return { content: stackForMobile(c, 'success', false), rules: r, coupon: '' };
  }
}
