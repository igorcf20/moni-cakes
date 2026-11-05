// =====================================================================================
// Seções do painel Admin, por grupo (menu lateral em acordeão: um grupo aberto por vez, ver AdminNav.tsx). Cada uma: id (usado em /admin?tab=<id>) e ícone; o nome e a
// explicação são s_<id> e d_<id> em src/i18n/admin.ts, e o conteúdo fica em src/pages/Admin.tsx (SECTION_VIEWS).
// Seção nova = uma linha aqui + os dois textos no dicionário + o componente em Admin.tsx.
// Páginas próprias (pedido, cliente, produto) usam o mesmo menu com a seção de origem marcada (AdminShell).
// =====================================================================================
import type { LucideIcon } from "lucide-react";
import { CircleUser } from "lucide-react";
import {
  BarChart3, Package, ShoppingCart, Warehouse, Ticket, Star, Image, FolderTree, Settings, Ruler, Truck, CreditCard, Mail, Palette,
  Puzzle, Users, BookOpen, Plug, LayoutTemplate, TrendingUp, Gift,
  GitCompareArrows, Megaphone, Cookie, RotateCcw, ShieldCheck, FileText,
  ToggleRight, BellRing, ShoppingBasket, WalletCards, Coins, ListFilter, Link2, UsersRound, Tag, Rss, Banknote, History, ScrollText, LockKeyhole, ListChecks, CalendarClock, Repeat, CalendarRange, Download, Store, Handshake, ClipboardList, Newspaper, Vote, MailOpen, MessagesSquare, Building2, LayoutDashboard, Boxes, Layers, Timer, Hourglass, BadgePercent, Barcode, MessageCircleQuestion, ScanBarcode,Printer, Landmark, PanelTop, PanelsTopLeft } from "lucide-react";
import { LayoutGrid } from "lucide-react";
import type { AdminKey } from "@/i18n/admin";
import type { AdminAttention } from "@/hooks/useAdminAttention";

export type AdminSection = {
  value: string;
  icon: LucideIcon;
  /** Seção herdada cujo conteúdo o visual novo do site ainda não mostra (aviso honesto ao dono). */
  notOnSite?: boolean;
  /** Número no menu: o que está à espera do administrador nesta seção. */
  badge?: (a: AdminAttention) => number;
};

/** Grupo do menu: abre e fecha como acordeão (um aberto por vez); o da seção atual abre sozinho. */
export type AdminGroup = { label: AdminKey; icon: LucideIcon; items: AdminSection[] };

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    label: "g_overview",
    icon: LayoutDashboard,
    items: [
      { value: "stats", icon: BarChart3 },
      { value: "profit", icon: TrendingUp },
      { value: "finance", icon: Landmark },
    ],
  },
  {
    label: "g_orders",
    icon: ShoppingCart,
    items: [
      { value: "orders", icon: ShoppingCart, badge: (a) => a.cancelRequests + a.proofsToConfirm + a.toProduce },
      { value: "order-printing", icon: Printer, badge: (a) => a.toPrint },
      { value: "returns", icon: RotateCcw, badge: (a) => a.returns },
      { value: "abandoned-carts", icon: ShoppingBasket },
      { value: "checkout-fields", icon: ListChecks },
    ],
  },
  {
    label: "g_customers",
    icon: Users,
    items: [
      { value: "customers", icon: Users },
      { value: "customer-groups", icon: UsersRound },
      { value: "reviews", icon: Star, badge: (a) => a.reviews },
      { value: "product-questions", icon: MessageCircleQuestion, badge: (a) => a.questions },
    ],
  },
  {
    label: "g_catalog",
    icon: Package,
    items: [
      { value: "products", icon: Package, badge: (a) => a.outOfStock },
      { value: "categories", icon: FolderTree },
      { value: "specs", icon: ListFilter },
      { value: "brands", icon: Tag },
      { value: "cross-sell", icon: Link2 },
      { value: "sizes", icon: Ruler },
      { value: "kits", icon: Gift },
      { value: "compare", icon: GitCompareArrows },
      { value: "product-codes", icon: Barcode },
      { value: "compliance", icon: ShieldCheck },
    ],
  },
  {
    label: "g_stock",
    icon: Boxes,
    items: [
      { value: "stock-history", icon: History },
      { value: "stock-entries", icon: ScanBarcode },
      { value: "barcode-labels", icon: Printer },
      { value: "warehouses", icon: Warehouse },
      { value: "stock-alerts", icon: BellRing, badge: (a) => a.stockAlerts },
      { value: "cart-reservations", icon: Timer },
    ],
  },
  {
    label: "g_promotions",
    icon: Ticket,
    items: [
      { value: "coupons", icon: Ticket },
      { value: "gift-cards", icon: WalletCards },
      { value: "reward-points", icon: Coins },
    ],
  },
  {
    label: "g_selling",
    icon: Layers,
    items: [
      { value: "subscriptions", icon: Repeat },
      { value: "rentals", icon: CalendarRange },
      { value: "preorders", icon: Hourglass },
      { value: "downloads", icon: Download },
      { value: "vendors", icon: Store, badge: (a) => a.vendorApplications },
      { value: "quotes", icon: ClipboardList, badge: (a) => a.quoteRequests },
      { value: "punchout", icon: Building2 },
    ],
  },
  {
    label: "g_marketing",
    icon: Megaphone,
    items: [
      { value: "affiliates", icon: Handshake, badge: (a) => a.affiliateApplications },
      { value: "newsletter", icon: MailOpen },
      { value: "product-feed", icon: Rss },
    ],
  },
  {
    label: "g_look",
    icon: Palette,
    items: [
      { value: "brand", icon: Palette },
      { value: "visual", icon: Megaphone },
      { value: "popups", icon: PanelTop },
      { value: "home-content", icon: LayoutTemplate },
      { value: "product-page", icon: PanelsTopLeft },
      { value: "banners", icon: Image },
      { value: "pages", icon: FileText },
      { value: "account-page", icon: CircleUser },
      { value: "faq", icon: BookOpen },
      { value: "catalog-page", icon: LayoutGrid },
      { value: "plugins", icon: Puzzle },
    ],
  },
  {
    label: "g_content",
    icon: Newspaper,
    items: [
      { value: "blog", icon: Newspaper, badge: (a) => a.blogComments },
      { value: "polls", icon: Vote },
      { value: "forum", icon: MessagesSquare, badge: (a) => a.forum },
    ],
  },
  {
    label: "g_checkout",
    icon: Truck,
    items: [
      { value: "payment", icon: CreditCard },
      { value: "price-display", icon: BadgePercent },
      { value: "checkout-page", icon: ShoppingCart },
      { value: "delivery", icon: Truck },
      { value: "delivery-dates", icon: CalendarClock },
      { value: "currencies", icon: Banknote },
    ],
  },
  {
    label: "g_settings",
    icon: Settings,
    items: [
      { value: "settings", icon: Settings },
      { value: "features", icon: ToggleRight },
      { value: "integrations", icon: Plug },
      { value: "privacy", icon: Cookie },
      { value: "emails", icon: Mail },
    ],
  },
  {
    label: "g_security",
    icon: LockKeyhole,
    items: [
      { value: "account-security", icon: LockKeyhole },
      { value: "activity-log", icon: ScrollText },
    ],
  },
];

export const ALL_ADMIN_SECTIONS = ADMIN_GROUPS.flatMap((g) => g.items);

/** Endereço de cada seção e das páginas próprias do painel. */
export const adminHref = {
  section: (v: string) => `/admin?tab=${v}`,
  order: (id: string) => `/admin/pedidos/${id}`,
  newOrder: () => "/admin/pedidos/novo",
  customer: (id: string) => `/admin/clientes/${id}`,
  editCustomer: (id: string) => `/admin/clientes/${id}/editar`,
  newCustomer: () => "/admin/clientes/novo",
  /** Editar produto. */
  product: (id: string) => `/admin/produto/${id}`,
  /** Detalhes e números do produto. */
  productStats: (id: string) => `/admin/produtos/${id}`,
  newProduct: () => "/admin/produto/novo",
  coupon: (id: string) => `/admin/cupons/${id}`,
  newCoupon: () => "/admin/cupons/novo",
  category: (id: string) => `/admin/categorias/${id}`,
  editCategory: (id: string) => `/admin/categorias/${id}/editar`,
  newCategory: () => "/admin/categorias/nova",
  /** Página de um pedido de devolução (dentro da seção Devoluções). */
  returnRequest: (id: string) => `/admin?tab=returns&ver=devolucao&id=${id}`,
};

/** Chaves de src/i18n/admin.ts com o nome (s_<id>) e a explicação (d_<id>) de cada seção. */
export const sectionNameKey = (v: string) => `s_${v.replace(/-/g, "_")}` as AdminKey;
export const sectionHintKey = (v: string) => `d_${v.replace(/-/g, "_")}` as AdminKey;
