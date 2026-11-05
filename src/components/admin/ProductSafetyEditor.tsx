// =====================================================================================
// Aba Segurança da página do produto no Admin (/admin/produto/<id>?tab=safety): dados de segurança só deste produto
// (products.safety_info, regulamento GPSR). Campo vazio = vale o padrão da loja (Admin > Preços e segurança), que
// aparece como sugestão no próprio campo. Grava direto na base, com o seu botão.
// =====================================================================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PartyFields } from "./AdminProductCompliance";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { adminComplianceMessages } from "@/i18n/adminCompliance";
import { useProductCompliance } from "@/hooks/useProductCompliance";
import { EMPTY_PARTY, normalizeSafetyInfo, type SafetyParty } from "@/lib/productCompliance";

type Form = { manufacturer: SafetyParty; responsible: SafetyParty; warnings: string; model: string };

const toForm = (v: unknown): Form => {
  const s = normalizeSafetyInfo(v);
  return {
    manufacturer: { ...EMPTY_PARTY, ...s.manufacturer },
    responsible: { ...EMPTY_PARTY, ...s.responsible },
    warnings: s.warnings ?? "",
    model: s.model ?? "",
  };
};

export default function ProductSafetyEditor({ productId }: { productId: string }) {
  const { t } = useMessages(adminComplianceMessages);
  const qc = useQueryClient();
  const { data: store } = useProductCompliance();
  const { data: saved, isLoading } = useQuery({
    queryKey: ["admin-product-safety", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("products").select("safety_info").eq("id", productId).maybeSingle();
      if (error) throw error;
      return toForm(data?.safety_info);
    },
  });
  const [form, setForm] = useState<Form>(() => toForm(null));
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && JSON.stringify(form) !== JSON.stringify(saved);

  const save = useMutation({
    mutationFn: async () => {
      const value = normalizeSafetyInfo(form);
      const { error } = await (supabase as any).from("products").update({ safety_info: value }).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("saved"));
      void qc.invalidateQueries({ queryKey: ["admin-product-safety", productId] });
    },
    onError: () => toast.error(t("save_error")),
  });

  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;

  const storeHas = (p?: SafetyParty) => !!p && !!(p.name || p.address || p.contact);
  const storeNote = (p?: SafetyParty) => (
    <p className="text-xs text-muted-foreground">
      {storeHas(p) ? t("p_uses_store", { value: [p!.name, p!.address, p!.contact].filter(Boolean).join(", ") }) : t("p_store_empty")}
    </p>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{t("p_hint")}</p>
        <Link to={adminHref.section("compliance")} className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-orange-text hover:underline">
          {t("p_open_rules")}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold">{t("sec_manufacturer")}</h3>
        <PartyFields prefix="ps-m" value={form.manufacturer} onChange={(v) => setForm((f) => ({ ...f, manufacturer: v }))} t={t} placeholder={store?.manufacturer} />
        {!storeHas(form.manufacturer) && storeNote(store?.manufacturer)}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-bold">{t("sec_responsible")}</h3>
        <PartyFields prefix="ps-r" value={form.responsible} onChange={(v) => setForm((f) => ({ ...f, responsible: v }))} t={t} placeholder={store?.responsible} />
        {!storeHas(form.responsible) && storeNote(store?.responsible)}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ps-model">{t("p_model")}</Label>
        <Input id="ps-model" value={form.model} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
        <p className="text-xs text-muted-foreground">{t("p_model_hint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ps-warnings">{t("p_warnings")}</Label>
        <Textarea id="ps-warnings" rows={4} value={form.warnings} maxLength={4000} placeholder={store?.warnings || t("warnings_ph")} onChange={(e) => setForm((f) => ({ ...f, warnings: e.target.value }))} />
        <p className="text-xs text-muted-foreground">{t("p_warnings_hint")}</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
          {save.isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
