// Campo "Só para grupos de clientes" na página do cupom (recurso customer_groups). Grava coupons.customer_group_ids;
// a regra vale no servidor (_coupon_allowed). Com o recurso desligado o campo some, mas os grupos marcados continuam a valer.
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { adminHref } from "@/components/admin/shell/adminSections";
import { useFeature } from "@/hooks/useFeatures";
import { useCustomerGroups } from "@/hooks/useCustomerGroups";
import { useMessages } from "@/i18n";
import { customerGroupsMessages } from "@/i18n/customerGroups";
import { cn } from "@/lib/utils";

export default function CouponGroupsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const on = useFeature("customer_groups");
  const { t } = useMessages(customerGroupsMessages);
  const { data: groups = [] } = useCustomerGroups();
  if (!on) return null;
  const toggle = (id: string, checked: boolean) => onChange(checked ? [...new Set([...value, id])] : value.filter((x) => x !== id));

  return (
    <fieldset className="space-y-2 border-t pt-4">
      <legend className="text-sm font-medium">{t("coupon_groups")}</legend>
      <p className="text-xs text-muted-foreground">{t("coupon_groups_hint")}</p>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("coupon_groups_none")}{" "}
          <Link to={adminHref.section("customer-groups")} className="font-medium text-brand-orange-text hover:underline">{t("manage_groups")}</Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => {
            const checked = value.includes(g.id);
            return (
              <label key={g.id} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors duration-150", checked && "border-primary bg-brand-orange-soft")}>
                <Checkbox checked={checked} onCheckedChange={(v) => toggle(g.id, v === true)} />
                <span>{g.name}</span>
                {!g.is_active && <span className="text-xs text-muted-foreground">({t("off")})</span>}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
