// =====================================================================================
// Admin > Preços e segurança: regras da União Europeia que a página do produto tem de cumprir.
//   Menor preço dos últimos 30 dias  onde mostrar (UE, todos, nunca); o valor vem do histórico de preços da base
//   Segurança do produto (GPSR)       onde mostrar a aba e os dados padrão: fabricante, responsável na UE e avisos
// Grava store_settings.product_compliance (src/lib/productCompliance.ts). Cada produto pode ter dados próprios na aba
// Segurança da página do produto (ProductSafetyEditor).
// =====================================================================================
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, History, Loader2, Save, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminHelp from "./AdminHelp";
import { useMessages } from "@/i18n";
import { adminComplianceMessages } from "@/i18n/adminCompliance";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useProductCompliance, useSaveProductCompliance } from "@/hooks/useProductCompliance";
import { DEFAULT_COMPLIANCE, type ProductCompliance, type SafetyParty, type ShowMode } from "@/lib/productCompliance";
import type { LucideIcon } from "lucide-react";

type T = ReturnType<typeof useMessages<typeof adminComplianceMessages["pt-BR"]>>["t"];

const Card = ({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint?: string; children: React.ReactNode }) => (
  <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand-orange-text"><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" /></span>
      <div className="min-w-0">
        <h3 className="text-base font-bold">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
    </div>
    {children}
  </section>
);

function ModeSelect({ id, value, onChange, t }: { id: string; value: ShowMode; onChange: (v: ShowMode) => void; t: T }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("show_where")}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as ShowMode)}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="eu">{t("mode_eu")}</SelectItem>
          <SelectItem value="always">{t("mode_always")}</SelectItem>
          <SelectItem value="never">{t("mode_never")}</SelectItem>
        </SelectContent>
      </Select>
      {value === "eu" && <p className="text-xs text-muted-foreground">{t("mode_eu_hint")}</p>}
    </div>
  );
}

/** Nome, morada e contacto de uma empresa (fabricante ou responsável na UE). */
export function PartyFields({ prefix, value, onChange, t, placeholder }: {
  prefix: string; value: SafetyParty; onChange: (v: SafetyParty) => void; t: T; placeholder?: SafetyParty;
}) {
  const set = (k: keyof SafetyParty, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-name`}>{t("name")}</Label>
        <Input id={`${prefix}-name`} value={value.name} maxLength={200} placeholder={placeholder?.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-contact`}>{t("contact")}</Label>
        <Input id={`${prefix}-contact`} value={value.contact} maxLength={300} placeholder={placeholder?.contact} onChange={(e) => set("contact", e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${prefix}-address`}>{t("address")}</Label>
        <Textarea id={`${prefix}-address`} rows={2} value={value.address} maxLength={500} placeholder={placeholder?.address} onChange={(e) => set("address", e.target.value)} />
      </div>
    </div>
  );
}

export default function AdminProductCompliance() {
  const { t } = useMessages(adminComplianceMessages);
  const { money } = useAdminFormat();
  const { data, isLoading, error } = useProductCompliance();
  const save = useSaveProductCompliance();
  const [form, setForm] = useState<ProductCompliance>(DEFAULT_COMPLIANCE);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const set = <K extends keyof ProductCompliance>(k: K, v: ProductCompliance[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = !!data && JSON.stringify(form) !== JSON.stringify(data);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  const submit = () => save.mutate(form, {
    onSuccess: () => toast.success(t("saved")),
    onError: () => toast.error(t("save_error")),
  });
  const saveButton = (
    <Button onClick={submit} disabled={!dirty || save.isPending}>
      {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
      {save.isPending ? t("saving") : t("save")}
    </Button>
  );

  return (
    <div className="space-y-5">
      <AdminHelp id="precos-seguranca" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card icon={History} title={t("sec_price")} hint={t("price_hint")}>
          <ModeSelect id="pc-price" value={form.lowest_price_30d} onChange={(v) => set("lowest_price_30d", v)} t={t} />
          {form.lowest_price_30d !== "never" && (
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("example")}</p>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-2">
                <span className="text-lg font-bold text-brand-orange-text tabular-nums">{money(80)}</span>
                <s className="text-muted-foreground tabular-nums">{money(100)}</s>
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">{t("example_price", { price: money(95) })}</p>
            </div>
          )}
        </Card>
        <Card icon={ShieldCheck} title={t("sec_safety")} hint={t("safety_hint")}>
          <ModeSelect id="pc-safety" value={form.safety_show} onChange={(v) => set("safety_show", v)} t={t} />
        </Card>
      </div>

      <Card icon={Building2} title={t("sec_manufacturer")} hint={t("manufacturer_hint")}>
        <PartyFields prefix="pc-m" value={form.manufacturer} onChange={(v) => set("manufacturer", v)} t={t} />
      </Card>
      <Card icon={ShieldCheck} title={t("sec_responsible")} hint={t("responsible_hint")}>
        <PartyFields prefix="pc-r" value={form.responsible} onChange={(v) => set("responsible", v)} t={t} />
      </Card>
      <Card icon={ShieldAlert} title={t("sec_warnings")} hint={t("warnings_hint")}>
        <Textarea aria-label={t("sec_warnings")} rows={4} value={form.warnings} maxLength={4000} placeholder={t("warnings_ph")} onChange={(e) => set("warnings", e.target.value)} />
      </Card>

      <div className="flex justify-end border-t pt-4">{saveButton}</div>
    </div>
  );
}
