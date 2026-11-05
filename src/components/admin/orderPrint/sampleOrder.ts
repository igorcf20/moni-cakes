// Pedido de exemplo das prévias de Admin > Impressão de pedidos (textos sample_* de src/i18n/orderPrint.ts).
import type { OrderPrintKey } from "@/i18n/orderPrint";
import type { PrintOrder } from "@/lib/orderPrint";

export function sampleOrder(t: (k: OrderPrintKey) => string): PrintOrder {
  const created = new Date(Date.now() - 2 * 3600_000).toISOString();
  const shipBy = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  return {
    id: "3f9c2a7e-0000-4000-8000-000000000000",
    code: "3F9C2A7E",
    createdAt: created,
    status: "paid",
    paymentStatus: "paid",
    paymentMethod: "",
    customer: { name: t("sample_customer"), email: t("sample_email"), phone: t("sample_phone"), taxId: t("sample_tax_id") },
    shipping: {
      name: t("sample_customer"), street: t("sample_street"), number: t("sample_number"), complement: t("sample_complement"),
      parish: t("sample_parish"), city: t("sample_city"), region: t("sample_region"), postal_code: t("sample_postal"), country: t("sample_country"),
    },
    billing: null,
    pickup: false,
    service: t("sample_service"),
    tracking: t("sample_tracking"),
    weightKg: 0.85,
    shipBy,
    items: [
      { name: t("sample_item_1"), options: t("sample_item_1_opt"), sku: "VASO-FAC-TC-M", quantity: 2, unitPrice: 89.9, image: `${typeof window !== "undefined" ? window.location.origin : ""}/images/moni/bolo-floral.webp` },
      { name: t("sample_item_2"), options: t("sample_item_2_opt"), sku: "PL-GEO-BR", quantity: 1, unitPrice: 49.9, image: "" },
    ],
    totals: { subtotal: 229.7, shipping: 24.5, discount: 0, extras: 5, other: 0, taxes: 0, total: 259.2 },
    checkoutFields: [{ label: t("sample_field"), value: t("sample_field_v") }],
    notes: t("sample_notes"),
  };
}
