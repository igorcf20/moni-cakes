// =====================================================================================
// Aba Pré-venda da página do produto no Admin (/admin/produto/<id>?tab=preorder; recurso preorders): liga a
// pré-venda, data de lançamento (a pré-venda acaba nesse dia), limite de unidades e mensagem por idioma.
// Grava em product_preorders com o seu botão; remover pede confirmação na página.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminPreordersMessages } from "@/i18n/adminPreorders";
import { useAdminPreorders, useAdminProductPreorder, useDeleteProductPreorder, useSaveProductPreorder } from "@/hooks/usePreorders";
import { NOTE_MAX, normalizeProductPreorder, preorderErrors, todayIso, type I18nText } from "@/lib/preorders";

const LOCALES = [["pt-BR", "lang_pt_BR"], ["pt-PT", "lang_pt_PT"], ["en", "lang_en"], ["es", "lang_es"]] as const;

type Form = { on: boolean; release: string; limit: string; note: I18nText };
const EMPTY: Form = { on: true, release: "", limit: "", note: {} };

export default function ProductPreorderEditor({ productId }: { productId: string }) {
  const { t } = useMessages(adminPreordersMessages);
  const { data: saved, isLoading } = useAdminProductPreorder(productId);
  const { data: rows } = useAdminPreorders();
  const save = useSaveProductPreorder();
  const remove = useDeleteProductPreorder();
  const { ask, confirmSlot } = useInlineConfirm();
  const [f, setF] = useState<Form>(EMPTY);
  useEffect(() => {
    if (saved) setF({ on: saved.is_active, release: saved.release_date ?? "", limit: saved.max_units ? String(saved.max_units) : "", note: saved.note_i18n });
  }, [saved]);
  const stats = useMemo(() => rows?.find((r) => r.product_id === productId) ?? null, [rows, productId]);

  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;

  const value = normalizeProductPreorder({
    product_id: productId, is_active: f.on, release_date: f.release || null, max_units: f.limit.trim() || null, note_i18n: f.note,
  });
  const errors = preorderErrors(value);
  const submit = async () => {
    if (errors.length) return;
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
      setF(EMPTY);
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
          <Label htmlFor="po-on" className="text-sm font-semibold">{t("p_on")}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("p_on_d")}</p>
        </div>
        <Switch id="po-on" checked={f.on} onCheckedChange={(v) => setF({ ...f, on: v })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="po-release">{t("p_release")}</Label>
          <Input id="po-release" type="date" min={todayIso()} value={f.release} onChange={(e) => setF({ ...f, release: e.target.value })}
            aria-invalid={errors.includes("release_past") || undefined} aria-describedby="po-release-hint" />
          <p id="po-release-hint" className={errors.includes("release_past") ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
            {errors.includes("release_past") ? t("p_release_past") : t("p_release_hint")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-limit">{t("p_limit")}</Label>
          <Input id="po-limit" inputMode="numeric" className="max-w-[200px]" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value.replace(/\D/g, "") })} />
          <p className="text-xs text-muted-foreground">{t("p_limit_hint")}</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("p_note")}</legend>
        <p className="text-xs text-muted-foreground">{t("p_note_hint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {LOCALES.map(([loc, label]) => (
            <div key={loc} className="space-y-1">
              <Label htmlFor={`po-note-${loc}`} className="text-xs text-muted-foreground">{t(label)}</Label>
              <Input id={`po-note-${loc}`} maxLength={NOTE_MAX} value={f.note[loc] ?? ""} onChange={(e) => setF({ ...f, note: { ...f.note, [loc]: e.target.value } })} />
            </div>
          ))}
        </div>
      </fieldset>

      {stats && stats.sold > 0 && <p className="text-sm font-medium">{t("p_sold", { sold: stats.sold, orders: stats.orders })}</p>}
      <p className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />{t("p_stock")}</p>
      {confirmSlot}
      <div className="flex flex-wrap justify-end gap-2">
        {saved && <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void drop()} disabled={remove.isPending}><Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("p_remove")}</Button>}
        <Button onClick={() => void submit()} disabled={save.isPending || errors.length > 0}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("p_save")}
        </Button>
      </div>
    </div>
  );
}
