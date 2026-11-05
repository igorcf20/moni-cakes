// =====================================================================================
// Aba Especificações da página do produto no Admin (/admin/produto/<id>?tab=specs): marca os valores das
// características (Admin > Especificações) que este produto tem. Grava direto na base, com o seu botão
// (admin_set_product_specs troca todos os valores do produto de uma vez).
// =====================================================================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { adminSpecsMessages } from "@/i18n/adminSpecs";
import { useProductSpecOptionIds, useSetProductSpecs, useSpecAttributes } from "@/hooks/useProductSpecs";
import { specText } from "@/lib/productSpecs";
import { cn } from "@/lib/utils";

export default function ProductSpecsEditor({ productId }: { productId: string }) {
  const { t, locale } = useMessages(adminSpecsMessages);
  const { data: attrs = [], isLoading } = useSpecAttributes();
  const { data: saved, isLoading: loadingSaved } = useProductSpecOptionIds(productId);
  const setSpecs = useSetProductSpecs(productId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => { if (saved) setPicked(new Set(saved)); }, [saved]);

  if (isLoading || loadingSaved) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!attrs.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("p_none")}</p>
        <Button variant="outline" size="sm" asChild><Link to={adminHref.section("specs")}><ExternalLink className="mr-1.5 h-4 w-4" />{t("p_go")}</Link></Button>
      </div>
    );
  }

  const toggle = (id: string) => setPicked((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const submit = async () => {
    try {
      await setSpecs.mutateAsync([...picked]);
      toast.success(t("p_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("p_hint")}</p>
      {attrs.map((a) => {
        const n = a.options.filter((o) => picked.has(o.id)).length;
        return (
          <fieldset key={a.id} className="space-y-2">
            <legend className="flex w-full items-center justify-between gap-3 text-sm font-semibold">
              <span>{specText(a.name_i18n, locale, a.slug)}{a.unit ? <span className="font-normal text-muted-foreground"> ({a.unit})</span> : null}</span>
              {n > 0 && <span className="text-xs font-normal text-muted-foreground">{t("p_selected_n", { n })}</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {a.options.map((o) => {
                const on = picked.has(o.id);
                return (
                  <button
                    key={o.id} type="button" aria-pressed={on} onClick={() => toggle(o.id)}
                    className={cn("inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm transition-colors duration-150",
                      on ? "border-primary bg-primary/10 font-semibold text-foreground" : "bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground")}
                  >
                    {on && <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.2} aria-hidden="true" />}
                    {o.color && <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: o.color }} aria-hidden="true" />}
                    {specText(o.label_i18n, locale, o.slug)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={setSpecs.isPending}>
          {setSpecs.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("p_save")}
        </Button>
      </div>
    </div>
  );
}
