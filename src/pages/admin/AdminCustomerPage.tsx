// =====================================================================================
// Página do cliente no Admin: /admin/clientes/<id> (antes era uma janela por cima da lista).
//   cabeçalho  nome, selos, Editar dados, Novo e-mail, WhatsApp
//   números    pedidos, total gasto, ticket médio, favoritos
//   pedidos    cada um abre a página do pedido
//   endereços  criar, editar (formulário na própria página), escolher o de entrega, remover (confirmação na página)
//   favoritos  produtos que o cliente guardou
//   apagar     zona no fim, com confirmação na página
// Textos em src/i18n/adminPages.ts.
// =====================================================================================
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Calendar, Heart, Mail, MapPin, Pencil, Phone, Plus, Receipt, Repeat, ShoppingBag, Star, Trash2, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAddresses } from "@/hooks/useAddresses";
import { useAdminFormat, initials } from "@/hooks/useAdminList";
import { useAdminCustomer, type AdminCustomerRow } from "@/hooks/useAdminRecords";
import { useCountries, DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { formatTaxId, taxIdType, type TaxIdKind } from "@/lib/taxId";
import { getOrderStatusStyle, orderStatusLabel } from "@/lib/orderStatusStyles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AddressForm from "@/components/dashboard/AddressForm";
import AdminShell from "@/components/admin/shell/AdminShell";
import { AdminPageHeader, AdminPanel, ConfirmStrip, InlineConfirm, InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import { AdminStatCard } from "@/components/admin/AdminListKit";
import CustomerGroupPanel from "@/components/admin/groups/CustomerGroupPanel";
import { useMessages } from "@/i18n";
import { adminPagesMessages } from "@/i18n/adminPages";

export default function AdminCustomerPage() {
  const { id } = useParams();
  const { t } = useMessages(adminPagesMessages);
  const { customer, isLoading } = useAdminCustomer(id);
  const back = { to: adminHref.section("customers"), label: t("back_customers") };

  return (
    <AdminShell active="customers">
      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>
      ) : !customer ? (
        <>
          <AdminPageHeader back={back} title={t("customer_not_found")} />
          <p className="text-muted-foreground">{t("customer_not_found_hint")}</p>
        </>
      ) : (
        <CustomerView customer={customer} back={back} />
      )}
    </AdminShell>
  );
}

function CustomerView({ customer, back }: { customer: AdminCustomerRow; back: { to: string; label: string } }) {
  const { t } = useMessages(adminPagesMessages);
  const fmt = useAdminFormat();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: countries = [] } = useCountries();
  const userId = customer.user_id;
  const { addresses, updateAddress, deleteAddress } = useAddresses(userId);
  const [addressEditor, setAddressEditor] = useState<{ address: any | null } | null>(null);
  const [removingAddress, setRemovingAddress] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: orders = [] } = useQuery({
    queryKey: ["cust-orders", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total, status, created_at, payment_status, refunded_at, order_items(id, quantity, price, product_id, products:product_id(name))")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: favorites = [] } = useQuery({
    queryKey: ["cust-wishlist", userId],
    queryFn: async () => {
      const { data: wl, error } = await supabase.from("wishlist").select("product_id, created_at").eq("user_id", userId).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (wl || []).map((w: any) => w.product_id);
      if (!ids.length) return [];
      const { data: prods } = await (supabase as any).from("products").select("id, name, image, price").in("id", ids);
      const byId = new Map((prods || []).map((p: any) => [p.id, p]));
      return (wl || []).map((w: any) => ({ ...w, product: byId.get(w.product_id) as any }));
    },
  });

  const paid = orders.filter((o: any) => o.payment_status === "paid" && !o.refunded_at && o.status !== "cancelled");
  const totalSpent = paid.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const name = customer.full_name || customer.email || t("no_name");
  const isNew = new Date(customer.created_at).getTime() > Date.now() - 30 * 86_400_000;

  const kind = (countries.find((c) => c.code === (customer.tax_id_country || DEFAULT_COUNTRY_CODE))?.taxIdKind ?? "none") as TaxIdKind;
  const docType = customer.tax_id ? taxIdType(kind, customer.tax_id) : null;
  const digits = (customer.phone || "").replace(/\D/g, "");
  const wa = digits.length >= 10 ? `https://wa.me/${digits}` : null;

  const remove = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { user_id: userId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      toast.success(t("customer_deleted"));
      await queryClient.invalidateQueries({ queryKey: ["admin-customers-profiles"] });
      navigate(back.to);
    } catch (e: any) {
      toast.error(e?.message || t("customer_delete_error"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        back={back}
        title={
          <span className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-bold text-brand-orange-text" aria-hidden="true">{initials(name)}</span>
            <span className="min-w-0 break-words">{name}</span>
          </span>
        }
        subtitle={<span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" aria-hidden="true" />{t("customer_since", { date: fmt.date(customer.created_at) })}{customer.last_sign_in_at ? ` · ${t("last_access", { when: fmt.relative(customer.last_sign_in_at) })}` : ""}</span>}
        badges={
          <>
            {customer.is_admin && <Badge variant="outline">{t("badge_admin")}</Badge>}
            {!customer.is_admin && paid.length >= 2 && <Badge variant="outline" className="border-emerald-600/40 text-emerald-700">{t("badge_repeat")}</Badge>}
            {!customer.is_admin && isNew && <Badge variant="outline" className="border-primary/40 text-brand-orange-text">{t("badge_new")}</Badge>}
          </>
        }
        actions={
          <>
            <Button asChild><Link to={adminHref.editCustomer(userId)}><Pencil className="h-4 w-4" aria-hidden="true" />{t("edit_data")}</Link></Button>
            {customer.email && <Button asChild variant="outline"><a href={`mailto:${customer.email}`}><Mail className="h-4 w-4" aria-hidden="true" />{t("send_email")}</a></Button>}
            {wa && <Button asChild variant="outline"><a href={wa} target="_blank" rel="noreferrer"><Phone className="h-4 w-4" aria-hidden="true" />WhatsApp</a></Button>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={ShoppingBag} label={t("stat_orders")} value={orders.length} hint={orders.length > paid.length ? t("paid_n", { n: paid.length }) : undefined} />
        <AdminStatCard icon={Receipt} label={t("stat_spent")} value={fmt.money(totalSpent)} tone="success" hint={orders[0] ? t("last_order_when", { when: fmt.relative(orders[0].created_at) }) : undefined} />
        <AdminStatCard icon={Repeat} label={t("stat_avg")} value={fmt.money(paid.length ? totalSpent / paid.length : 0)} />
        <AdminStatCard icon={Heart} label={t("stat_favorites")} value={favorites.length} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2 min-w-0">
          <AdminPanel title={t("orders_of", { n: orders.length })} icon={ShoppingBag}>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("no_orders_yet")}</p>
            ) : (
              <ul className="divide-y rounded-[14px] border">
                {orders.map((o: any) => {
                  const items = (o.order_items || []) as any[];
                  const summary = items.slice(0, 2).map((i) => `${i.quantity > 1 ? `${i.quantity}x ` : ""}${i.products?.name || ""}`).join(", ") + (items.length > 2 ? ` +${items.length - 2}` : "");
                  return (
                    <li key={o.id}>
                      <Link to={adminHref.order(o.id)} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[14px]">
                        <span className="font-mono text-sm font-semibold">#{o.id.slice(0, 8)}</span>
                        <span className="text-xs text-muted-foreground">{fmt.dateTime(o.created_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{summary}</span>
                        <Badge className={`border ${getOrderStatusStyle(o.status).badge}`}>{orderStatusLabel(o.status, fmt.locale)}</Badge>
                        <span className="w-24 text-right font-semibold tabular-nums">{fmt.money(o.total)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </AdminPanel>

          <AdminPanel
            title={t("addresses_of", { n: addresses.length })}
            icon={MapPin}
            actions={<Button size="sm" variant="outline" onClick={() => setAddressEditor({ address: null })}><Plus className="h-4 w-4" aria-hidden="true" />{t("new_address")}</Button>}
          >
            <InlinePanel
              open={!!addressEditor}
              onClose={() => setAddressEditor(null)}
              title={addressEditor?.address ? t("edit_address") : t("new_address")}
              className="mb-4"
            >
              {addressEditor && (
                <AddressForm
                  key={addressEditor.address?.id ?? "new"}
                  address={addressEditor.address}
                  userIdOverride={userId}
                  onClose={() => setAddressEditor(null)}
                  onSuccess={() => queryClient.invalidateQueries({ queryKey: ["addresses", userId] })}
                />
              )}
            </InlinePanel>
            {addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("no_addresses")}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {addresses.map((a: any) => (
                  <li key={a.id} className="rounded-[14px] border p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-foreground">{a.name || t("address")}</span>
                      {a.is_default && <Badge variant="outline" className="text-[10px]">{t("addr_shipping")}</Badge>}
                      {a.is_billing_default && <Badge variant="outline" className="text-[10px]">{t("addr_billing")}</Badge>}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {a.street}{a.number ? `, ${a.number}` : ""}{a.complement ? `, ${a.complement}` : ""}<br />
                      {a.postal_code} {a.city}{a.parish ? `, ${a.parish}` : ""}{a.district ? `, ${a.district}` : ""}{a.country ? ` · ${a.country}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {!a.is_default && (
                        <Button size="sm" variant="ghost" onClick={() => updateAddress({ id: a.id, is_default: true })}>
                          <Star className="h-4 w-4" aria-hidden="true" />{t("make_default")}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setAddressEditor({ address: a })}><Pencil className="h-4 w-4" aria-hidden="true" />{t("edit")}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setRemovingAddress(a)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />{t("remove")}
                      </Button>
                    </div>
                    <ConfirmStrip
                      open={removingAddress?.id === a.id}
                      title={t("remove_address_q")}
                      description={t("remove_address_text", { name: a.name || t("address") })}
                      confirmLabel={t("remove")}
                      className="mt-2"
                      onCancel={() => setRemovingAddress(null)}
                      onConfirm={() => { deleteAddress(a.id); setRemovingAddress(null); }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>
        </div>

        <div className="space-y-5 min-w-0">
          <AdminPanel title={t("contact")} icon={Users}>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-muted-foreground">{t("email")}</dt><dd className="break-all text-foreground">{customer.email || t("not_informed")}</dd></div>
              <div><dt className="text-muted-foreground">{t("phone")}</dt><dd className="text-foreground">{customer.phone || t("not_informed")}</dd></div>
              <div>
                <dt className="text-muted-foreground">{docType ? docType.toUpperCase() : t("tax_doc")}</dt>
                <dd className="text-foreground tabular-nums">{customer.tax_id ? formatTaxId(kind, customer.tax_id) : t("not_informed")}</dd>
              </div>
            </dl>
          </AdminPanel>

          <CustomerGroupPanel userId={customer.user_id} />

          <AdminPanel title={t("favorites_of", { n: favorites.length })} icon={Heart}>
            {favorites.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("no_favorites")}</p>
            ) : (
              <ul className="space-y-2">
                {favorites.map((f: any) => (
                  <li key={f.product_id}>
                    <Link to={adminHref.product(f.product_id)} className="flex items-center gap-3 rounded-xl p-1 hover:bg-muted/50">
                      {f.product?.image
                        ? <img src={f.product.image} alt="" className="h-11 w-11 rounded-lg border object-cover bg-muted" />
                        : <span className="grid h-11 w-11 place-items-center rounded-lg bg-muted"><Heart className="h-4 w-4 text-muted-foreground" aria-hidden="true" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{f.product?.name || f.product_id}</span>
                        {f.product?.price != null && <span className="block text-xs text-muted-foreground">{fmt.money(f.product.price)}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>

          {!customer.is_admin && (
            <AdminPanel title={t("danger_zone")} className="border-destructive/30">
              <p className="mb-3 text-sm text-muted-foreground">{t("delete_customer_hint")}</p>
              <div className="flex flex-wrap gap-2">
                <InlineConfirm
                  label={t("delete_customer")}
                  icon={Trash2}
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  title={t("delete_customer_q", { name })}
                  description={t("delete_customer_text")}
                  confirmLabel={t("delete_forever")}
                  busy={deleting}
                  onConfirm={remove}
                />
              </div>
            </AdminPanel>
          )}
        </div>
      </div>
    </>
  );
}
