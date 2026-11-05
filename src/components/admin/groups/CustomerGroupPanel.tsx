// Bloco "Grupo do cliente" na página do cliente no Admin (recurso customer_groups): escolher o grupo ou nenhum.
// Some quando o recurso está desligado. Grupos em Admin > Grupos de clientes (AdminCustomerGroups).
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { UsersRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPanel } from "@/components/admin/shell/AdminPageParts";
import { adminHref } from "@/components/admin/shell/adminSections";
import { useFeature } from "@/hooks/useFeatures";
import { useCustomerGroupOf, useCustomerGroups, useSetCustomerGroup } from "@/hooks/useCustomerGroups";
import { useMessages } from "@/i18n";
import { customerGroupsMessages } from "@/i18n/customerGroups";

const NONE = "__none";

export default function CustomerGroupPanel({ userId }: { userId: string }) {
  const on = useFeature("customer_groups");
  const { t } = useMessages(customerGroupsMessages);
  const { data: groups = [] } = useCustomerGroups();
  const { data: current, isLoading } = useCustomerGroupOf(on ? userId : null);
  const setGroup = useSetCustomerGroup();
  if (!on) return null;

  const change = (v: string) => setGroup.mutate({ userId, groupId: v === NONE ? null : v }, {
    onSuccess: () => toast.success(t("customer_saved")),
    onError: () => toast.error(t("save_error")),
  });

  return (
    <AdminPanel title={t("customer_block")} icon={UsersRound}>
      <div className="space-y-2">
        <Select value={current ?? NONE} onValueChange={change} disabled={isLoading || setGroup.isPending}>
          <SelectTrigger aria-label={t("customer_block")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("customer_none")}</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}{g.discount_percent > 0 ? ` (${t("discount_badge", { n: g.discount_percent })})` : ""}{g.is_active ? "" : ` · ${t("off")}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("customer_block_hint")}</p>
        <Link to={adminHref.section("customer-groups")} className="inline-block text-sm font-medium text-brand-orange-text hover:underline">{t("manage_groups")}</Link>
      </div>
    </AdminPanel>
  );
}
