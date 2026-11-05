// =====================================================================================
// Admin > Financeiro > Categorias e Regras.
//   FinanceCategories  categorias de despesas e de entradas: nome, cor, esconder; criar e editar num painel na
//                      página (InlinePanel); apagar só confirma na faixa (os lançamentos ficam sem categoria)
//   FinanceRules       regras das contas (finance_settings): data que conta, % do frete que é custo, imposto estimado,
//                      taxa de cada meio de pagamento ativo, comissões de afiliados e meta do mês
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { EyeOff, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { FilterChips } from "@/components/admin/AdminListKit";
import HelpTip from "@/components/admin/HelpTip";
import { AdminPanel, InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  useDeleteFinanceCategory, useFinanceCategories, useFinanceEntries, useFinanceSettings, usePaymentTypes, useSaveFinanceCategory,
  useSaveFinanceSettings, type FinanceCategory,
} from "@/hooks/useFinance";
import { DEFAULT_FINANCE_SETTINGS, type EntryKind, type FinanceSettings } from "@/lib/finance";
import { paymentMethodLabel } from "@/lib/orderStatusStyles";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n";
import { adminFinanceMessages, type AdminFinanceKey } from "@/i18n/adminFinance";
import { CATEGORY_COLORS, CategoryDot } from "./FinanceParts";
import { categoryLabel } from "./FinanceDashboard";

export function FinanceCategories() {
  const { t } = useMessages(adminFinanceMessages);
  const { toast } = useToast();
  const { data: categories = [], isLoading } = useFinanceCategories();
  const { entries } = useFinanceEntries();
  const save = useSaveFinanceCategory();
  const del = useDeleteFinanceCategory();
  const { ask, confirmSlot } = useInlineConfirm();
  const [editing, setEditing] = useState<(Partial<FinanceCategory> & { kind: EntryKind }) | null>(null);
  const used = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) if (e.categoryId) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + 1);
    return m;
  }, [entries]);

  const submit = async () => {
    if (!editing) return;
    const fallback = editing.code ? t(`cat_${editing.code}` as AdminFinanceKey) : "";
    const name = (editing.name ?? "").trim();
    if (!name && !editing.code) return toast({ title: t("err_category_name"), variant: "destructive" });
    try {
      await save.mutateAsync({ ...editing, name: name && name !== fallback ? name : editing.code ? null : name });
      toast({ title: t("saved") });
      setEditing(null);
    } catch { toast({ title: t("save_error"), variant: "destructive" }); }
  };

  const remove = async (c: FinanceCategory) => {
    const n = used.get(c.id) ?? 0;
    if (!(await ask(t("category_delete_confirm", { name: categoryLabel(c, t) }), { description: n ? t("category_delete_used", { n }) : undefined, confirmLabel: t("delete") }))) return;
    try { await del.mutateAsync(c.id); toast({ title: t("deleted") }); } catch { toast({ title: t("save_error"), variant: "destructive" }); }
  };

  if (isLoading) return <Skeleton className="h-64 w-full rounded-[18px]" />;

  return (
    <div className="space-y-5">
      <InlinePanel open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("category_edit") : t("category_new")} description={t("category_panel_hint")}>
        {editing && (
          <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            {!editing.id && (
              <div className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium">{t("col_type")}</span>
                <FilterChips<EntryKind> label={t("col_type")} value={editing.kind} onChange={(k) => setEditing({ ...editing, kind: k })}
                  options={(["expense", "income"] as EntryKind[]).map((k) => ({ value: k, label: t(`kind_${k}` as AdminFinanceKey) }))} />
              </div>
            )}
            <label className="space-y-1.5">
              <span className="text-sm font-medium">{t("category_name")}</span>
              <Input value={editing.name ?? (editing.code ? t(`cat_${editing.code}` as AdminFinanceKey) : "")} maxLength={60} autoFocus
                onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              {editing.code && <span className="block text-xs text-muted-foreground">{t("category_default_hint")}</span>}
            </label>
            <div className="space-y-1.5">
              <span className="flex items-center gap-1 text-sm font-medium">{t("category_color")}<HelpTip text={t("category_color_help")} label={t("category_color")} className="h-6 w-6" /></span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("category_color")}>
                {CATEGORY_COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={(editing.color ?? "orange") === c} aria-label={t(`color_${c}` as AdminFinanceKey)}
                    onClick={() => setEditing({ ...editing, color: c })}
                    className={cn("grid h-10 w-10 place-items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      (editing.color ?? "orange") === c ? "border-foreground" : "hover:border-foreground/40")}>
                    <CategoryDot color={c} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit" disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}{t("save")}</Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button>
            </div>
          </form>
        )}
      </InlinePanel>
      {confirmSlot}

      <div className="grid gap-5 lg:grid-cols-2">
        {(["expense", "income"] as EntryKind[]).map((kind) => (
          <AdminPanel key={kind} title={t(kind === "expense" ? "cats_expense" : "cats_income")}
            actions={<Button type="button" variant="outline" size="sm" onClick={() => setEditing({ kind, color: "orange" })}><Plus className="h-4 w-4" aria-hidden="true" />{t("category_new")}</Button>}>
            <ul className="divide-y">
              {categories.filter((c) => c.kind === kind).map((c) => (
                <li key={c.id} className={cn("flex items-center gap-3 py-2", !c.is_active && "opacity-60")}>
                  <CategoryDot color={c.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{categoryLabel(c, t)}</span>
                    <span className="text-xs text-muted-foreground">{t("n_entries", { n: used.get(c.id) ?? 0 })}{!c.is_active && ` · ${t("hidden")}`}</span>
                  </span>
                  <span className="inline-flex items-center gap-1" title={t("category_active_help")}>
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <Switch checked={c.is_active} aria-label={t("category_active")} onCheckedChange={(v) => save.mutate({ ...c, is_active: v })} />
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={t("edit")} onClick={() => setEditing(c)}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" aria-label={t("delete")} onClick={() => remove(c)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                </li>
              ))}
            </ul>
          </AdminPanel>
        ))}
      </div>
    </div>
  );
}

const numIn = (v: string) => Number(v.replace(",", "."));

function Row({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)] md:items-center md:gap-6">
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm font-medium">{label}<HelpTip text={help} label={label} className="h-6 w-6" /></p>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function FinanceRules() {
  const { t, locale } = useMessages(adminFinanceMessages);
  const fmt = useAdminFormat();
  const { toast } = useToast();
  const { data, isLoading } = useFinanceSettings();
  const { data: types = [] } = usePaymentTypes();
  const save = useSaveFinanceSettings();
  const [s, setS] = useState<FinanceSettings>(DEFAULT_FINANCE_SETTINGS);
  useEffect(() => { if (data) setS(data); }, [data]);
  const fee = (type: string) => s.paymentFees[type] ?? { percent: 0, fixed: 0 };
  const setFee = (type: string, k: "percent" | "fixed", v: string) =>
    setS((x) => ({ ...x, paymentFees: { ...x.paymentFees, [type]: { ...fee(type), [k]: Number.isFinite(numIn(v)) ? numIn(v) : 0 } } }));
  const methods = useMemo(() => {
    const seen = new Set<string>();
    return types.filter((p) => !seen.has(p.type) && seen.add(p.type));
  }, [types]);

  const submit = async () => {
    try { await save.mutateAsync(s); toast({ title: t("saved") }); } catch { toast({ title: t("save_error"), variant: "destructive" }); }
  };

  if (isLoading) return <Skeleton className="h-96 w-full rounded-[18px]" />;


  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <AdminPanel title={t("rules_counting")}>
        <div className="divide-y">
          <Row label={t("r_date")} help={t("r_date_help")}>
            <FilterChips<"order" | "payment"> label={t("r_date")} value={s.dateBasis} onChange={(v) => setS({ ...s, dateBasis: v })}
              options={[{ value: "order", label: t("r_date_order") }, { value: "payment", label: t("r_date_payment") }]} />
          </Row>
          <Row label={t("r_shipping")} help={t("r_shipping_help")}>
            <div className="flex items-center gap-2"><Input inputMode="decimal" className="w-28" value={String(s.shippingCostPercent)} aria-label={t("r_shipping")}
              onChange={(e) => setS({ ...s, shippingCostPercent: Number.isFinite(numIn(e.target.value)) ? numIn(e.target.value) : 0 })} /><span className="text-sm text-muted-foreground">%</span></div>
          </Row>
          <Row label={t("r_tax")} help={t("r_tax_help")}>
            <div className="flex items-center gap-2"><Input inputMode="decimal" className="w-28" value={String(s.salesTaxPercent)} aria-label={t("r_tax")}
              onChange={(e) => setS({ ...s, salesTaxPercent: Number.isFinite(numIn(e.target.value)) ? numIn(e.target.value) : 0 })} /><span className="text-sm text-muted-foreground">%</span></div>
          </Row>
          <Row label={t("r_affiliates")} help={t("r_affiliates_help")}>
            <Switch checked={s.includeAffiliateCommissions} aria-label={t("r_affiliates")} onCheckedChange={(v) => setS({ ...s, includeAffiliateCommissions: v })} />
          </Row>
          <Row label={t("r_goal")} help={t("r_goal_help")}>
            <div className="flex items-center gap-2"><Input inputMode="decimal" className="w-40" value={s.monthlyGoal == null ? "" : String(s.monthlyGoal)} placeholder={t("r_goal_none")} aria-label={t("r_goal")}
              onChange={(e) => setS({ ...s, monthlyGoal: numIn(e.target.value) > 0 ? numIn(e.target.value) : null })} /><span className="text-sm text-muted-foreground">{fmt.currency}</span></div>
          </Row>
        </div>
      </AdminPanel>

      <AdminPanel title={<span className="inline-flex items-center gap-1">{t("rules_fees")}<HelpTip text={t("rules_fees_help")} label={t("rules_fees")} className="h-6 w-6" /></span>}>
        <p className="mb-3 text-sm text-muted-foreground">{t("rules_fees_help")}</p>
        {!methods.length ? <p className="text-sm text-muted-foreground">{t("no_methods")}</p> : (
          <div className="overflow-x-auto rounded-[14px] border">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">{t("col_method")}</th><th className="px-3 py-2 font-medium">{t("fee_percent")}</th><th className="px-3 py-2 font-medium">{t("fee_fixed", { currency: fmt.currency })}</th></tr>
              </thead>
              <tbody className="divide-y">
                {methods.map((m) => (
                  <tr key={m.type}>
                    <td className="px-3 py-2">
                      <span className="font-medium">{m.name || paymentMethodLabel(m.type, locale)}</span>
                      {!m.is_active && <span className="ml-2 text-xs text-muted-foreground">{t("inactive")}</span>}
                    </td>
                    <td className="px-3 py-2"><Input inputMode="decimal" className="w-24" defaultValue={data?.paymentFees[m.type]?.percent || ""} placeholder="0" aria-label={`${t("fee_percent")} ${m.name}`} onChange={(e) => setFee(m.type, "percent", e.target.value)} /></td>
                    <td className="px-3 py-2"><Input inputMode="decimal" className="w-28" defaultValue={data?.paymentFees[m.type]?.fixed || ""} placeholder="0,00" aria-label={`${t("fee_fixed", { currency: fmt.currency })} ${m.name}`} onChange={(e) => setFee(m.type, "fixed", e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      <Button type="submit" disabled={save.isPending} className="min-h-11">
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}{t("save")}
      </Button>
    </form>
  );
}
