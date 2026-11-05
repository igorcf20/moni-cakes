import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, FileText, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTaxIdRules } from "@/hooks/useTaxIdRules";

// A nota fiscal precisa do documento fiscal do país (CPF/CNPJ, NIF...). É pedido aqui, antes do pagamento,
// em vez de falhar no último passo. O servidor valida de novo (create-order).
const BillingTaxIdCard = ({ userId, onValidChange, embedded = false }: { userId: string; onValidChange: (valid: boolean) => void; embedded?: boolean }) => {
  const rules = useTaxIdRules();
  const { t } = rules;
  const cache = useQueryClient();
  const { data: stored, isLoading } = useQuery({
    queryKey: ["profile-tax-id", userId],
    queryFn: async () => {
      const { data } = await supabase.from("user_profiles").select("tax_id,tax_id_country").eq("user_id", userId).maybeSingle();
      return { value: rules.clean(String((data as any)?.tax_id ?? "")), country: (data as any)?.tax_id_country as string | null };
    },
  });
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // O documento guardado só vale para o país em que foi cadastrado.
  const storedValid = !rules.enabled || (!!stored?.value && (!stored.country || stored.country === rules.country) && rules.isValid(stored.value));
  useEffect(() => { onValidChange(storedValid || !rules.required); }, [storedValid, rules.required, onValidChange]);
  useEffect(() => { if (!isLoading && !storedValid) setEditing(true); }, [isLoading, storedValid]);

  if (!rules.enabled || isLoading) return null;

  const save = async () => {
    const problem = rules.validate(value);
    if (problem) return setError(problem);
    setSaving(true);
    const { error: dbError } = await supabase.from("user_profiles")
      .update({ tax_id: rules.clean(value), tax_id_country: rules.country } as any).eq("user_id", userId);
    setSaving(false);
    if (dbError) return toast.error(t("saveError"));
    setError("");
    setEditing(false);
    toast.success(t("saved"));
    await cache.invalidateQueries({ queryKey: ["profile-tax-id", userId] });
  };

  const body = (
    <AnimatePresence mode="wait" initial={false}>
      {storedValid && !editing ? (
        <motion.div key="view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          className="flex items-center gap-3 rounded-[14px] bg-brand-alt/70 px-4 py-3 text-[14px]">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" strokeWidth={1.9} aria-hidden="true" />
          <span className="min-w-0 flex-1">{rules.label} <strong className="font-semibold tabular-nums">{rules.format(stored?.value ?? "")}</strong></span>
          <button type="button" className="-my-1 inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => { setValue(rules.format(stored?.value ?? "")); setEditing(true); }}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />{t("change")}
          </button>
        </motion.div>
      ) : (
        <motion.div key="edit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-1.5">
          <Label htmlFor="checkout-tax-id" className="text-[14px] font-semibold">{rules.label} {rules.required && <span className="text-destructive">*</span>}</Label>
          <p className="text-[13px] text-muted-foreground">{t("billingSub", { label: rules.label })}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Input
              id="checkout-tax-id" inputMode={rules.inputMode} maxLength={rules.maxLength} placeholder={rules.placeholder} autoComplete="off"
              value={value} onChange={(e) => { setValue(rules.format(e.target.value)); setError(""); }}
              aria-invalid={!!error} className={`h-12 min-w-0 flex-1 basis-48 rounded-[14px] tabular-nums ${error ? "border-destructive" : ""}`}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <Button type="button" className="h-12 rounded-full px-6 text-[15px] font-semibold" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : t("save")}
            </Button>
            {storedValid && <Button type="button" variant="ghost" className="h-12 rounded-full" onClick={() => { setEditing(false); setError(""); }}>{t("cancel")}</Button>}
          </div>
          {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Dentro da etapa Faturamento do checkout: sem cartão nem título próprios (a etapa já tem).
  if (embedded) return <div>{body}</div>;

  return (
    <section className="rounded-[20px] border border-brand-card-border bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary"><FileText className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
        <h3 className="pt-2 text-[16px] font-semibold leading-tight">{t("billingTitle")}</h3>
      </div>
      {body}
    </section>
  );
};

export default BillingTaxIdCard;
