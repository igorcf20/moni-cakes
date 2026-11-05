// =====================================================================================
// Admin > Pedidos: lista com filtros, busca, filtros rápidos por estado, seleção em massa, planilha e o próximo
// passo de cada pedido. Clicar num pedido abre a página dele (src/pages/admin/AdminOrderPage.tsx); Novo pedido
// abre /admin/pedidos/novo. Confirmações de apagar ficam na própria página (sem janelas por cima).
// =====================================================================================
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllOrders, orderStatusConfig } from "@/hooks/useOrders";
import { getOrderStatusStyle, getPaymentStatusStyle } from "@/lib/orderStatusStyles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Package, Download, ChevronRight, Loader2, Trash2, Archive, ArchiveRestore, FileX, Ban, Plus, ShoppingBag, Receipt, Repeat, Hammer, Printer } from "lucide-react";
import { toast } from "sonner";
import OrderNextStep from "./orders/OrderNextStep";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { InlineConfirm } from "./shell/AdminPageParts";
import { adminHref } from "./shell/adminSections";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { downloadCsv, csvNumber } from "@/lib/csv";
import { useMessages } from "@/i18n";
import { adminManageMessages } from "@/i18n/adminManage";
import { orderStatusLabel, paymentStatusLabel, paymentMethodLabel } from "@/lib/orderStatusStyles";
import { useFeature } from "@/hooks/useFeatures";
import { orderPrintMessages } from "@/i18n/orderPrint";
import { printHref } from "./orderPrint/printHref";

const AdminOrdersEnhanced = () => {
  const { orders, isLoading, refetch } = useAllOrders();
  const { t } = useMessages(adminManageMessages);
  const { t: tpr } = useMessages(orderPrintMessages);
  const printingOn = useFeature("order_printing");
  const fmt = useAdminFormat();
  const navigate = useNavigate();
  
  const userIds = Array.from(new Set(orders.map((o) => o.user_id).filter(Boolean)));
  const { data: userProfiles = [] } = useQuery({
    queryKey: ["admin-order-user-profiles", userIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("user_id, full_name, phone, tax_id")
        .in("user_id", userIds);
      if (error) throw error;
      return data || [];
    },
    enabled: userIds.length > 0,
  });
  const profileByUserId = new Map(userProfiles.map((p: any) => [p.user_id, p]));
  // E-mail dos clientes com conta (fica em auth.users; a RPC só responde a administradores).
  const { data: customerEmails = [] } = useQuery({
    queryKey: ["admin-customers-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_list_customers");
      if (error) throw error;
      return data || [];
    },
  });
  const emailByUserId = new Map<string, string>(customerEmails.map((c: any) => [c.user_id, c.email]));
  const getCustomerEmail = (order: any): string =>
    (order.user_id ? emailByUserId.get(order.user_id) : null) || order.guest_email?.trim?.() || "";
  // Resumo dos itens para a lista ("2x Vaso, Chaveiro +1").
  const itemsSummary = (order: any): string => {
    const items: any[] = order.order_items || [];
    const names = items.slice(0, 2).map((i) => `${i.quantity > 1 ? `${i.quantity}x ` : ""}${i.products?.name || i.product_id || ""}`);
    return names.join(", ") + (items.length > 2 ? ` +${items.length - 2}` : "");
  };
  const getCustomerName = (order: any) =>
    (order.user_id ? profileByUserId.get(order.user_id)?.full_name?.trim?.() : null) ||
    order.guest_name?.trim?.() ||
    order.shipping_address?.recipient_name ||
    "Não informado";
  const getCustomerPhone = (order: any) =>
    (order.user_id ? profileByUserId.get(order.user_id)?.phone : null) ||
    order.guest_phone?.trim?.() ||
    "Não informado";
  // ?q= vem de Admin > Clientes (Ver pedidos do cliente).
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [archivedView, setArchivedView] = useState<"active" | "archived" | "all">("active");
  const [period, setPeriod] = useState<"all" | "today" | "7" | "30" | "90">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletingFiles, setDeletingFiles] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteOrders = async (ids: string[]) => {
    if (!ids.length) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-order", {
        body: { order_ids: ids },
      });
      if (error) throw error;
      toast.success(
        `${ids.length} ${ids.length === 1 ? "pedido apagado" : "pedidos apagados"}`,
        { description: `${(data as any)?.files ?? 0} ficheiros removidos do armazenamento.` }
      );
      setSelectedIds(new Set());
      await refetch();
    } catch (e: any) {
      toast.error(e.message || "Erro ao apagar pedidos");
    } finally {
      setDeleting(false);
    }
  };

  const deleteOrderFiles = async (ids: string[]) => {
    if (!ids.length) return;
    setDeletingFiles(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-order", {
        body: { order_ids: ids, files_only: true },
      });
      if (error) throw error;
      toast.success("Anexos removidos", {
        description: `${(data as any)?.files ?? 0} ficheiros eliminados.`,
      });
      setSelectedIds(new Set());
      await refetch();
    } catch (e: any) {
      toast.error(e.message || "Erro ao apagar anexos");
    } finally {
      setDeletingFiles(false);
    }
  };

  const archiveOrders = async (ids: string[], archived: boolean) => {
    if (!ids.length) return;
    setArchiving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ archived })
        .in("id", ids);
      if (error) throw error;
      toast.success(archived ? "Pedidos arquivados" : "Pedidos restaurados");
      setSelectedIds(new Set());
      await refetch();
    } catch (e: any) {
      toast.error(e.message || "Erro ao arquivar");
    } finally {
      setArchiving(false);
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    const isArchived = (order as any).archived === true;
    if (archivedView === "active" && isArchived) return false;
    if (archivedView === "archived" && !isArchived) return false;
    if (period !== "all") {
      const since = new Date();
      if (period === "today") since.setHours(0, 0, 0, 0);
      else since.setDate(since.getDate() - Number(period));
      if (new Date(order.created_at) < since) return false;
    }
    const q = searchTerm.trim().toLowerCase().replace(/^#/, "");
    const matchesSearch = !q || [
      order.id,
      getCustomerName(order),
      getCustomerEmail(order),
      getCustomerPhone(order),
      order.guest_name,
      order.tracking_number,
      itemsSummary(order),
    ].some((v) => String(v || "").toLowerCase().includes(q));
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "cancellation_requested"
          ? (order as any).cancellation_status === "requested"
          : order.status === statusFilter;
    const matchesPaymentStatus = paymentStatusFilter === "all" || order.payment_status === paymentStatusFilter;
    return matchesSearch && matchesStatus && matchesPaymentStatus;
  }).sort((a: any, b: any) => {
    // Bubble up requested cancellations when nothing is filtering them out.
    const aReq = a.cancellation_status === "requested" ? 1 : 0;
    const bReq = b.cancellation_status === "requested" ? 1 : 0;
    return bReq - aReq;
  });

  // Planilha dos pedidos filtrados (abre certa no Excel: separador ";" e acentos).
  const handleExportCSV = () => {
    const headers = [t("csv_order"), t("csv_date"), t("csv_customer"), t("csv_email"), t("csv_phone"), t("csv_items"),
      t("csv_shipping"), t("csv_discount"), t("csv_total"), t("csv_status"), t("csv_payment_method"), t("csv_payment_status"), t("csv_tracking")];
    const rows = filteredOrders.map((o: any) => [
      o.id.slice(0, 8),
      fmt.dateTime(o.created_at),
      getCustomerName(o),
      getCustomerEmail(o),
      getCustomerPhone(o),
      (o.order_items || []).map((i: any) => `${i.quantity}x ${i.products?.name || i.product_id}`).join(" | "),
      csvNumber(Number(o.shipping_cost || 0), fmt.locale),
      csvNumber(Number(o.discount_amount || 0), fmt.locale),
      csvNumber(Number(o.total || 0), fmt.locale),
      orderStatusLabel(o.status, fmt.locale),
      paymentMethodLabel(o.payment_method, fmt.locale),
      paymentStatusLabel(o.payment_status || "pending", fmt.locale),
      o.tracking_number || "",
    ]);
    downloadCsv(t("csv_orders_file"), headers, rows);
  };

  const paged = usePaged(filteredOrders, 20);
  // Contagem por estado para os filtros rápidos (só pedidos da vista atual: ativos ou arquivados).
  const inView = orders.filter((o: any) => archivedView === "all" || (archivedView === "archived") === (o.archived === true));
  const statusCount = (k: string) => inView.filter((o) => o.status === k).length;
  // Números do topo: pedidos da vista e do período escolhidos (a busca e os filtros de estado não mudam os totais).
  const inPeriod = inView.filter((o) => {
    if (period === "all") return true;
    const since = new Date();
    if (period === "today") since.setHours(0, 0, 0, 0);
    else since.setDate(since.getDate() - Number(period));
    return new Date(o.created_at) >= since;
  });
  const paidInPeriod = inPeriod.filter((o) => o.payment_status === "paid" && !["cancelled", "refunded"].includes(o.status));
  const revenue = paidInPeriod.reduce((s, o) => s + Number(o.total || 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={ShoppingBag} label={t("stat_orders_period")} value={inPeriod.length} hint={t("stat_paid_n", { n: paidInPeriod.length })} />
        <AdminStatCard icon={Receipt} label={t("stat_revenue")} value={fmt.money(revenue)} hint={t("stat_revenue_hint")} tone="success" />
        <AdminStatCard icon={Repeat} label={t("stat_avg_ticket")} value={fmt.money(paidInPeriod.length ? revenue / paidInPeriod.length : 0)} hint={t("stat_avg_ticket_hint")} />
        <AdminStatCard icon={Hammer} label={t("stat_to_produce")} value={statusCount("paid")} hint={t("stat_to_ship", { n: statusCount("preparing") })}
          tone={statusCount("paid") ? "warning" : "default"} active={statusFilter === "paid"} onClick={() => setStatusFilter(statusFilter === "paid" ? "all" : "paid")} />
      </div>
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row flex-wrap gap-3">
            <div className="flex-1 min-w-[260px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder={t("orders_search")}
                aria-label={t("orders_search")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 text-base md:text-sm"
              />
            </div>
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-full lg:w-44" aria-label={t("period")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("period_all")}</SelectItem>
                <SelectItem value="today">{t("period_today")}</SelectItem>
                <SelectItem value="7">{t("period_7")}</SelectItem>
                <SelectItem value="30">{t("period_30")}</SelectItem>
                <SelectItem value="90">{t("period_90")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(orderStatusConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Status de pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos pagamentos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="paid">Pagos</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("export_csv")}
            </Button>
            <Button onClick={() => navigate(adminHref.newOrder())}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("new_order")}
            </Button>
          </div>
          {/* Archive view tabs */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
            <span className="text-sm text-muted-foreground self-center mr-2">Visualizar:</span>
            {[
              { key: "active", label: "Ativos", icon: Package },
              { key: "archived", label: "Arquivados", icon: Archive },
              { key: "all", label: "Todos", icon: null },
            ].map((v) => {
              const Icon = v.icon as any;
              return (
                <Button
                  key={v.key}
                  variant={archivedView === v.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setArchivedView(v.key as any)}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 mr-1.5" />}
                  {v.label}
                </Button>
              );
            })}
            {archivedView === "active" && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={archiving}
                onClick={() => {
                  const deliveredIds = filteredOrders
                    .filter((o) => o.status === "delivered" && !(o as any).archived)
                    .map((o) => o.id);
                  if (!deliveredIds.length) {
                    toast.info("Nenhum pedido entregue para arquivar");
                    return;
                  }
                  archiveOrders(deliveredIds, true);
                }}
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" />
                Arquivar todos os entregues
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-medium">
              {selectedIds.size} {selectedIds.size === 1 ? "pedido selecionado" : "pedidos selecionados"}
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Limpar
              </Button>
              {printingOn && (
                <Button variant="outline" size="sm" asChild>
                  <Link to={printHref(Array.from(selectedIds), "sheet", "pedidos")}><Printer className="h-4 w-4 mr-2" aria-hidden="true" />{tpr("bulk_print")}</Link>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={archiving}
                onClick={() => archiveOrders(Array.from(selectedIds), archivedView === "archived" ? false : true)}
              >
                {archivedView === "archived" ? (
                  <>
                    <ArchiveRestore className="h-4 w-4 mr-2" />
                    Restaurar
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4 mr-2" />
                    Arquivar
                  </>
                )}
              </Button>
              <InlineConfirm
                label="Apagar anexos"
                icon={FileX}
                busy={deletingFiles}
                title={`Apagar anexos de ${selectedIds.size} pedido(s)?`}
                description="Os ficheiros de arte, PDFs e comprovantes serão removidos do armazenamento. Os pedidos permanecem registados, mas sem ficheiros anexados."
                confirmLabel="Apagar anexos"
                onConfirm={() => deleteOrderFiles(Array.from(selectedIds))}
              />
              <InlineConfirm
                label="Apagar selecionados"
                icon={Trash2}
                variant="destructive"
                busy={deleting}
                title={`Apagar ${selectedIds.size} pedido(s)?`}
                description="Esta ação é definitiva. Todos os ficheiros de arte, PDFs, comprovantes e dados associados serão removidos do armazenamento."
                confirmLabel="Apagar definitivamente"
                onConfirm={() => deleteOrders(Array.from(selectedIds))}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros rápidos por estado, com contagem */}
      <FilterChips
        label={t("status_filter")}
        value={statusFilter}
        onChange={setStatusFilter}
        options={[
          { value: "all", label: t("all_statuses"), count: inView.length },
          ...Object.keys(orderStatusConfig).map((key) => ({
            value: key,
            label: orderStatusLabel(key, fmt.locale),
            count: statusCount(key),
            tone: key === "paid" ? ("warning" as const) : undefined,
          })),
        ]}
      />

      {/* Cancellation requests highlight */}
      {(() => {
        const pendingCount = orders.filter((o: any) => o.cancellation_status === "requested").length;
        if (pendingCount === 0 && statusFilter !== "cancellation_requested") return null;
        const active = statusFilter === "cancellation_requested";
        return (
          <Card
            className={`cursor-pointer transition-all border-amber-500/50 bg-amber-500/5 ${
              active ? "ring-2 ring-amber-500" : ""
            }`}
            onClick={() => setStatusFilter(active ? "all" : "cancellation_requested")}
          >
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Ban className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Pedidos para cancelar pendentes
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pedidos em que o cliente pediu para cancelar e ainda não foi decidido.
                  </p>
                </div>
              </div>
              <Badge className="bg-amber-500 text-white text-base px-3 py-1">
                {pendingCount}
              </Badge>
            </CardContent>
          </Card>
        );
      })()}

      {/* Lista dos pedidos */}
      <Card>
        <CardHeader className="px-4 md:px-5">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Package className="h-5 w-5" aria-hidden="true" />
            {t("orders_title", { n: filteredOrders.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 md:px-3">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum pedido encontrado
            </div>
          ) : (
            <div>
              <Table className="admin-orders-table w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 px-2">
                      <Checkbox
                        checked={filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id))}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
                          else setSelectedIds(new Set());
                        }}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                    <TableHead>{t("col_order")}</TableHead>
                    <TableHead className="hidden xl:table-cell">{t("col_customer")}</TableHead>
                    <TableHead className="text-right">{t("col_total")}</TableHead>
                    <TableHead>{t("col_status")}</TableHead>
                    <TableHead className="text-right pl-1 pr-2"><span className="sr-only">{t("col_actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.items.map((order) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(adminHref.order(order.id))}
                      >
                        <TableCell className="admin-orders-mini px-2 align-top py-3.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(order.id)}
                            onCheckedChange={() => toggleSelect(order.id)}
                            aria-label={`Selecionar pedido ${order.id.slice(0, 8)}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-0 align-top py-3">
                          <Link to={adminHref.order(order.id)} onClick={(e) => e.stopPropagation()} className="font-mono text-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">#{order.id.slice(0, 8)}</Link>
                          <div className="text-xs text-muted-foreground whitespace-nowrap" title={fmt.dateTime(order.created_at)}>{fmt.dateTime(order.created_at)}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[140px] xl:max-w-[180px]" title={itemsSummary(order)}>{itemsSummary(order)}</div>
                          <div className="text-xs font-medium hidden md:block xl:hidden truncate max-w-[140px]">{getCustomerName(order)}</div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell align-top py-3 max-w-[220px]">
                          <div className="font-medium truncate">{getCustomerName(order)}</div>
                          {getCustomerEmail(order) && <div className="text-xs text-muted-foreground truncate">{getCustomerEmail(order)}</div>}
                        </TableCell>
                        <TableCell className="text-right align-top py-3">
                          <div className="font-semibold tabular-nums whitespace-nowrap">{fmt.money(order.total)}</div>
                          <div className="text-xs text-muted-foreground md:max-w-[110px] md:ml-auto">{paymentMethodLabel(order.payment_method, fmt.locale)}</div>
                        </TableCell>
                        <TableCell className="align-top py-3 w-[200px]">
                          <div className="flex max-w-[200px] flex-wrap items-center gap-1">
                            <Badge className={`border whitespace-nowrap ${getOrderStatusStyle(order.status).badge}`}>
                              {orderStatusLabel(order.status, fmt.locale)}
                            </Badge>
                            {order.payment_status !== "paid" && order.status !== "pending" && order.status !== "cancelled" && (
                              <Badge className={`border whitespace-nowrap ${getPaymentStatusStyle(order.payment_status || "pending").badge}`}>
                                {paymentStatusLabel(order.payment_status || "pending", fmt.locale)}
                              </Badge>
                            )}
                            {(order as any).payment_proof_url && order.payment_status !== "paid" && (
                              <Badge variant="outline" className="whitespace-nowrap border-sky-500/60 text-sky-800 bg-sky-50">
                                {t("flag_proof")}
                              </Badge>
                            )}
                            {(order as any).cancellation_status === "requested" && (
                              <Badge variant="outline" className="whitespace-nowrap border-amber-500/60 text-amber-800 bg-amber-50">
                                <Ban className="h-3 w-3 mr-1" aria-hidden="true" /> {t("flag_cancel")}
                              </Badge>
                            )}
                            {(order as any).files_pending && (
                              <Badge variant="outline" className="whitespace-nowrap border-destructive/50 text-destructive bg-destructive/10">
                                {t("flag_files")}
                              </Badge>
                            )}
                            {(order as any).archived && (
                              <Badge variant="outline" className="whitespace-nowrap">
                                <Archive className="h-3 w-3 mr-1" aria-hidden="true" />
                                {t("flag_archived")}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                            <OrderNextStep order={order} onDone={() => refetch()} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top py-3 pl-1 pr-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button asChild variant="outline" size="sm" aria-label={t("open_order", { id: order.id.slice(0, 8) })} title={t("open_order", { id: order.id.slice(0, 8) })}>
                              <Link to={adminHref.order(order.id)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
              <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOrdersEnhanced;

