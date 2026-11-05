// =====================================================================================
// Aba Aluguel da página do produto no Admin (/admin/produto/<id>?tab=rental; recurso rentals): liga o aluguel do
// produto (o preço do produto passa a ser o preço por período), unidade do preço, mínimo e máximo de períodos,
// unidades para alugar e caução. Grava em product_rentals com o seu botão; remover pede confirmação na página.
// =====================================================================================
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminRentalsMessages } from "@/i18n/adminRentals";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useAdminProductRental, useDeleteProductRental, useSaveProductRental } from "@/hooks/useRentals";
import { normalizeRentalProduct, RENTAL_UNITS, type RentalUnit } from "@/lib/rentals";

type Form = { on: boolean; unit: RentalUnit; min: string; max: string; units: string; deposit: string };

export default function ProductRentalEditor({ productId, basePrice }: { productId: string; basePrice: number }) {
  const { t } = useMessages(adminRentalsMessages);
  const { money, currency } = useAdminFormat();
  const { data: saved, isLoading } = useAdminProductRental(productId);
  const save = useSaveProductRental();
  const remove = useDeleteProductRental();
  const { ask, confirmSlot } = useInlineConfirm();
  const [f, setF] = useState<Form>({ on: false, unit: "day", min: "1", max: "", units: "1", deposit: "0" });
  useEffect(() => {
    if (saved) setF({ on: saved.is_active, unit: saved.unit, min: String(saved.min_periods), max: saved.max_periods ? String(saved.max_periods) : "", units: String(saved.units), deposit: String(saved.deposit) });
  }, [saved]);

  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;

  const value = normalizeRentalProduct({
    product_id: productId, is_active: f.on, unit: f.unit, min_periods: f.min, max_periods: f.max.trim() || null,
    units: f.units, deposit: f.deposit.replace(",", "."),
  });
  const submit = async () => {
    try {
      await save.mutateAsync(value);
      toast.success(t("p_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const drop = async () => {
    if (!(await ask(t("p_confirm_remove"), { confirmLabel: t("p_remove") }))) return;
    try {
      await remove.mutateAsync(productId);
      setF({ on: false, unit: "day", min: "1", max: "", units: "1", deposit: "0" });
      toast.success(t("p_removed"));
    } catch {
      toast.error(t("save_error"));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("p_hint")}</p>
      <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
        <div>
          <Label htmlFor="pr-on" className="text-sm font-semibold">{t("p_on")}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("p_on_d")}</p>
        </div>
        <Switch id="pr-on" checked={f.on} onCheckedChange={(v) => setF({ ...f, on: v })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pr-unit">{t("p_unit")}</Label>
          <Select value={f.unit} onValueChange={(v) => setF({ ...f, unit: v as RentalUnit })}>
            <SelectTrigger id="pr-unit"><SelectValue /></SelectTrigger>
            <SelectContent>{RENTAL_UNITS.map((u) => <SelectItem key={u} value={u}>{t(`unit_${u}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-min">{t("p_min")}</Label>
          <Input id="pr-min" inputMode="numeric" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-max">{t("p_max")}</Label>
          <Input id="pr-max" inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value.replace(/\D/g, "") })} />
          <p className="text-xs text-muted-foreground">{t("p_max_hint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-units">{t("p_units")}</Label>
          <Input id="pr-units" inputMode="numeric" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value.replace(/\D/g, "") })} />
          <p className="text-xs text-muted-foreground">{t("p_units_hint")}</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="pr-deposit">{t("p_deposit", { currency })}</Label>
          <Input id="pr-deposit" inputMode="decimal" className="max-w-[200px]" value={f.deposit} onChange={(e) => setF({ ...f, deposit: e.target.value.replace(/[^\d.,]/g, "") })} />
          <p className="text-xs text-muted-foreground">{t("p_deposit_hint")}</p>
        </div>
      </div>

      {basePrice > 0 && <p className="text-sm font-medium">{t("p_preview", { price: money(basePrice), unit: t(`unit_${value.unit}`) })}</p>}
      <p className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />{t("p_stock")}</p>
      {confirmSlot}
      <div className="flex flex-wrap justify-end gap-2">
        {saved && <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void drop()} disabled={remove.isPending}><Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("p_remove")}</Button>}
        <Button onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("p_save")}
        </Button>
      </div>
    </div>
  );
}
