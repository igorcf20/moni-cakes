// =====================================================================================
// Página "Novo pedido" do Admin: /admin/pedidos/novo. Pedido feito pela loja (venda por WhatsApp, balcão...),
// com o formulário src/components/admin/orders/ManualOrderForm.tsx. Ao criar, abre a página do pedido.
// =====================================================================================
import { useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/shell/AdminShell";
import { AdminPageHeader } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import ManualOrderForm from "@/components/admin/orders/ManualOrderForm";
import { useMessages } from "@/i18n";
import { adminPagesMessages } from "@/i18n/adminPages";

export default function AdminOrderNewPage() {
  const navigate = useNavigate();
  const { t } = useMessages(adminPagesMessages);
  const back = adminHref.section("orders");
  return (
    <AdminShell active="orders">
      <AdminPageHeader back={{ to: back, label: t("back_orders") }} title={t("new_order_title")} subtitle={t("new_order_hint")} />
      <ManualOrderForm onCreated={(id) => navigate(adminHref.order(id))} onCancel={() => navigate(back)} />
    </AdminShell>
  );
}
