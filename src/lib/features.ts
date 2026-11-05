// =====================================================================================
// Recursos da loja: catálogo dos recursos opcionais que o dono liga ou desliga em Admin > Recursos da loja.
// O valor fica em store_settings.features ({ "<id>": true | false }); recurso sem valor = defaultOn daqui.
// O servidor usa o mesmo nome e o mesmo padrão em public.feature_enabled(<id>, <padrão>).
//
// Recurso novo = uma entrada em FEATURES (categoria, padrão, seções do Admin que somem quando está desligado,
// seção onde se configura) + nome e explicação em src/i18n/adminFeatures.ts (f_<id>, f_<id>_d) + useFeature(<id>)
// nos pontos do site que ele mostra. Sem imports com @/ para o teste em node (scripts/test-features.mjs).
// =====================================================================================

export const FEATURE_CATEGORIES = ['sales', 'catalog', 'customers', 'orders', 'marketing', 'content', 'security', 'tools'] as const;
export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

export type FeatureDef = {
  id: string;
  category: FeatureCategory;
  /** Ligado numa loja nova (sem valor gravado). */
  defaultOn: boolean;
  /** Seções do Admin (adminSections.ts) que só aparecem com o recurso ligado. */
  sections?: string[];
  /** Seção do Admin onde se configura (atalho "Configurar"). */
  configSection?: string;
  /** Precisa do envio de e-mails para funcionar por completo. */
  needsEmail?: boolean;
};

export const FEATURES: FeatureDef[] = [
  // Vendas
  { id: 'returns', category: 'sales', defaultOn: true, sections: ['returns'], configSection: 'returns' },
  { id: 'lowest_price', category: 'sales', defaultOn: true, configSection: 'compliance' },
  { id: 'gift_cards', category: 'sales', defaultOn: false, sections: ['gift-cards'], configSection: 'gift-cards' },
  { id: 'reward_points', category: 'sales', defaultOn: false, sections: ['reward-points'], configSection: 'reward-points' },
  { id: 'subscriptions', category: 'sales', defaultOn: false, sections: ['subscriptions'], configSection: 'subscriptions' },
  { id: 'rentals', category: 'sales', defaultOn: false, sections: ['rentals'], configSection: 'rentals' },
  { id: 'preorders', category: 'sales', defaultOn: true, sections: ['preorders'], configSection: 'preorders' },
  { id: 'marketplace', category: 'sales', defaultOn: false, sections: ['vendors'], configSection: 'vendors' },
  { id: 'digital_products', category: 'sales', defaultOn: false, sections: ['downloads'], configSection: 'downloads' },
  { id: 'checkout_fields', category: 'sales', defaultOn: true, sections: ['checkout-fields'], configSection: 'checkout-fields' },
  { id: 'auto_exchange_rates', category: 'sales', defaultOn: false, configSection: 'currencies' },
  { id: 'quotes', category: 'sales', defaultOn: false, sections: ['quotes'], configSection: 'quotes' },
  { id: 'punchout', category: 'sales', defaultOn: false, sections: ['punchout'], configSection: 'punchout' },
  { id: 'finance', category: 'sales', defaultOn: true, sections: ['finance'], configSection: 'finance' },
  { id: 'abandoned_carts', category: 'sales', defaultOn: true, sections: ['abandoned-carts'], configSection: 'abandoned-carts', needsEmail: true },
  // Pedidos e entrega
  { id: 'shipping_estimate', category: 'orders', defaultOn: true, configSection: 'delivery' },
  { id: 'delivery_dates', category: 'orders', defaultOn: false, sections: ['delivery-dates'], configSection: 'delivery-dates' },
  { id: 'partial_shipments', category: 'orders', defaultOn: false },
  { id: 'order_printing', category: 'orders', defaultOn: true, sections: ['order-printing'], configSection: 'order-printing' },
  // Catálogo
  { id: 'product_safety', category: 'catalog', defaultOn: true, configSection: 'compliance' },
  { id: 'wishlist', category: 'catalog', defaultOn: true },
  { id: 'spec_filters', category: 'catalog', defaultOn: true, sections: ['specs'], configSection: 'specs' },
  { id: 'compare', category: 'catalog', defaultOn: true, sections: ['compare'], configSection: 'compare' },
  { id: 'variants', category: 'catalog', defaultOn: true },
  { id: 'brands', category: 'catalog', defaultOn: false, sections: ['brands'], configSection: 'brands' },
  { id: 'price_display', category: 'sales', defaultOn: true, sections: ['price-display'], configSection: 'price-display' },
  { id: 'kits', category: 'sales', defaultOn: true, sections: ['kits'], configSection: 'kits' },
  { id: 'cross_sell', category: 'sales', defaultOn: true, sections: ['cross-sell'], configSection: 'cross-sell' },
  { id: 'stock_history', category: 'catalog', defaultOn: true, sections: ['stock-history'], configSection: 'stock-history' },
  { id: 'barcode_stock', category: 'catalog', defaultOn: true, sections: ['stock-entries'], configSection: 'stock-entries' },
  { id: 'barcode_labels', category: 'catalog', defaultOn: true, sections: ['barcode-labels'], configSection: 'barcode-labels' },
  { id: 'warehouses', category: 'catalog', defaultOn: false, sections: ['warehouses'], configSection: 'warehouses' },
  { id: 'stock_alerts', category: 'catalog', defaultOn: true, sections: ['stock-alerts'], configSection: 'stock-alerts', needsEmail: true },
  { id: 'cart_reservations', category: 'catalog', defaultOn: true, sections: ['cart-reservations'], configSection: 'cart-reservations' },
  // Clientes
  { id: 'order_messages', category: 'customers', defaultOn: true },
  { id: 'product_questions', category: 'customers', defaultOn: true, sections: ['product-questions'], configSection: 'product-questions' },
  { id: 'customer_groups', category: 'customers', defaultOn: false, sections: ['customer-groups'], configSection: 'customer-groups' },
  // Marketing e divulgação
  { id: 'product_feed', category: 'marketing', defaultOn: false, sections: ['product-feed'], configSection: 'product-feed' },
  { id: 'affiliates', category: 'marketing', defaultOn: false, sections: ['affiliates'], configSection: 'affiliates' },
  { id: 'lead_popups', category: 'marketing', defaultOn: true, sections: ['popups'], configSection: 'popups' },
  { id: 'newsletter_campaigns', category: 'marketing', defaultOn: false, sections: ['newsletter'], configSection: 'newsletter', needsEmail: true },
  // Conteúdo
  { id: 'site_pages', category: 'content', defaultOn: true, sections: ['pages'], configSection: 'pages' },
  { id: 'store_reviews', category: 'content', defaultOn: true, configSection: 'reviews' },
  { id: 'blog', category: 'content', defaultOn: false, sections: ['blog'], configSection: 'blog' },
  { id: 'polls', category: 'content', defaultOn: false, sections: ['polls'], configSection: 'polls' },
  { id: 'forum', category: 'content', defaultOn: false, sections: ['forum'], configSection: 'forum' },
  // Segurança e acesso
  { id: 'activity_log', category: 'security', defaultOn: true, sections: ['activity-log'], configSection: 'activity-log' },
  { id: 'admin_2fa', category: 'security', defaultOn: true, configSection: 'account-security' },
  { id: 'social_login', category: 'customers', defaultOn: false, configSection: 'account-security' },
  // Ferramentas do site
  { id: 'quote_3d', category: 'tools', defaultOn: true },
  { id: 'customizer', category: 'tools', defaultOn: true },
];

export type FeatureFlags = Record<string, boolean>;

/** Páginas do site que pertencem a um recurso: links para elas somem quando ele está desligado (FeatureLink, useHrefOn). */
export const FEATURE_PATHS: Record<string, string> = {
  '/favoritos': 'wishlist',
  '/orcamento-3d': 'quote_3d',
  '/personalizar': 'customizer',
  '/marcas': 'brands',
  '/vender': 'marketplace',
  '/afiliados': 'affiliates',
  '/pedido-de-orcamento': 'quotes',
  '/avaliacoes': 'store_reviews',
  '/kits': 'kits',
  '/blog': 'blog',
  '/enquetes': 'polls',
  '/forum': 'forum',
  '/punchout': 'punchout',
  '/comparar': 'compare',
};

/** Recurso dono de um endereço (só o caminho conta: "/personalizar?x=1" = customizer). */
export function pathFeature(href: string): string | undefined {
  return FEATURE_PATHS[href.split(/[?#]/)[0]];
}

const BY_ID = new Map(FEATURES.map((f) => [f.id, f]));

export const featureDef = (id: string) => BY_ID.get(id);

/** O recurso está ligado? (valor gravado, senão o padrão do catálogo; recurso desconhecido = ligado) */
export function featureOn(flags: FeatureFlags | null | undefined, id: string): boolean {
  const v = flags?.[id];
  if (typeof v === 'boolean') return v;
  return BY_ID.get(id)?.defaultOn ?? true;
}

/** A seção do Admin aparece no menu? (some quando o recurso dono dela está desligado) */
export function sectionVisible(flags: FeatureFlags | null | undefined, sectionId: string): boolean {
  return FEATURES.every((f) => !f.sections?.includes(sectionId) || featureOn(flags, f.id));
}

/** O link pode aparecer? (endereço sem recurso dono = sempre) */
export function hrefOn(flags: FeatureFlags | null | undefined, href: string): boolean {
  const f = pathFeature(href);
  return !f || featureOn(flags, f);
}

/** Só valores booleanos de recursos conhecidos (o que vem da base pode ter lixo). */
export function normalizeFlags(v: unknown): FeatureFlags {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: FeatureFlags = {};
  for (const f of FEATURES) if (typeof o[f.id] === 'boolean') out[f.id] = o[f.id] as boolean;
  return out;
}
