// Campo Marca na aba Dados do produto no Admin (recurso brands). Lista todas as marcas (também as escondidas).
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminHref } from "./shell/adminSections";
import { useAdminBrands } from "@/hooks/useBrands";
import { useMessages } from "@/i18n";
import { adminBrandsMessages } from "@/i18n/adminBrands";

const NONE = "__none";

export default function BrandField({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useMessages(adminBrandsMessages);
  const { data: brands = [] } = useAdminBrands();
  return (
    <div className="space-y-1.5">
      <label htmlFor="brand_id" className="text-sm font-semibold">{t("field")}</label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger id="brand_id"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("field_none")}</SelectItem>
          {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{b.is_active ? "" : ` (${t("hidden")})`}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {t("field_hint")}{" "}
        <Link to={adminHref.section("brands")} className="font-medium text-brand-orange-text hover:underline">{t("field_manage")}</Link>
      </p>
    </div>
  );
}
