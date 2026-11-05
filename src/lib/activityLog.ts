// =============================================================================================
// Registo de atividade do Admin (recurso activity_log; Admin > Configurações > Registo de atividade e blocos nas
// páginas do produto e do pedido). Regras puras para as telas; o registo é do servidor:
//   admin_activity_log (trigger admin_activity_capture), admin_activity_list / _summary / _actors / _logins
//   (migration 20261007040000_admin_activity_log.sql). Funções com chave de serviço: _shared/activityLog.ts.
// Sem imports. Teste: node --experimental-strip-types scripts/test-activity-log.mjs
// =============================================================================================

export type ActivityAction = 'create' | 'update' | 'delete';
export type Change = { o: unknown; n: unknown };
export type ActivityRow = {
  id: number; created_at: string; actor: string | null; actor_email: string | null; action: ActivityAction;
  entity: string; entity_id: string | null; entity_label: string | null; parent_id: string | null;
  changes: Record<string, Change>; ip: string | null; user_agent: string | null;
};

/** Grupos do filtro: cada tabela registada pertence a um (a mesma lista do trigger na migration). */
export const ENTITY_GROUPS = {
  catalog: [
    'products', 'product_variations', 'product_sizes', 'product_variation_size_availability', 'product_images',
    'product_categories', 'product_volume_tiers', 'product_faqs', 'product_spec_options', 'related_products',
    'product_subscription_plans', 'product_rentals', 'product_preorders', 'product_digital', 'digital_files', 'warehouses', 'categories', 'brands', 'spec_attributes', 'spec_options', 'kits', 'kit_items', 'size_presets', 'variation_presets',
  ],
  orders: ['orders', 'order_items', 'order_notes', 'order_invoices', 'payment_refunds', 'return_requests', 'order_shipments'],
  customers: ['auth_users', 'user_profiles', 'user_addresses', 'user_roles', 'customer_groups', 'customer_group_members', 'customer_group_prices', 'product_reviews', 'product_questions', 'stock_alerts', 'abandoned_cart_contacts', 'newsletter_subscriptions'],
  sales: ['coupons', 'gift_cards', 'checkout_fields', 'subscriptions', 'rental_bookings', 'vendors', 'vendor_payouts', 'affiliates', 'affiliate_payouts', 'quote_requests', 'quote_items', 'punchout_buyers', 'finance_entries', 'finance_categories'],
  content: ['banners', 'home_sections', 'home_section_items', 'home_product_sections', 'site_pages', 'site_faqs', 'menu_items', 'email_templates', 'blog_posts', 'blog_comments', 'polls', 'poll_options', 'lead_popups', 'popup_leads', 'newsletter_campaigns', 'forum_categories', 'forum_topics', 'forum_posts'],
  settings: ['store_settings', 'countries', 'payment_config', 'integration_credentials', 'delivery_methods', 'shipping_regions', 'shipping_services', 'shipping_service_rates', 'shipping_rates', 'shipping_zones', 'finance_settings'],
} as const;
export type EntityGroup = keyof typeof ENTITY_GROUPS | 'all';
export const ENTITY_GROUP_IDS = ['all', ...Object.keys(ENTITY_GROUPS)] as EntityGroup[];

export const entitiesOf = (g: EntityGroup): string[] | null => (g === 'all' ? null : [...ENTITY_GROUPS[g]]);
export const groupOf = (entity: string): Exclude<EntityGroup, 'all'> | null =>
  (Object.keys(ENTITY_GROUPS) as Exclude<EntityGroup, 'all'>[]).find((g) => (ENTITY_GROUPS[g] as readonly string[]).includes(entity)) ?? null;

const PRODUCT_PARTS = new Set<string>(ENTITY_GROUPS.catalog.filter((e) => e.startsWith('product') || e === 'related_products' || e === 'digital_files'));
const ORDER_PARTS = new Set<string>(['order_items', 'order_notes', 'order_invoices', 'payment_refunds', 'return_requests']);
const CUSTOMER_PARTS = new Set<string>(['auth_users', 'user_profiles', 'user_addresses', 'user_roles', 'customer_group_members']);

/** Página do Admin do registo alterado (null = sem página própria ou registo apagado sem ligação). */
export function activityHref(r: Pick<ActivityRow, 'entity' | 'entity_id' | 'parent_id' | 'action'>): string | null {
  const id = r.entity_id;
  if (r.entity === 'products') return r.action === 'delete' || !id ? null : `/admin/produto/${id}`;
  if (PRODUCT_PARTS.has(r.entity)) return r.parent_id ? `/admin/produto/${r.parent_id}` : null;
  if (r.entity === 'orders') return r.action === 'delete' || !id ? null : `/admin/pedidos/${id}`;
  if (ORDER_PARTS.has(r.entity)) return r.parent_id ? `/admin/pedidos/${r.parent_id}` : null;
  if (CUSTOMER_PARTS.has(r.entity)) {
    const uid = r.entity === 'auth_users' ? id : r.parent_id;
    return uid && !(r.entity === 'auth_users' && r.action === 'delete') ? `/admin/clientes/${uid}` : null;
  }
  if (r.entity === 'coupons') return r.action === 'delete' || !id ? null : `/admin/cupons/${id}`;
  if (r.entity === 'subscriptions') return r.action === 'delete' || !id ? null : `/admin?tab=subscriptions&ver=assinatura&id=${id}`;
  if (r.entity === 'rental_bookings') return r.action === 'delete' || !id ? null : `/admin?tab=rentals&ver=reserva&id=${id}`;
  if (r.entity === 'categories') return r.action === 'delete' || !id ? null : `/admin/categorias/${id}`;
  return null;
}

/** Valor de um campo para mostrar: vazio, sim/não, texto, número ou JSON curto. */
export function formatChangeValue(v: unknown, yesNo: { yes: string; no: string; empty: string }): string {
  if (v === null || v === undefined || v === '') return yesNo.empty;
  if (typeof v === 'boolean') return v ? yesNo.yes : yesNo.no;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v) && v.length === 0) return yesNo.empty;
  const s = JSON.stringify(v);
  return s.length > 300 ? `${s.slice(0, 300)}...` : s;
}

/** Nome legível de um campo sem tradução própria: "value.free_shipping_from" -> "Value: free shipping from". */
export function humanField(field: string): string {
  const parts = field.split('.').map((p) => p.replace(/_/g, ' ').trim());
  const s = parts.join(': ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Campos alterados em ordem estável (os mais importantes primeiro). */
const FIRST = ['name', 'title', 'code', 'status', 'payment_status', 'price', 'stock_quantity', 'is_active', 'active'];
export function changedFields(changes: Record<string, Change> | null | undefined): string[] {
  const keys = Object.keys(changes ?? {});
  const rank = (k: string) => { const i = FIRST.indexOf(k); return i < 0 ? FIRST.length : i; };
  return keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Navegador e sistema em poucas palavras, a partir do user-agent. */
export function shortAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  return [browser, os].filter(Boolean).join(' · ') || null;
}

/** Prazo de guarda (dias): 0 = guardar tudo; outros valores entre 30 e 3650. */
export const RETENTION_OPTIONS = [90, 180, 365, 730, 0] as const;
export function normalizeRetention(raw: unknown): number {
  const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).retention_days : undefined;
  const n = Number(v);
  if (v === undefined || v === null || !Number.isFinite(n)) return 365;
  if (n <= 0) return 0;
  return Math.min(Math.max(Math.floor(n), 30), 3650);
}

export type ActivityPeriod = '1d' | '7d' | '30d' | '90d' | 'all';
const DAYS: Record<Exclude<ActivityPeriod, 'all'>, number> = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
export function activitySince(p: ActivityPeriod, now = new Date()): string | null {
  return p === 'all' ? null : new Date(now.getTime() - DAYS[p] * 86_400_000).toISOString();
}

/** Totais do período a partir de admin_activity_summary. */
export function activityTotals(rows: { action: string; entity: string; changes: number }[]) {
  const by = (a: ActivityAction) => rows.filter((r) => r.action === a).reduce((s, r) => s + Number(r.changes || 0), 0);
  return { total: rows.reduce((s, r) => s + Number(r.changes || 0), 0), created: by('create'), updated: by('update'), deleted: by('delete') };
}
