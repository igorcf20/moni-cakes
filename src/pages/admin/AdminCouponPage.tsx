// =====================================================================================
// Página própria de cada cupom no Admin (sem janela por cima):
//   /admin/cupons/novo   cria o cupom
//   /admin/cupons/<id>   todas as configurações, resumo do que o cliente recebe, números de uso,
//                        pedidos que usaram o código (abrem a página do pedido) e apagar
// Regras que o servidor aplica (public.coupon_quote): ligado, início e fim, usos no total e por cliente,
// só na primeira compra, compra mínima, % ou valor fixo do subtotal sem impostos, desconto máximo.
// Valores em dinheiro na moeda base da loja. Textos em src/i18n/adminCoupons.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Percent, Receipt, Save, ShoppingBag, Sparkles, Ticket, Trash2, TrendingUp, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AdminShell from "@/components/admin/shell/AdminShell";
import { AdminPageHeader, AdminPanel, ConfirmStrip } from "@/components/admin/shell/AdminPageParts";
import CouponGroupsField from "@/components/admin/groups/CouponGroupsField";
import { adminHref } from "@/components/admin/shell/adminSections";
import { AdminStatCard } from "@/components/admin/AdminListKit";
import { CouponStateBadge } from "@/components/admin/coupons/CouponStateBadge";
import { useAdminFormat } from "@/hooks/useAdminList";
import { couponState, couponTotals, isCountedOrder, useAdminCoupon, useCouponOrders, type AdminCoupon } from "@/hooks/useAdminCoupons";
import { getOrderStatusStyle, orderStatusLabel } from "@/lib/orderStatusStyles";
import { useMessages } from "@/i18n";
import { adminCouponsMessages } from "@/i18n/adminCoupons";
import { cn } from "@/lib/utils";

const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

type Form = {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  max_discount: string;
  min_purchase: string;
  first_order_only: boolean;
  customer_group_ids: string[];
  max_uses: string;
  max_uses_per_customer: string;
  starts_at: string; // datetime-local, hora do navegador
  expires_at: string;
  active: boolean;
};

const EMPTY: Form = {
  code: "", description: "", discount_type: "percentage", discount_value: "10", max_discount: "", min_purchase: "",
  first_order_only: false, customer_group_ids: [], max_uses: "", max_uses_per_customer: "", starts_at: "", expires_at: "", active: true,
};

/** ISO -> valor do campo datetime-local (hora local), e o contrário. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
/** "12,5" ou "12.5" -> 12.5; vazio -> null. */
const parseNum = (v: string) => {
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const randomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};
const fromCoupon = (c: AdminCoupon): Form => ({
  code: c.code,
  description: c.description || "",
  discount_type: c.discount_type === "fixed" ? "fixed" : "percentage",
  discount_value: String(c.discount_value ?? ""),
  max_discount: c.max_discount != null ? String(c.max_discount) : "",
  min_purchase: Number(c.min_purchase || 0) > 0 ? String(c.min_purchase) : "",
  first_order_only: !!c.first_order_only,
  customer_group_ids: c.customer_group_ids ?? [],
  max_uses: c.max_uses != null ? String(c.max_uses) : "",
  max_uses_per_customer: c.max_uses_per_customer != null ? String(c.max_uses_per_customer) : "",
  starts_at: toLocalInput(c.starts_at),
  expires_at: toLocalInput(c.expires_at),
  active: c.active,
});

export default function AdminCouponPage() {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useMessages(adminCouponsMessages);
  const { data: coupon, isLoading } = useAdminCoupon(id);
  const back = { to: adminHref.section("coupons"), label: t("back") };

  return (
    <AdminShell active="coupons">
      {!isNew && isLoading ? (
        <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>
      ) : !isNew && !coupon ? (
        <>
          <AdminPageHeader back={back} title={t("title_edit", { code: "" })} />
          <p className="text-muted-foreground">{t("not_found")}</p>
        </>
      ) : (
        <CouponEditor key={coupon?.id ?? "new"} coupon={coupon ?? null} back={back} />
      )}
    </AdminShell>
  );
}

function CouponEditor({ coupon, back }: { coupon: AdminCoupon | null; back: { to: string; label: string } }) {
  const { t } = useMessages(adminCouponsMessages);
  const fmt = useAdminFormat();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => (coupon ? fromCoupon(coupon) : EMPTY));
  const [saving, setSaving] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: orders = [] } = useCouponOrders(coupon?.code ?? "__none__");
  const isNew = !coupon;

  useEffect(() => { if (coupon) setForm(fromCoupon(coupon)); }, [coupon]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const cur = fmt.currency;
  const isPct = form.discount_type === "percentage";
  const dirty = coupon ? JSON.stringify(fromCoupon(coupon)) !== JSON.stringify(form) : true;

  // Resumo em linguagem simples, igual às regras do servidor.
  const summary = useMemo(() => {
    const parts: string[] = [];
    const v = parseNum(form.discount_value);
    if (v && v > 0) parts.push(isPct ? t("sum_pct", { value: new Intl.NumberFormat(fmt.locale, { maximumFractionDigits: 2 }).format(v) }) : t("sum_fixed", { value: fmt.money(v) }));
    const cap = parseNum(form.max_discount);
    if (isPct && cap && cap > 0) parts.push(t("sum_cap", { value: fmt.money(cap) }));
    const min = parseNum(form.min_purchase);
    if (min && min > 0) parts.push(t("sum_min", { value: fmt.money(min) }));
    if (form.first_order_only) parts.push(t("sum_first"));
    const per = parseNum(form.max_uses_per_customer);
    if (per && per > 0) parts.push(t("sum_per_customer", { n: per }));
    const total = parseNum(form.max_uses);
    if (total && total > 0) parts.push(t("sum_total", { n: total }));
    if (form.starts_at) parts.push(t("sum_from", { date: fmt.dateTime(form.starts_at) }));
    if (form.expires_at) parts.push(t("sum_until", { date: fmt.dateTime(form.expires_at) }));
    return parts;
  }, [form, isPct, t, fmt]);

  const totals = couponTotals(orders).get((coupon?.code || "").toLowerCase()) ?? { orders: 0, discount: 0, sales: 0 };
  const state = coupon ? couponState(coupon) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) { toast.error(t("err_code")); return; }
    const value = parseNum(form.discount_value);
    if (value == null || Number.isNaN(value) || value <= 0) { toast.error(t("err_value")); return; }
    if (isPct && value > 100) { toast.error(t("err_pct")); return; }
    const maxDiscount = isPct ? parseNum(form.max_discount) : null;
    const minPurchase = parseNum(form.min_purchase);
    const maxUses = parseNum(form.max_uses);
    const perCustomer = parseNum(form.max_uses_per_customer);
    const positive = (n: number | null) => n == null || (!Number.isNaN(n) && n > 0);
    if (!positive(maxDiscount) || !positive(maxUses) || !positive(perCustomer) || (minPurchase != null && (Number.isNaN(minPurchase) || minPurchase < 0))) {
      toast.error(t("err_number")); return;
    }
    const startsAt = fromLocalInput(form.starts_at);
    const expiresAt = fromLocalInput(form.expires_at);
    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) { toast.error(t("err_dates")); return; }

    const payload = {
      code,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: value,
      max_discount: maxDiscount,
      min_purchase: minPurchase ?? 0,
      first_order_only: form.first_order_only,
      customer_group_ids: form.customer_group_ids,
      max_uses: maxUses != null ? Math.round(maxUses) : null,
      max_uses_per_customer: perCustomer != null ? Math.round(perCustomer) : null,
      starts_at: startsAt,
      expires_at: expiresAt,
      active: form.active,
    };
    setSaving(true);
    try {
      const db = supabase as any;
      const res = coupon
        ? await db.from("coupons").update(payload).eq("id", coupon.id).select("id").single()
        : await db.from("coupons").insert(payload).select("id").single();
      if (res.error) throw res.error;
      await qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      toast.success(coupon ? t("saved") : t("created"));
      if (!coupon) navigate(adminHref.coupon(res.data.id), { replace: true });
    } catch (err: any) {
      toast.error(err?.code === "23505" ? t("err_code_taken") : t("save_error"), err?.code === "23505" ? undefined : { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!coupon) return;
    setDeleting(true);
    const { error } = await (supabase as any).from("coupons").delete().eq("id", coupon.id);
    setDeleting(false);
    if (error) { toast.error(t("delete_error"), { description: error.message }); return; }
    toast.success(t("deleted"));
    await qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    navigate(back.to);
  };

  const saveButton = (
    <Button type="submit" form="coupon-form" disabled={saving || (!isNew && !dirty)}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
      {isNew ? t("create") : t("save")}
    </Button>
  );

  return (
    <>
      <AdminPageHeader
        back={back}
        title={coupon ? <span className="font-mono tracking-wide">{t("title_edit", { code: coupon.code })}</span> : t("title_new")}
        subtitle={coupon ? t("hint_edit", { date: fmt.date(coupon.created_at) }) : t("hint_new")}
        badges={state ? <CouponStateBadge state={state} className="h-6 px-2 text-xs" /> : undefined}
        actions={saveButton}
      />

      {coupon && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminStatCard icon={Ticket} label={t("usage_uses")} value={coupon.max_uses != null ? t("uses_of", { n: coupon.current_uses ?? 0, max: coupon.max_uses }) : (coupon.current_uses ?? 0)} />
          <AdminStatCard icon={ShoppingBag} label={t("usage_orders")} value={totals.orders} />
          <AdminStatCard icon={Receipt} label={t("usage_discount")} value={fmt.money(totals.discount)} hint={t("stat_discount_hint")} />
          <AdminStatCard icon={TrendingUp} label={t("usage_sales")} value={fmt.money(totals.sales)} tone="success" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <form id="coupon-form" onSubmit={submit} className="min-w-0 space-y-5 xl:col-span-2" noValidate>
          <AdminPanel title={t("sec_code")} icon={Percent}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cp-code">{t("code")}</Label>
                <div className="flex gap-2">
                  <Input id="cp-code" value={form.code} maxLength={32} autoComplete="off" spellCheck={false} placeholder="BEMVINDO10"
                    onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))}
                    className="font-mono text-base tracking-wide md:text-sm" />
                  <Button type="button" variant="outline" onClick={() => set("code", randomCode())}>
                    <Wand2 className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{t("generate")}</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("code_hint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-desc">{t("description")}</Label>
                <Textarea id="cp-desc" rows={2} value={form.description} maxLength={300} placeholder={t("description_ph")}
                  onChange={(e) => set("description", e.target.value)} className="text-base md:text-sm" />
                <p className="text-xs text-muted-foreground">{t("description_hint")}</p>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">{t("type")}</legend>
                <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:max-w-sm">
                  {(["percentage", "fixed"] as const).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={form.discount_type === k} onClick={() => set("discount_type", k)}
                      className={cn("min-h-11 rounded-[14px] border px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        form.discount_type === k ? "border-primary bg-primary/10 text-brand-orange-text" : "bg-card hover:border-primary/50")}>
                      {k === "percentage" ? t("type_percentage") : t("type_fixed")}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cp-value">{isPct ? t("value_pct") : t("value_fixed", { currency: cur })}</Label>
                  <Input id="cp-value" inputMode="decimal" value={form.discount_value} onChange={(e) => set("discount_value", e.target.value)} className="text-base tabular-nums md:text-sm" />
                </div>
                {isPct && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-cap">{t("max_discount", { currency: cur })}</Label>
                    <Input id="cp-cap" inputMode="decimal" value={form.max_discount} onChange={(e) => set("max_discount", e.target.value)} className="text-base tabular-nums md:text-sm" />
                    <p className="text-xs text-muted-foreground">{t("max_discount_hint")}</p>
                  </div>
                )}
              </div>
            </div>
          </AdminPanel>

          <AdminPanel title={t("sec_conditions")} icon={ShoppingBag}>
            <div className="space-y-4">
              <div className="space-y-1.5 sm:max-w-xs">
                <Label htmlFor="cp-min">{t("min_purchase", { currency: cur })}</Label>
                <Input id="cp-min" inputMode="decimal" placeholder="0" value={form.min_purchase} onChange={(e) => set("min_purchase", e.target.value)} className="text-base tabular-nums md:text-sm" />
                <p className="text-xs text-muted-foreground">{t("min_purchase_hint")}</p>
              </div>
              <SwitchRow id="cp-first" label={t("first_order")} hint={t("first_order_hint")} checked={form.first_order_only} onChange={(v) => set("first_order_only", v)} />
              <CouponGroupsField value={form.customer_group_ids} onChange={(v) => set("customer_group_ids", v)} />
            </div>
          </AdminPanel>

          <AdminPanel title={t("sec_limits")} icon={Ticket}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cp-max">{t("max_uses")}</Label>
                <Input id="cp-max" inputMode="numeric" value={form.max_uses} onChange={(e) => set("max_uses", e.target.value.replace(/\D/g, ""))} className="text-base tabular-nums md:text-sm" />
                <p className="text-xs text-muted-foreground">{t("max_uses_hint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-per">{t("per_customer")}</Label>
                <Input id="cp-per" inputMode="numeric" value={form.max_uses_per_customer} onChange={(e) => set("max_uses_per_customer", e.target.value.replace(/\D/g, ""))} className="text-base tabular-nums md:text-sm" />
                <p className="text-xs text-muted-foreground">{t("per_customer_hint")}</p>
              </div>
            </div>
          </AdminPanel>

          <AdminPanel title={t("sec_validity")} icon={Sparkles}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cp-start">{t("starts_at")}</Label>
                <Input id="cp-start" type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} className="text-base md:text-sm" />
                <p className="text-xs text-muted-foreground">{t("starts_at_hint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-end">{t("expires_at")}</Label>
                <Input id="cp-end" type="datetime-local" value={form.expires_at} onChange={(e) => set("expires_at", e.target.value)} className="text-base md:text-sm" />
                <p className="text-xs text-muted-foreground">{t("expires_at_hint")}</p>
              </div>
            </div>
          </AdminPanel>

          <AdminPanel title={t("sec_status")}>
            <SwitchRow id="cp-active" label={t("active")} hint={t("active_hint")} checked={form.active} onChange={(v) => set("active", v)} />
          </AdminPanel>

          <div className="flex flex-wrap gap-2">
            {saveButton}
            <Button type="button" variant="outline" onClick={() => navigate(back.to)} disabled={saving}>{t("cancel")}</Button>
          </div>
        </form>

        <aside className="min-w-0 space-y-5">
          <AdminPanel title={t("summary")} icon={Sparkles} className="xl:sticky xl:top-24">
            <div className="rounded-[14px] border border-dashed border-primary/40 bg-primary/5 p-4">
              <p className="font-mono text-lg font-bold tracking-wide text-foreground">{form.code || t("code")}</p>
              {summary.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  {summary.map((s) => <li key={s}>{s}</li>)}
                </ul>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("sum_server")}</p>
          </AdminPanel>

          {coupon && (
            <AdminPanel title={t("orders_title", { n: orders.length })} icon={ShoppingBag}>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("orders_empty")}</p>
              ) : (
                <ul className="divide-y rounded-[14px] border">
                  {orders.slice(0, 30).map((o) => (
                    <li key={o.id}>
                      <Link to={adminHref.order(o.id)} className={cn("flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", !isCountedOrder(o) && "opacity-60")}>
                        <span className="min-w-0">
                          <span className="block font-mono text-xs font-bold">#{o.id.slice(0, 8)}</span>
                          <span className="block truncate text-xs text-muted-foreground">{o.guest_name || o.shipping_address?.recipient_name || t("guest")} · {fmt.date(o.created_at)}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold tabular-nums">{fmt.money(o.total)}</span>
                          <Badge className={cn("border text-[10px]", getOrderStatusStyle(o.status).badge)}>{orderStatusLabel(o.status, fmt.locale)}</Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </AdminPanel>
          )}

          {coupon && (
            <section className="rounded-[18px] border border-destructive/40 bg-card p-5">
              <h2 className="font-semibold">{t("danger")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("danger_text")}</p>
              {!askDelete && (
                <Button type="button" variant="outline" className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setAskDelete(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> {t("delete")}
                </Button>
              )}
              <ConfirmStrip open={askDelete} title={t("delete_confirm", { code: coupon.code })} description={t("delete_confirm_text")}
                confirmLabel={t("delete")} busy={deleting} className="mt-3" onCancel={() => setAskDelete(false)} onConfirm={remove} />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function SwitchRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[14px] border p-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
