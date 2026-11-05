// =====================================================================================
// Admin > Catálogo > Códigos do produto: quais códigos (SKU, interno, da marca, GTIN) o cliente vê e onde
// (store_settings.product_codes, src/lib/productCodes.ts). Os códigos de cada produto ficam na aba Dados do produto.
// Uma escolha por código e uma prévia ao lado. Sem janelas.
// =====================================================================================
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, ShoppingBag, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import AdminHelp from "./AdminHelp";
import HelpTip from "./HelpTip";
import { useProductCodesSettings, useSaveProductCodesSettings } from "@/hooks/useOfferSettings";
import { useMessages } from "@/i18n";
import { adminProductCodesMessages, type AdminProductCodesKey } from "@/i18n/adminProductCodes";
import { codesFor, DEFAULT_PRODUCT_CODES, PRODUCT_CODES, type ProductCodePlace, type ProductCodesSettings } from "@/lib/productCodes";
import { cn } from "@/lib/utils";

type T = (k: AdminProductCodesKey, v?: Record<string, string | number>) => string;
const PLACES: ProductCodePlace[] = ["top", "specs", "both", "off"];

export default function AdminProductCodes() {
  const { t: tr } = useMessages(adminProductCodesMessages);
  const t = tr as T;
  const { data: saved, isLoading } = useProductCodesSettings();
  const save = useSaveProductCodesSettings();
  const [form, setForm] = useState<ProductCodesSettings>(DEFAULT_PRODUCT_CODES);
  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  const dirty = !!saved && PRODUCT_CODES.some((k) => saved[k] !== form[k]);
  const submit = () => save.mutate(form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) });

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>;

  return (
    <div className="space-y-5">
      <AdminHelp id="product-codes" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {PRODUCT_CODES.map((k) => (
            <fieldset key={k} className="rounded-[18px] border bg-card p-5">
              <legend className="sr-only">{t(`kind_${k}` as AdminProductCodesKey)}</legend>
              <p className="flex items-center text-base font-semibold" aria-hidden="true">
                {t(`kind_${k}` as AdminProductCodesKey)}<HelpTip label={t("help")} text={t(`kind_${k}_d` as AdminProductCodesKey)} />
              </p>
              <p className="text-xs text-muted-foreground">{t(`kind_${k}_d` as AdminProductCodesKey)}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {PLACES.map((p) => (
                  <label key={p} className={cn("flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 transition-colors duration-150",
                    form[k] === p ? "border-primary bg-accent" : "hover:border-foreground/30")}>
                    <input type="radio" name={`code-${k}`} value={p} checked={form[k] === p} onChange={() => setForm((f) => ({ ...f, [k]: p }))}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{t(`place_${p}` as AdminProductCodesKey)}</span>
                      <span className="block text-xs text-muted-foreground">{t(`place_${p}_d` as AdminProductCodesKey)}</span>
                    </span>
                  </label>
                ))}
              </div>
              {k === "internal" && form.internal !== "off" && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("internal_note")}</p>
              )}
            </fieldset>
          ))}
          <div className="flex flex-wrap justify-end gap-2">
            {dirty && <Button variant="ghost" onClick={() => saved && setForm(saved)}><Undo2 className="mr-1.5 h-4 w-4" />{t("undo")}</Button>}
            <Button onClick={submit} disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
            </Button>
          </div>
        </div>
        <aside className="xl:sticky xl:top-24 xl:self-start" aria-label={t("preview")}>
          <Preview s={form} t={t} />
        </aside>
      </div>
    </div>
  );
}

function Preview({ s, t }: { s: ProductCodesSettings; t: T }) {
  const values = { sku: t("pv_sample_sku"), internal: t("pv_sample_internal"), mpn: t("pv_sample_mpn"), gtin: t("pv_sample_gtin") };
  const label = (k: string) => t(`kind_${k}` as AdminProductCodesKey);
  const top = codesFor(values, s, "top");
  const specs = codesFor(values, s, "specs");
  return (
    <div className="space-y-4 rounded-[18px] border bg-background p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("preview")}</p>
      <div className="rounded-[16px] border bg-white p-4">
        <span className="flex min-h-[40px] items-center justify-center gap-2 rounded-[12px] bg-primary text-[13px] font-semibold text-primary-foreground">
          <ShoppingBag className="h-4 w-4" />{t("pv_buy")}
        </span>
        {top.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-brand-ink-soft">
            {top.map((c) => <span key={c.kind}>{label(c.kind)}: <span className="font-mono">{c.value}</span></span>)}
          </p>
        )}
      </div>
      <div className="rounded-[16px] border bg-white p-4">
        <p className="text-[13px] font-semibold">{t("pv_specs")}</p>
        <dl className="mt-2 divide-y text-[12px]">
          {specs.map((c) => (
            <div key={c.kind} className="flex justify-between gap-3 py-1.5"><dt className="text-muted-foreground">{label(c.kind)}</dt><dd className="font-mono">{c.value}</dd></div>
          ))}
          <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted-foreground">{t("pv_material")}</dt><dd>{t("pv_material_v")}</dd></div>
        </dl>
      </div>
      {!top.length && !specs.length && <p className="text-xs text-muted-foreground">{t("pv_none")}</p>}
    </div>
  );
}
