// =====================================================================================
// Editar os itens de um pedido já criado, na própria página do pedido (src/pages/admin/AdminOrderPage.tsx).
// Muda quantidade e preço, tira itens, junta produtos da loja ou itens avulsos, e acerta frete e desconto.
// Grava pela função public.admin_update_order_items (migration 20261006140000): ela acerta o estoque,
// mantém a personalização dos itens que ficam e recalcula imposto e total. Só para pedidos ainda não
// enviados, entregues, cancelados ou reembolsados (canEditOrderItems).
// Textos em src/i18n/adminOrderForm.ts (chaves edit_*).
// =====================================================================================
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { giftCardsMessages } from "@/i18n/giftCards";
import { rewardPointsMessages } from "@/i18n/rewardPoints";
import { giftCodeTail } from "@/lib/giftCards";
import { AlertTriangle, ChevronsUpDown, Loader2, Package, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAdminFormat } from "@/hooks/useAdminList";
import { getVatRate, showsTaxSeparately } from "@/utils/pricing";
import { effectiveUnitPrice, type VolumeTier } from "@/utils/tierPricing";
import { useMessages } from "@/i18n";
import { adminOrderFormMessages } from "@/i18n/adminOrderForm";

type Product = { id: string; name: string; image: string | null; price: number | null; vat_rate: number | null };
type Line = {
  key: string;
  id: string | null; // item que já existe no pedido
  product: { id: string; name: string; image: string | null; price: number | null } | null;
  custom: { name: string; description: string } | null;
  quantity: number;
  unitPrice: number | null; // null = preço da tabela (só itens novos)
  vatRate: number;
};

const db = supabase as any;
const uid = () => Math.random().toString(36).slice(2);
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => Math.max(0, Number(s.replace(",", ".")) || 0);

/** Estados em que o pedido ainda pode mudar de itens (igual à função do banco). */
export const canEditOrderItems = (order: { status: string; payment_status?: string | null; resources_released_at?: string | null }) =>
  !["shipped", "delivered", "cancelled", "refunded"].includes(order.status) && order.payment_status !== "refunded" && !order.resources_released_at;

const ERRORS: Record<string, "edit_err_locked" | "edit_err_items" | "edit_err_shipped"> = {
  order_locked: "edit_err_locked",
  shipped_items: "edit_err_shipped",
  items_required: "edit_err_items",
  invalid_item: "edit_err_items",
};

export default function OrderItemsEditor({ order, onSaved, onCancel }: { order: any; onSaved: () => void; onCancel: () => void }) {
  const { t } = useMessages(adminOrderFormMessages);
  const { t: tg } = useMessages(giftCardsMessages);
  const { t: tp } = useMessages(rewardPointsMessages);
  const fmt = useAdminFormat();
  const [saving, setSaving] = useState(false);
  const [productOpen, setProductOpen] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>(() =>
    ((order.order_items || []) as any[]).map((i) => ({
      key: i.id,
      id: i.id,
      product: i.product_id ? { id: i.product_id, name: i.products?.name || i.product_id, image: i.products?.image ?? null, price: null } : null,
      custom: i.product_id ? null : { name: i.custom_name || i.design_data?.name || "", description: i.custom_description || "" },
      quantity: Number(i.quantity),
      unitPrice: Number(i.price),
      vatRate: Number(i.vat_rate || 0),
    })),
  );
  const [shippingCost, setShippingCost] = useState(String(Number(order.shipping_cost || 0)));
  const [discount, setDiscount] = useState(String(Number(order.discount_amount || 0)));
  const [note, setNote] = useState("");

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["manual-order-products"],
    queryFn: async () => {
      const { data, error } = await db.from("products").select("id, name, image, price, vat_rate, stock_quantity, customizable").eq("is_active", true).order("name");
      if (error) throw error;
      return (data || []) as Product[];
    },
  });
  const newIds = useMemo(() => [...new Set(lines.filter((l) => !l.id && l.product).map((l) => l.product!.id))].sort(), [lines]);
  const { data: tiers = {} } = useQuery<Record<string, VolumeTier[]>>({
    queryKey: ["manual-order-tiers", newIds.join(",")],
    enabled: newIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from("product_volume_tiers").select("product_id, min_meters, price_per_meter, label").in("product_id", newIds);
      if (error) throw error;
      const map: Record<string, VolumeTier[]> = {};
      for (const r of data || []) (map[r.product_id] ||= []).push({ min_meters: Number(r.min_meters), price_per_meter: Number(r.price_per_meter), label: r.label });
      return map;
    },
  });

  const priced = lines.map((l) => {
    const auto = l.product && !l.id ? effectiveUnitPrice(Number(l.product.price || 0), l.quantity, tiers[l.product.id]).unit : 0;
    const unit = l.unitPrice ?? auto;
    const subtotal = round2(unit * (l.quantity || 0));
    return { line: l, unit, subtotal, vat: round2(subtotal * l.vatRate / 100) };
  });
  const itemsTotal = round2(priced.reduce((s, p) => s + p.subtotal, 0));
  const vatTotal = round2(priced.reduce((s, p) => s + p.vat, 0));
  const shipping = num(shippingCost);
  const disc = num(discount);
  const payDisc = Number(order.payment_discount || 0);
  // Vale-presente usado no pedido (fixo): o total desconta também esse valor, como no servidor.
  const giftDisc = Number((order as { gift_card_amount?: number }).gift_card_amount || 0);
  const pointsDisc = Number((order as { reward_points_amount?: number }).reward_points_amount || 0);
  // Campos extra do checkout ficam no pedido (com o imposto da época), como no servidor (admin_update_order_items).
  const extras = Number((order as { extras_amount?: number }).extras_amount || 0) + Number((order as { extras_vat?: number }).extras_vat || 0);
  const total = Math.max(0, round2(itemsTotal + vatTotal + shipping + extras - disc - payDisc - giftDisc - pointsDisc));
  const oldTotal = Number(order.total || 0);
  const diff = round2(total - oldTotal);
  const paid = order.payment_status === "paid";

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addProductLine = () => setLines((ls) => [...ls, { key: uid(), id: null, product: null, custom: null, quantity: 1, unitPrice: null, vatRate: 0 }]);
  const addCustomLine = () => setLines((ls) => [...ls, { key: uid(), id: null, product: null, custom: { name: "", description: "" }, quantity: 1, unitPrice: 0, vatRate: 0 }]);

  const save = async () => {
    const valid = lines.filter((l) => l.product || l.custom?.name.trim());
    if (!valid.length) { toast.error(t("err_items")); return; }
    if (lines.some((l) => l.custom && !l.custom.name.trim())) { toast.error(t("err_custom_name")); return; }
    if (valid.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) { toast.error(t("err_qty")); return; }
    setSaving(true);
    try {
      const items = priced.filter((p) => p.line.product || p.line.custom).map((p) => ({
        id: p.line.id,
        product_id: p.line.product?.id ?? null,
        quantity: p.line.quantity,
        price: p.unit,
        vat_rate: p.line.vatRate,
        custom_name: p.line.custom?.name.trim() || null,
        custom_description: p.line.custom?.description.trim() || null,
      }));
      const historyNote = [t("edit_history", { from: fmt.money(oldTotal), to: fmt.money(total) }), note.trim()].filter(Boolean).join(". ");
      const { error } = await db.rpc("admin_update_order_items", {
        _order_id: order.id, _items: items, _shipping_cost: shipping, _discount: disc, _note: historyNote,
      });
      if (error) {
        const key = Object.keys(ERRORS).find((k) => error.message?.includes(k));
        throw new Error(key ? t(ERRORS[key]) : error.message);
      }
      toast.success(t("edit_saved"));
      onSaved();
    } catch (e: any) {
      toast.error(t("edit_err", { msg: e?.message || "" }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {priced.map(({ line: l, unit, subtotal }) => (
          <li key={l.key} className="rounded-[14px] border p-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_88px_130px_auto] sm:items-end">
              {l.custom ? (
                <div className="space-y-2">
                  <Label htmlFor={`ecn-${l.key}`} className="text-sm font-semibold">{t("custom_name")}</Label>
                  <Input id={`ecn-${l.key}`} value={l.custom.name} onChange={(e) => setLine(l.key, { custom: { ...l.custom!, name: e.target.value } })} />
                  <Input aria-label={t("custom_description")} placeholder={t("custom_description")} value={l.custom.description} onChange={(e) => setLine(l.key, { custom: { ...l.custom!, description: e.target.value } })} />
                </div>
              ) : l.id ? (
                <div className="flex min-w-0 items-center gap-2 self-center">
                  {l.product?.image ? <img src={l.product.image} alt="" className="h-10 w-10 shrink-0 rounded-lg border object-cover" /> : <Package className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  <span className="truncate font-medium">{l.product?.name}</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">{t("product")}</Label>
                  <Popover open={productOpen === l.key} onOpenChange={(o) => setProductOpen(o ? l.key : null)}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="h-auto min-h-11 w-full justify-between py-1.5 text-left font-normal">
                        {l.product ? <span className="truncate">{l.product.name}</span> : <span className="text-muted-foreground">{t("pick_product")}</span>}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t("search_product")} />
                        <CommandList>
                          <CommandEmpty>{t("no_product")}</CommandEmpty>
                          <CommandGroup>
                            {products.map((p) => (
                              <CommandItem key={p.id} value={`${p.name} ${p.id}`} onSelect={() => {
                                setLine(l.key, { product: p, unitPrice: null, vatRate: showsTaxSeparately() ? getVatRate(p.vat_rate) : 0 });
                                setProductOpen(null);
                              }}>
                                {p.image ? <img src={p.image} alt="" className="mr-2 h-8 w-8 shrink-0 rounded-lg border object-cover" /> : <Package className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">{fmt.money(Number(p.price || 0))}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor={`eq-${l.key}`} className="text-sm font-semibold">{t("qty")}</Label>
                <Input id={`eq-${l.key}`} type="number" min="1" step="1" inputMode="numeric" value={l.quantity || ""} onChange={(e) => setLine(l.key, { quantity: Math.max(0, parseInt(e.target.value) || 0) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`ep-${l.key}`} className="text-sm font-semibold">{t("unit_price")}</Label>
                <Input id={`ep-${l.key}`} type="number" min="0" step="0.01" inputMode="decimal" value={l.unitPrice ?? (l.product ? unit : "")}
                  onChange={(e) => setLine(l.key, { unitPrice: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 justify-self-end text-muted-foreground hover:text-destructive" aria-label={t("remove")} title={t("remove")}
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            {(l.product || l.custom) && (
              <p className="mt-2 text-right text-xs font-semibold tabular-nums">{l.quantity} x {fmt.money(unit)} = {fmt.money(subtotal)}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addProductLine}><Plus className="h-4 w-4" aria-hidden="true" />{t("add_product")}</Button>
        <Button type="button" variant="outline" size="sm" onClick={addCustomLine}><Plus className="h-4 w-4" aria-hidden="true" />{t("add_custom")}</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="edit-shipping" className="text-sm font-semibold">{t("shipping_cost")}</Label>
          <Input id="edit-shipping" type="number" min="0" step="0.01" inputMode="decimal" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-discount" className="text-sm font-semibold">{t("discount")}</Label>
          <Input id="edit-discount" type="number" min="0" step="0.01" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-note" className="text-sm font-semibold">{t("edit_reason")}</Label>
          <Input id="edit-note" value={note} placeholder={t("edit_reason_placeholder")} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <dl className="ml-auto max-w-sm space-y-1.5 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("items_n", { n: priced.filter((p) => p.line.product || p.line.custom).reduce((s, p) => s + p.line.quantity, 0) })}</dt><dd className="tabular-nums">{fmt.money(itemsTotal)}</dd></div>
        {vatTotal > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("tax")}</dt><dd className="tabular-nums">{fmt.money(vatTotal)}</dd></div>}
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("shipping")}</dt><dd className="tabular-nums">{shipping ? fmt.money(shipping) : t("free")}</dd></div>
        {disc > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("discount")}</dt><dd className="tabular-nums">-{fmt.money(disc)}</dd></div>}
        {payDisc > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("edit_payment_discount")}</dt><dd className="tabular-nums">-{fmt.money(payDisc)}</dd></div>}
        {pointsDisc > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{tp("co_summary", { points: Number((order as { reward_points_used?: number }).reward_points_used || 0) })}</dt><dd className="tabular-nums">-{fmt.money(pointsDisc)}</dd></div>}
        {giftDisc > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{tg("summary", { tail: giftCodeTail(String((order as { gift_card_code?: string }).gift_card_code || "")) })}</dt><dd className="tabular-nums">-{fmt.money(giftDisc)}</dd></div>}
        <div className="flex justify-between gap-4 border-t pt-2 text-base font-bold"><dt>{t("total")}</dt><dd className="tabular-nums">{fmt.money(total)}</dd></div>
        {diff !== 0 && (
          <div className="flex justify-between gap-4 text-xs text-muted-foreground"><dt>{t("edit_was", { value: fmt.money(oldTotal) })}</dt><dd className="tabular-nums">{diff > 0 ? "+" : ""}{fmt.money(diff)}</dd></div>
        )}
      </dl>

      {paid && diff !== 0 && (
        <p className="flex items-start gap-2 rounded-[14px] border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {diff > 0 ? t("edit_paid_more", { value: fmt.money(diff) }) : t("edit_paid_less", { value: fmt.money(-diff) })}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>{t("cancel")}</Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {t("edit_save")}
        </Button>
      </div>
    </div>
  );
}
