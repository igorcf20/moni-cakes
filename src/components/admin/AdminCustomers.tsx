// =====================================================================================
// Admin > Clientes: números, segmentos, busca, ordenação, planilha. Cada cliente abre a página dele
// (/admin/clientes/<id>); criar e editar também são páginas (src/pages/admin/AdminCustomerFormPage.tsx).
// =====================================================================================
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, useNavigate } from "react-router-dom";
import { Search, Users, Mail, Phone, ShoppingBag, Pencil, Plus, Eye, Download, Repeat, MoreVertical, Receipt, ArrowUpDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { useAdminFormat, usePaged, initials } from "@/hooks/useAdminList";
import { downloadCsv, csvNumber } from "@/lib/csv";
import { useMessages } from "@/i18n";
import { adminManageMessages, type AdminManageKey } from "@/i18n/adminManage";
import { useCountries, DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { formatTaxId, taxIdType, type TaxIdKind } from "@/lib/taxId";
import { adminHref } from "@/components/admin/shell/adminSections";

type Segment = "all" | "buyers" | "repeat" | "no_orders" | "new";
type CustomerSort = "recent" | "spent" | "orders" | "last_order" | "name";

const AdminCustomers = () => {
  const { t } = useMessages(adminManageMessages);
  const fmt = useAdminFormat();
  const navigate = useNavigate();
  const { data: countries = [] } = useCountries();
  const [segment, setSegment] = useState<Segment>("all");
  const [sort, setSort] = useState<CustomerSort>("recent");
  const [searchTerm, setSearchTerm] = useState("");
  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["admin-customers-profiles"],
    queryFn: async () => {
      // RPC joins auth.users (for email) with user_profiles; only admins succeed.
      const { data, error } = await (supabase as any).rpc("admin_list_customers");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["admin-customers-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("user_id, total, status, payment_status, refunded_at, created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const isLoading = profilesLoading || ordersLoading;

  // Números de cada cliente: só pedidos pagos, não reembolsados e não cancelados contam como compra.
  const isRevenueOrder = (o: any) =>
    o.payment_status === "paid" && !o.refunded_at && o.status !== "cancelled";
  const monthAgo = Date.now() - 30 * 86_400_000;
  const customersWithStats = profiles.map((profile: any) => {
    const userOrders = orders.filter((o: any) => o.user_id === profile.user_id);
    const paid = userOrders.filter(isRevenueOrder);
    const lastOrderAt = userOrders.reduce<string | null>((m, o: any) => (!m || o.created_at > m ? o.created_at : m), null);
    return {
      ...profile,
      totalSpent: paid.reduce((sum, o: any) => sum + Number(o.total || 0), 0),
      orderCount: userOrders.length,
      paidCount: paid.length,
      lastOrderAt,
      isNew: new Date(profile.created_at).getTime() > monthAgo,
    };
  });
  type Customer = (typeof customersWithStats)[number];
  const shoppers = customersWithStats.filter((c) => !c.is_admin);
  const segmentOf: Record<Segment, (c: Customer) => boolean> = {
    all: () => true,
    buyers: (c) => c.paidCount > 0,
    repeat: (c) => c.paidCount >= 2,
    no_orders: (c) => c.orderCount === 0 && !c.is_admin,
    new: (c) => c.isNew && !c.is_admin,
  };

  const searchLower = searchTerm.trim().toLowerCase();
  const filteredCustomers = customersWithStats
    .filter(segmentOf[segment])
    .filter((c) => !searchLower || [c.full_name, c.email, c.tax_id, c.phone, c.user_id].some((v) => String(v || "").toLowerCase().includes(searchLower)))
    .sort((a, b) => {
      switch (sort) {
        case "spent": return b.totalSpent - a.totalSpent;
        case "orders": return b.orderCount - a.orderCount;
        case "last_order": return String(b.lastOrderAt || "").localeCompare(String(a.lastOrderAt || ""));
        case "name": return String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""), fmt.locale);
        default: return String(b.created_at).localeCompare(String(a.created_at));
      }
    });
  const paged = usePaged<Customer>(filteredCustomers, 25);

  const revenue = orders.filter(isRevenueOrder).reduce((sum, o: any) => sum + Number(o.total || 0), 0);
  const paidOrders = orders.filter(isRevenueOrder).length;
  const buyers = shoppers.filter((c) => c.paidCount > 0).length;
  const repeatBuyers = shoppers.filter((c) => c.paidCount >= 2).length;

  // Documento fiscal com o nome e a máscara do país em que foi registado (CPF/CNPJ, NIF...).
  const kindOf = (code?: string | null): TaxIdKind =>
    (countries.find((c) => c.code === (code || DEFAULT_COUNTRY_CODE))?.taxIdKind ?? "none") as TaxIdKind;
  const docOf = (c: any) => {
    if (!c.tax_id) return null;
    const kind = kindOf(c.tax_id_country);
    const type = taxIdType(kind, c.tax_id);
    return { label: type ? type.toUpperCase() : t("tax_doc"), value: formatTaxId(kind, c.tax_id) };
  };
  const waLink = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 10 ? `https://wa.me/${digits}` : null;
  };

  const exportCsv = () => {
    downloadCsv(t("csv_customers_file"),
      [t("csv_name"), t("csv_email"), t("csv_phone"), t("tax_doc"), t("csv_orders"), t("csv_paid_orders"), t("csv_spent"), t("csv_last_order"), t("csv_signup")],
      filteredCustomers.map((c) => [
        c.full_name || "", c.email || "", c.phone || "", docOf(c)?.value || "",
        c.orderCount, c.paidCount, csvNumber(c.totalSpent, fmt.locale), fmt.date(c.lastOrderAt), fmt.date(c.created_at),
      ]));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t("customers_summary", { n: shoppers.length })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!filteredCustomers.length}>
            <Download className="h-4 w-4" aria-hidden="true" /> {t("export_csv")}
          </Button>
          <Button onClick={() => navigate(adminHref.newCustomer())}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("new_customer")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AdminStatCard icon={Users} label={t("stat_customers")} value={shoppers.length} hint={t("stat_new_30", { n: shoppers.filter((c) => c.isNew).length })} />
        <AdminStatCard icon={ShoppingBag} label={t("stat_buyers")} value={buyers}
          hint={shoppers.length ? t("stat_conversion", { pct: Math.round((buyers / shoppers.length) * 100) }) : undefined} tone="success" />
        <AdminStatCard icon={Repeat} label={t("stat_repeat")} value={repeatBuyers}
          hint={buyers ? t("stat_repeat_pct", { pct: Math.round((repeatBuyers / buyers) * 100) }) : undefined} />
        <AdminStatCard icon={Receipt} label={t("stat_avg_ticket")} value={fmt.money(paidOrders ? revenue / paidOrders : 0)} hint={t("stat_avg_ticket_hint")} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input placeholder={t("customers_search")} aria-label={t("customers_search")} value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 text-base md:text-sm" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as CustomerSort)}>
          <SelectTrigger className="lg:w-56" aria-label={t("sort")}><ArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["recent", "spent", "orders", "last_order", "name"] as CustomerSort[]).map((k) => (
              <SelectItem key={k} value={k}>{t(`csort_${k}` as AdminManageKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FilterChips<Segment>
        label={t("segments")}
        value={segment}
        onChange={setSegment}
        options={(["all", "buyers", "repeat", "no_orders", "new"] as Segment[]).map((k) => ({
          value: k,
          label: t(`seg_${k}` as AdminManageKey),
          count: customersWithStats.filter(segmentOf[k]).length,
        }))}
      />

      <div className="overflow-x-auto rounded-[18px] border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col_customer")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("col_contact")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("col_orders")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("col_spent")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("col_last_order")}</TableHead>
              <TableHead className="hidden 2xl:table-cell">{t("col_signup")}</TableHead>
              <TableHead className="text-right"><span className="sr-only">{t("col_actions")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {profiles.length ? t("customers_none_found") : t("customers_empty")}
                </TableCell>
              </TableRow>
            ) : (
              paged.items.map((customer) => {
                const doc = docOf(customer);
                const wa = customer.phone ? waLink(customer.phone) : null;
                const name = customer.full_name || customer.email || t("no_name");
                return (
                  <TableRow key={customer.user_id}>
                    <TableCell>
                      <Link to={adminHref.customer(customer.user_id)} className="flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 sm:grid text-sm font-bold text-brand-orange-text" aria-hidden="true">{initials(name)}</span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-medium text-foreground hover:underline max-w-[120px] sm:max-w-[220px]">{name}</span>
                            {customer.is_admin && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{t("badge_admin")}</Badge>}
                            {!customer.is_admin && customer.paidCount >= 2 && <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-emerald-600/40 text-emerald-700">{t("badge_repeat")}</Badge>}
                            {!customer.is_admin && customer.isNew && <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-primary/40 text-brand-orange-text">{t("badge_new")}</Badge>}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground max-w-[170px] sm:max-w-[260px]">{customer.email}</span>
                          <span className="block text-xs tabular-nums sm:hidden">{t("mobile_orders_spent", { n: customer.orderCount, total: fmt.money(customer.totalSpent) })}</span>
                          {doc && <span className="block text-[11px] text-muted-foreground tabular-nums">{doc.label} {doc.value}</span>}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-col gap-1 text-xs">
                        {customer.email && (
                          <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                            <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {t("contact_email")}
                          </a>
                        )}
                        {customer.phone && (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
                            <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {customer.phone}
                            {wa && <a href={wa} target="_blank" rel="noreferrer" className="font-semibold text-brand-orange-text hover:underline">{t("contact_whatsapp")}</a>}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right tabular-nums">
                      <span className="font-semibold">{customer.orderCount}</span>
                      {customer.orderCount > customer.paidCount && <span className="block text-[11px] text-muted-foreground">{t("paid_n", { n: customer.paidCount })}</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right font-semibold tabular-nums whitespace-nowrap">{fmt.money(customer.totalSpent)}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap" title={fmt.dateTime(customer.lastOrderAt)}>
                      {customer.lastOrderAt ? fmt.relative(customer.lastOrderAt) : t("never")}
                    </TableCell>
                    <TableCell className="hidden 2xl:table-cell text-sm text-muted-foreground whitespace-nowrap">{fmt.date(customer.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button asChild variant="ghost" size="icon" className="h-9 w-9" aria-label={t("view_customer", { name })} title={t("view_customer", { name })}>
                          <Link to={adminHref.customer(customer.user_id)}><Eye className="h-4 w-4" /></Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("actions_of", { name })}><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {customer.orderCount > 0 && (
                              <DropdownMenuItem onClick={() => navigate(`${adminHref.section("orders")}&q=${encodeURIComponent(customer.email || name)}`)}>
                                <ShoppingBag className="h-4 w-4 mr-2" aria-hidden="true" />{t("act_orders")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => navigate(adminHref.editCustomer(customer.user_id))}><Pencil className="h-4 w-4 mr-2" aria-hidden="true" />{t("act_edit")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <div className="px-4 pb-4"><AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} /></div>
      </div>

    </div>
  );
};

export default AdminCustomers;
