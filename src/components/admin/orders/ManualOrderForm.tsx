// =====================================================================================
// Formulário do pedido feito pela loja (página /admin/pedidos/novo, src/pages/admin/AdminOrderNewPage.tsx).
// Para vendas fora do site (WhatsApp, balcão, e-mail). Coluna principal com as partes, resumo fixo ao lado.
//   Cliente      cadastrado (busca) ou sem cadastro (nome, e-mail, telefone)
//   Produtos     produtos da loja (preço da tabela por quantidade, editável) e itens avulsos
//   Entrega      o cliente escolhe depois (só cadastrado), retirada sem envio, ou envio com forma, valor e endereço
//   Pagamento    meio de pagamento, desconto e "já está pago"
//   Resumo       subtotal, frete, desconto, imposto (só em países com IVA somado) e total; Criar pedido
// O administrador grava o pedido direto (o trigger orders_secure_amounts não recalcula pedidos do Admin).
// Endereço do cliente cadastrado: os guardados na conta, ou um novo com o AddressForm (fica na conta).
// Textos em src/i18n/adminOrderForm.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check, ChevronsUpDown, CreditCard, Loader2, MapPin, Package, Plus, ReceiptText, Store, Trash2, Truck, User as UserIcon, UserPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlinePanel } from "@/components/admin/shell/AdminPageParts";
import AddressForm from "@/components/dashboard/AddressForm";
import { useAdminFormat } from "@/hooks/useAdminList";
import { getVatRate, showsTaxSeparately } from "@/utils/pricing";
import { effectiveUnitPrice, type VolumeTier } from "@/utils/tierPricing";
import { FALLBACK_COUNTRIES, countryName, useCountries, useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n";
import { adminOrderFormMessages } from "@/i18n/adminOrderForm";

type Customer = { user_id: string; email: string | null; full_name: string | null; phone: string | null; tax_id: string | null };
type Product = { id: string; name: string; image: string | null; price: number | null; vat_rate: number | null; stock_quantity: number | null; customizable: boolean | null };
type Address = {
  id: string; name: string; street: string; number: string | null; complement: string | null; parish: string | null;
  city: string; postal_code: string; district: string | null; country: string | null;
};
type Line = { key: string; product: Product | null; quantity: number; unitPrice: number | null; custom?: { name: string; description: string } };
type Delivery = "later" | "pickup" | "ship";
type FreeAddress = { name: string; street: string; number: string; complement: string; parish: string; city: string; district: string; postal_code: string; country: string };

const uid = () => Math.random().toString(36).slice(2);
const db = supabase as any;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Campo com rótulo (fora do componente para não perder o foco ao digitar). */
const Field = ({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("space-y-1.5", className)}>
    <Label htmlFor={htmlFor} className="text-sm font-semibold">{label}</Label>
    {children}
  </div>
);

const Section = ({ icon: Icon, title, children, actions }: { icon: typeof Package; title: string; children: React.ReactNode; actions?: React.ReactNode }) => (
  <section className="rounded-[20px] border bg-card p-4 md:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-bold"><Icon className="h-4 w-4 text-primary" aria-hidden="true" />{title}</h2>
      {actions}
    </div>
    {children}
  </section>
);

const ManualOrderForm = ({ onCreated, onCancel }: { onCreated?: (orderId: string) => void; onCancel?: () => void }) => {
  const qc = useQueryClient();
  const { t } = useMessages(adminOrderFormMessages);
  const fmt = useAdminFormat();
  const country = useCountry();
  const { data: countries } = useCountries();
  const [saving, setSaving] = useState(false);

  // Cliente
  const [mode, setMode] = useState<"registered" | "guest">("registered");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const [customerOpen, setCustomerOpen] = useState(false);

  // Itens
  const [lines, setLines] = useState<Line[]>([{ key: uid(), product: null, quantity: 1, unitPrice: null }]);
  const [productOpen, setProductOpen] = useState<string | null>(null);

  // Entrega
  const [delivery, setDelivery] = useState<Delivery>("ship");
  const [serviceId, setServiceId] = useState<string>("");
  const [shippingCost, setShippingCost] = useState<string>("");
  const [addressId, setAddressId] = useState<string>("");
  const [addingAddress, setAddingAddress] = useState(false);
  const [freeAddress, setFreeAddress] = useState<FreeAddress>({ name: "", street: "", number: "", complement: "", parish: "", city: "", district: "", postal_code: "", country: country.code });

  // Pagamento
  const [paymentId, setPaymentId] = useState<string>("");
  const [paid, setPaid] = useState(false);
  const [discount, setDiscount] = useState<string>("");
  const [notes, setNotes] = useState("");

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["manual-order-customers"],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_list_customers");
      if (error) throw error;
      return (data || []) as Customer[];
    },
  });
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["manual-order-products"],
    queryFn: async () => {
      const { data, error } = await db.from("products").select("id, name, image, price, vat_rate, stock_quantity, customizable").eq("is_active", true).order("name");
      if (error) throw error;
      return (data || []) as Product[];
    },
  });
  const productIds = useMemo(() => [...new Set(lines.map((l) => l.product?.id).filter(Boolean))].sort() as string[], [lines]);
  const { data: tiers = {} } = useQuery<Record<string, VolumeTier[]>>({
    queryKey: ["manual-order-tiers", productIds.join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from("product_volume_tiers").select("product_id, min_meters, price_per_meter, label").in("product_id", productIds);
      if (error) throw error;
      const map: Record<string, VolumeTier[]> = {};
      for (const r of data || []) (map[r.product_id] ||= []).push({ min_meters: Number(r.min_meters), price_per_meter: Number(r.price_per_meter), label: r.label });
      return map;
    },
  });
  const { data: addresses = [], refetch: refetchAddresses } = useQuery<Address[]>({
    queryKey: ["addresses", customer?.user_id],
    enabled: !!customer?.user_id,
    queryFn: async () => {
      const { data, error } = await db.from("user_addresses").select("*").eq("user_id", customer!.user_id).order("is_default", { ascending: false });
      if (error) throw error;
      return (data || []) as Address[];
    },
  });
  const { data: services = [] } = useQuery<{ id: string; name: string; carrier: string | null }[]>({
    queryKey: ["manual-order-services"],
    queryFn: async () => {
      const { data } = await db.from("shipping_services").select("id, name, carrier").eq("is_active", true).order("display_order");
      return data || [];
    },
  });
  const { data: payments = [] } = useQuery<{ id: string; type: string; name: string }[]>({
    queryKey: ["manual-order-payment"],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_active_payment_methods");
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (addresses.length && !addresses.some((a) => a.id === addressId)) setAddressId(addresses[0].id);
  }, [addresses, addressId]);
  useEffect(() => {
    if (mode === "guest" && delivery === "later") setDelivery("ship");
  }, [mode, delivery]);

  // Preço de cada linha: tabela por quantidade do produto (editável); item avulso = preço digitado.
  const priced = useMemo(() => lines.map((l) => {
    const auto = l.product ? effectiveUnitPrice(Number(l.product.price || 0), l.quantity, tiers[l.product.id]).unit : 0;
    const unit = l.unitPrice ?? auto;
    const subtotal = round2(unit * (l.quantity || 0));
    const vatRate = showsTaxSeparately() ? getVatRate(l.product?.vat_rate) : 0;
    return { line: l, auto, unit, subtotal, vatRate, vat: round2(subtotal * vatRate / 100) };
  }), [lines, tiers]);

  const shipping = delivery === "ship" ? Math.max(0, Number(shippingCost.replace(",", ".")) || 0) : 0;
  const itemsTotal = round2(priced.reduce((s, p) => s + p.subtotal, 0));
  const vatTotal = round2(priced.reduce((s, p) => s + p.vat, 0));
  const discountValue = Math.min(itemsTotal, Math.max(0, Number(discount.replace(",", ".")) || 0));
  const total = round2(itemsTotal + vatTotal + shipping - discountValue);
  const units = lines.reduce((s, l) => s + (l.product || l.custom ? l.quantity || 0 : 0), 0);

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const countryOptions = (countries?.length ? countries : FALLBACK_COUNTRIES).map((c) => ({ code: c.code, name: countryName(c.code, fmt.locale as any) }));
  const name = customer?.full_name || customer?.email || guest.name.trim();

  const buildAddress = () => {
    if (mode === "registered") {
      const a = addresses.find((x) => x.id === addressId);
      if (!a) return null;
      return { name: a.name || name, street: a.street, number: a.number || "", complement: a.complement || "", parish: a.parish || "", city: a.city, district: a.district || "", postal_code: a.postal_code, country: a.country || country.code };
    }
    const f = freeAddress;
    if (!f.street.trim() || !f.city.trim() || !f.postal_code.trim()) return null;
    return { ...f, name: f.name.trim() || name };
  };

  const validate = (): string | null => {
    if (mode === "registered" && !customer) return t("err_customer");
    if (mode === "guest" && !guest.name.trim()) return t("err_guest_name");
    const filled = lines.filter((l) => l.product || l.custom);
    if (!filled.length) return t("err_items");
    for (const l of filled) {
      if (l.custom && !l.custom.name.trim()) return t("err_custom_name");
      if (!l.quantity || l.quantity <= 0 || !Number.isInteger(l.quantity)) return t("err_qty");
      if (l.custom && !(Number(l.unitPrice) > 0)) return t("err_custom_price");
    }
    if (delivery === "ship" && !buildAddress()) return t("err_address");
    if (delivery !== "later" && !paymentId) return t("err_payment");
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const later = delivery === "later";
      const pm = payments.find((p) => p.id === paymentId);
      const svc = services.find((s) => s.id === serviceId);
      const now = new Date().toISOString();
      const orderRow: Record<string, unknown> = {
        user_id: customer?.user_id ?? null,
        is_manual: true,
        requires_customer_config: later,
        manual_customer_name: customer ? null : guest.name.trim(),
        manual_customer_contact: customer ? null : (guest.email.trim() || guest.phone.trim() || null),
        guest_name: name,
        guest_email: customer?.email || guest.email.trim() || null,
        guest_phone: customer?.phone || guest.phone.trim() || null,
        status: paid && !later ? "paid" : "pending",
        payment_status: paid && !later ? "paid" : "pending",
        paid_at: paid && !later ? now : null,
        payment_method: later ? null : pm?.type || "manual",
        shipping_address: delivery === "ship" ? buildAddress() : null,
        shipping_cost: shipping,
        shipping_service_id: delivery === "ship" && svc ? svc.id : null,
        shipping_details: delivery === "ship" && svc ? { carrier: svc.carrier, name: svc.name, source: "manual" }
          : delivery === "pickup" ? { name: t("pickup"), source: "manual" } : null,
        discount_amount: discountValue,
        subtotal_net: itemsTotal,
        vat_total: vatTotal,
        total,
        notes: [notes.trim(), later ? t("note_later") : null, pm ? `${t("payment")}: ${pm.name}` : null].filter(Boolean).join("\n") || null,
      };
      const { data: order, error } = await db.from("orders").insert(orderRow).select("id").single();
      if (error) throw error;

      const items = priced.filter((p) => p.line.product || p.line.custom).map((p) => ({
        order_id: order.id,
        product_id: p.line.product?.id ?? null,
        quantity: p.line.quantity,
        price: p.unit,
        vat_rate: p.vatRate,
        vat_amount: p.vat,
        custom_name: p.line.custom ? p.line.custom.name.trim() : null,
        custom_description: p.line.custom ? p.line.custom.description.trim() || null : null,
        design_data: p.line.custom ? { custom: true, name: p.line.custom.name.trim(), description: p.line.custom.description.trim() } : null,
      }));
      const { error: itemsErr } = await db.from("order_items").insert(items);
      if (itemsErr) throw itemsErr;

      toast.success(t("created"));
      for (const k of ["allOrders", "adminOrders", "admin-store-orders", "admin-attention"]) qc.invalidateQueries({ queryKey: [k] });
      onCreated?.(order.id);
    } catch (e: any) {
      toast.error(t("err_create", { msg: e?.message || "" }));
    } finally {
      setSaving(false);
    }
  };

  const optionBtn = (active: boolean) => cn(
    "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[12px] border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "border-primary bg-primary/10 text-brand-orange-text" : "bg-card hover:bg-muted",
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        {/* ── Cliente ── */}
        <Section icon={UserIcon} title={t("customer")}>
          <div className="mb-4 flex gap-2" role="radiogroup" aria-label={t("customer")}>
            <button type="button" role="radio" aria-checked={mode === "registered"} className={optionBtn(mode === "registered")} onClick={() => setMode("registered")}>
              <UserIcon className="h-4 w-4" aria-hidden="true" />{t("registered")}
            </button>
            <button type="button" role="radio" aria-checked={mode === "guest"} className={optionBtn(mode === "guest")} onClick={() => { setMode("guest"); setCustomer(null); }}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />{t("guest")}
            </button>
          </div>
          {mode === "registered" ? (
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={customerOpen} className="h-auto min-h-11 w-full justify-between py-2 text-left font-normal">
                  {customer ? (
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{customer.full_name || customer.email}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[customer.email, customer.phone].filter(Boolean).join(" · ")}</span>
                    </span>
                  ) : <span className="text-muted-foreground">{t("search_customer")}</span>}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("search_customer_placeholder")} />
                  <CommandList>
                    <CommandEmpty>{t("no_customer")}</CommandEmpty>
                    <CommandGroup>
                      {customers.map((c) => (
                        <CommandItem key={c.user_id} value={`${c.full_name ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`} onSelect={() => { setCustomer(c); setAddressId(""); setCustomerOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", customer?.user_id === c.user_id ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block truncate">{c.full_name || c.email}</span>
                            <span className="block truncate text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={`${t("name")} *`} htmlFor="g-name"><Input id="g-name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} /></Field>
              <Field label={t("email")} htmlFor="g-email"><Input id="g-email" type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} /></Field>
              <Field label={t("phone")} htmlFor="g-phone"><Input id="g-phone" type="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /></Field>
            </div>
          )}
        </Section>

        {/* ── Produtos ── */}
        <Section icon={Package} title={t("items")} actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: uid(), product: null, quantity: 1, unitPrice: null }])}><Plus className="h-4 w-4" aria-hidden="true" />{t("add_product")}</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: uid(), product: null, quantity: 1, unitPrice: 0, custom: { name: "", description: "" } }])}><Plus className="h-4 w-4" aria-hidden="true" />{t("add_custom")}</Button>
          </div>
        }>
          <ul className="space-y-3">
            {priced.map(({ line: l, auto, unit, subtotal }) => (
              <li key={l.key} className="rounded-[14px] border p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_88px_130px_auto] sm:items-end">
                  {l.custom ? (
                    <div className="space-y-2">
                      <Field label={t("custom_name")} htmlFor={`cn-${l.key}`}><Input id={`cn-${l.key}`} value={l.custom.name} onChange={(e) => setLine(l.key, { custom: { ...l.custom!, name: e.target.value } })} /></Field>
                      <Input aria-label={t("custom_description")} placeholder={t("custom_description")} value={l.custom.description} onChange={(e) => setLine(l.key, { custom: { ...l.custom!, description: e.target.value } })} />
                    </div>
                  ) : (
                    <Field label={t("product")}>
                      <Popover open={productOpen === l.key} onOpenChange={(o) => setProductOpen(o ? l.key : null)}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" className="h-auto min-h-11 w-full justify-between py-1.5 text-left font-normal">
                            {l.product ? (
                              <span className="flex min-w-0 items-center gap-2">
                                {l.product.image ? <img src={l.product.image} alt="" className="h-8 w-8 shrink-0 rounded-lg border object-cover" /> : <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                                <span className="truncate">{l.product.name}</span>
                              </span>
                            ) : <span className="text-muted-foreground">{t("pick_product")}</span>}
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
                                  <CommandItem key={p.id} value={`${p.name} ${p.id}`} onSelect={() => { setLine(l.key, { product: p, unitPrice: null }); setProductOpen(null); }}>
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
                    </Field>
                  )}
                  <Field label={t("qty")} htmlFor={`q-${l.key}`}>
                    <Input id={`q-${l.key}`} type="number" min="1" step="1" inputMode="numeric" value={l.quantity || ""} onChange={(e) => setLine(l.key, { quantity: Math.max(0, parseInt(e.target.value) || 0) })} />
                  </Field>
                  <Field label={t("unit_price")} htmlFor={`p-${l.key}`}>
                    <Input id={`p-${l.key}`} type="number" min="0" step="0.01" inputMode="decimal" value={l.unitPrice ?? (l.product ? auto : "")}
                      onChange={(e) => setLine(l.key, { unitPrice: e.target.value === "" ? null : Number(e.target.value) })} />
                  </Field>
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11 justify-self-end text-muted-foreground hover:text-destructive" aria-label={t("remove")} title={t("remove")}
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [{ key: uid(), product: null, quantity: 1, unitPrice: null }]))}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                {(l.product || l.custom) && (
                  <p className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {l.product && l.unitPrice != null && l.unitPrice !== auto ? t("price_changed", { price: fmt.money(auto) }) : null}
                      {l.product && l.product.stock_quantity != null && !l.product.customizable && l.quantity > l.product.stock_quantity ? <span className="font-medium text-amber-700"> {t("low_stock", { n: l.product.stock_quantity })}</span> : null}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">{l.quantity} x {fmt.money(unit)} = {fmt.money(subtotal)}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Entrega ── */}
        <Section icon={Truck} title={t("delivery")}>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label={t("delivery")}>
            <button type="button" role="radio" aria-checked={delivery === "ship"} className={optionBtn(delivery === "ship")} onClick={() => setDelivery("ship")}><Truck className="h-4 w-4" aria-hidden="true" />{t("ship")}</button>
            <button type="button" role="radio" aria-checked={delivery === "pickup"} className={optionBtn(delivery === "pickup")} onClick={() => setDelivery("pickup")}><Store className="h-4 w-4" aria-hidden="true" />{t("pickup")}</button>
            {mode === "registered" && (
              <button type="button" role="radio" aria-checked={delivery === "later"} className={optionBtn(delivery === "later")} onClick={() => setDelivery("later")}><UserIcon className="h-4 w-4" aria-hidden="true" />{t("later")}</button>
            )}
          </div>
          {delivery === "later" && <p className="rounded-[14px] bg-muted/50 p-3 text-sm text-muted-foreground">{t("later_hint")}</p>}
          {delivery === "pickup" && <p className="rounded-[14px] bg-muted/50 p-3 text-sm text-muted-foreground">{t("pickup_hint")}</p>}
          {delivery === "ship" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("service")}>
                  <Select value={serviceId || "none"} onValueChange={(v) => setServiceId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("service_none")}</SelectItem>
                      {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("shipping_cost")} htmlFor="ship-cost">
                  <Input id="ship-cost" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
                </Field>
              </div>
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t("address")}</p>
                {mode === "registered" ? (
                  !customer ? <p className="text-sm text-muted-foreground">{t("pick_customer_first")}</p> : (
                    <>
                      {addresses.length > 0 && (
                        <div className="space-y-2" role="radiogroup" aria-label={t("address")}>
                          {addresses.map((a) => (
                            <button key={a.id} type="button" role="radio" aria-checked={addressId === a.id} onClick={() => setAddressId(a.id)}
                              className={cn("flex w-full items-start gap-3 rounded-[14px] border p-3 text-left text-sm transition-colors", addressId === a.id ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                              <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", addressId === a.id && "border-primary")}>{addressId === a.id && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
                              <span className="min-w-0">
                                <span className="block font-medium">{a.name}</span>
                                <span className="block text-muted-foreground">{[a.street, a.number, a.complement].filter(Boolean).join(", ")}</span>
                                <span className="block text-muted-foreground">{[a.parish, a.city, a.district, a.postal_code].filter(Boolean).join(", ")}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {addresses.length === 0 && !addingAddress && <p className="text-sm text-muted-foreground">{t("no_addresses")}</p>}
                      <InlinePanel open={addingAddress} onClose={() => setAddingAddress(false)} title={t("new_address")}>
                        {addingAddress && (
                          <AddressForm userIdOverride={customer.user_id} onClose={() => setAddingAddress(false)} onSuccess={() => { refetchAddresses(); }} />
                        )}
                      </InlinePanel>
                      {!addingAddress && <Button type="button" variant="outline" size="sm" onClick={() => setAddingAddress(true)}><Plus className="h-4 w-4" aria-hidden="true" />{t("new_address")}</Button>}
                    </>
                  )
                ) : (
                  <div className="grid gap-3 sm:grid-cols-6">
                    <Field label={t("recipient")} htmlFor="a-name" className="sm:col-span-3"><Input id="a-name" value={freeAddress.name} placeholder={guest.name} onChange={(e) => setFreeAddress({ ...freeAddress, name: e.target.value })} /></Field>
                    <Field label={t("country")} className="sm:col-span-3">
                      <Select value={freeAddress.country} onValueChange={(v) => setFreeAddress({ ...freeAddress, country: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{countryOptions.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    <Field label={`${t("postal_code")} *`} htmlFor="a-postal" className="sm:col-span-2"><Input id="a-postal" value={freeAddress.postal_code} onChange={(e) => setFreeAddress({ ...freeAddress, postal_code: e.target.value })} /></Field>
                    <Field label={`${t("street")} *`} htmlFor="a-street" className="sm:col-span-3"><Input id="a-street" value={freeAddress.street} onChange={(e) => setFreeAddress({ ...freeAddress, street: e.target.value })} /></Field>
                    <Field label={t("number")} htmlFor="a-number" className="sm:col-span-1"><Input id="a-number" value={freeAddress.number} onChange={(e) => setFreeAddress({ ...freeAddress, number: e.target.value })} /></Field>
                    <Field label={t("complement")} htmlFor="a-comp" className="sm:col-span-2"><Input id="a-comp" value={freeAddress.complement} onChange={(e) => setFreeAddress({ ...freeAddress, complement: e.target.value })} /></Field>
                    <Field label={t("parish")} htmlFor="a-parish" className="sm:col-span-2"><Input id="a-parish" value={freeAddress.parish} onChange={(e) => setFreeAddress({ ...freeAddress, parish: e.target.value })} /></Field>
                    <Field label={`${t("city")} *`} htmlFor="a-city" className="sm:col-span-2"><Input id="a-city" value={freeAddress.city} onChange={(e) => setFreeAddress({ ...freeAddress, city: e.target.value })} /></Field>
                    <Field label={t("region")} htmlFor="a-region" className="sm:col-span-2"><Input id="a-region" value={freeAddress.district} onChange={(e) => setFreeAddress({ ...freeAddress, district: e.target.value })} /></Field>
                  </div>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* ── Pagamento ── */}
        {delivery !== "later" && (
          <Section icon={CreditCard} title={t("payment")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`${t("payment_method")} *`}>
                <Select value={paymentId} onValueChange={setPaymentId}>
                  <SelectTrigger><SelectValue placeholder={t("payment_pick")} /></SelectTrigger>
                  <SelectContent>{payments.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                {!payments.length && <p className="text-xs text-muted-foreground">{t("payment_none")}</p>}
              </Field>
              <Field label={t("discount")} htmlFor="discount">
                <Input id="discount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </Field>
            </div>
            <label className="mt-4 flex cursor-pointer items-start justify-between gap-3 rounded-[14px] border p-3">
              <span>
                <span className="block text-sm font-semibold">{t("paid")}</span>
                <span className="block text-xs text-muted-foreground">{t("paid_hint")}</span>
              </span>
              <Switch checked={paid} onCheckedChange={setPaid} />
            </label>
          </Section>
        )}

        <Section icon={ReceiptText} title={t("notes")}>
          <Textarea value={notes} rows={3} placeholder={t("notes_placeholder")} onChange={(e) => setNotes(e.target.value)} aria-label={t("notes")} />
        </Section>
      </div>

      {/* ── Resumo ── */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <section className="rounded-[20px] border bg-card p-4 md:p-5">
          <h2 className="mb-3 text-base font-bold">{t("summary")}</h2>
          {name && <p className="mb-3 truncate text-sm"><span className="text-muted-foreground">{t("customer")}:</span> <span className="font-medium">{name}</span></p>}
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">{t("items_n", { n: units })}</dt><dd className="tabular-nums">{fmt.money(itemsTotal)}</dd></div>
            {vatTotal > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">{t("tax")}</dt><dd className="tabular-nums">{fmt.money(vatTotal)}</dd></div>}
            {delivery === "ship" && <div className="flex justify-between"><dt className="text-muted-foreground">{t("shipping")}</dt><dd className="tabular-nums">{shipping ? fmt.money(shipping) : t("free")}</dd></div>}
            {discountValue > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">{t("discount")}</dt><dd className="tabular-nums">-{fmt.money(discountValue)}</dd></div>}
            <div className="flex items-baseline justify-between border-t pt-3"><dt className="font-semibold">{t("total")}</dt><dd className="text-xl font-bold tabular-nums">{fmt.money(total)}</dd></div>
          </dl>
          {delivery === "later" && <p className="mt-2 text-xs text-muted-foreground">{t("later_summary")}</p>}
          <div className="mt-4 space-y-2">
            <Button type="button" className="w-full font-semibold" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {paid && delivery !== "later" ? t("create_paid") : t("create")}
            </Button>
            {onCancel && <Button type="button" variant="ghost" className="w-full" onClick={onCancel} disabled={saving}>{t("cancel")}</Button>}
          </div>
        </section>
      </aside>
    </div>
  );
};

export default ManualOrderForm;
