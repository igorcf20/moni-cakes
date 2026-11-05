// Campo Vendedor na aba Dados do produto no Admin (recurso marketplace). Lista todos os vendedores (também os pausados);
// "A própria loja" = sem vendedor.
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminHref } from "./shell/adminSections";
import { useAdminVendors } from "@/hooks/useMarketplace";
import { useMessages } from "@/i18n";
import { adminMarketplaceMessages } from "@/i18n/adminMarketplace";

const NONE = "__none";

export default function VendorField({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useMessages(adminMarketplaceMessages);
  const { data: vendors = [] } = useAdminVendors();
  return (
    <div className="space-y-1.5">
      <label htmlFor="vendor_id" className="text-sm font-semibold">{t("pf_vendor")}</label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger id="vendor_id"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("pf_vendor_none")}</SelectItem>
          {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}{v.is_active ? "" : ` ${t("pf_vendor_paused")}`} · {t("commission_n", { n: v.commission_percent })}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {t("pf_vendor_d")}{" "}
        <Link to={adminHref.section("vendors")} className="font-medium text-brand-orange-text hover:underline">{t("pf_vendor_manage")}</Link>
      </p>
    </div>
  );
}
