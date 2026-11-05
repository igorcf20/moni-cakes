// =====================================================================================
// Aba Assinatura da página do produto no Admin (/admin/produto/<id>?tab=subscription; recurso subscriptions):
// planos do produto (a cada N semanas ou meses, desconto, mínimo de pedidos, ativo). Cada plano grava com o seu
// botão em product_subscription_plans; apagar pede confirmação na própria página (useInlineConfirm).
// =====================================================================================
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminSubscriptionsMessages } from "@/i18n/adminSubscriptions";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useAdminPlans, useDeletePlan, useSavePlan } from "@/hooks/useSubscriptions";
import { MAX_DISCOUNT, normalizePlan, subscriptionUnit, type IntervalUnit, type SubscriptionPlan } from "@/lib/subscriptions";

type Draft = { key: string; id?: string; unit: IntervalUnit; count: string; pct: string; min: string; active: boolean };
const toDraft = (p: SubscriptionPlan): Draft => ({ key: p.id, id: p.id, unit: p.interval_unit, count: String(p.interval_count), pct: String(p.discount_percent), min: String(p.min_cycles), active: p.is_active });
const newDraft = (): Draft => ({ key: `new-${Math.random().toString(36).slice(2)}`, unit: "month", count: "1", pct: "10", min: "0", active: true });

export default function ProductSubscriptionPlans({ productId, basePrice }: { productId: string; basePrice: number }) {
  const { t } = useMessages(adminSubscriptionsMessages);
  const { data: plans, isLoading } = useAdminPlans(productId);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  useEffect(() => { if (plans) setDrafts(plans.map(toDraft)); }, [plans]);

  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("plans_hint")}</p>
      {drafts.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("plans_empty")}</p>}
      {drafts.map((d, i) => (
        <PlanRow
          key={d.key}
          d={d}
          order={i}
          productId={productId}
          basePrice={basePrice}
          onChange={(patch) => setDrafts((cur) => cur.map((x) => (x.key === d.key ? { ...x, ...patch } : x)))}
          onRemoveDraft={() => setDrafts((cur) => cur.filter((x) => x.key !== d.key))}
        />
      ))}
      <Button variant="outline" onClick={() => setDrafts((cur) => [...cur, newDraft()])}><Plus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("plan_add")}</Button>
    </div>
  );
}

function PlanRow({ d, order, productId, basePrice, onChange, onRemoveDraft }: {
  d: Draft; order: number; productId: string; basePrice: number; onChange: (p: Partial<Draft>) => void; onRemoveDraft: () => void;
}) {
  const { t } = useMessages(adminSubscriptionsMessages);
  const { money } = useAdminFormat();
  const save = useSavePlan();
  const del = useDeletePlan();
  const { ask, confirmSlot } = useInlineConfirm();
  const plan = normalizePlan({ id: d.id, product_id: productId, interval_unit: d.unit, interval_count: d.count, discount_percent: d.pct.replace(",", "."), min_cycles: d.min, is_active: d.active, display_order: order });

  const submit = async () => {
    try {
      await save.mutateAsync({ ...plan, id: d.id });
      toast.success(t("plan_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const remove = async () => {
    if (!d.id) { onRemoveDraft(); return; }
    if (!(await ask(t("plan_confirm_delete"), { confirmLabel: t("plan_delete") }))) return;
    try {
      await del.mutateAsync({ id: d.id, productId });
      toast.success(t("plan_deleted"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const ids = `plan-${d.key}`;

  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-4">
      {!d.id && <p className="text-xs font-semibold uppercase tracking-wide text-brand-orange-text">{t("plan_new")}</p>}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-count`}>{t("plan_every")}</Label>
          <div className="flex gap-2">
            <Input id={`${ids}-count`} inputMode="numeric" className="w-20" value={d.count} onChange={(e) => onChange({ count: e.target.value.replace(/\D/g, "") })} />
            <Select value={d.unit} onValueChange={(v) => onChange({ unit: v as IntervalUnit })}>
              <SelectTrigger aria-label={t("plan_every")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">{t("unit_week")}</SelectItem>
                <SelectItem value="month">{t("unit_month")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-pct`}>{t("plan_discount")}</Label>
          <Input id={`${ids}-pct`} inputMode="decimal" value={d.pct} max={MAX_DISCOUNT} onChange={(e) => onChange({ pct: e.target.value.replace(/[^\d.,]/g, "") })} />
          <p className="text-xs text-muted-foreground">{t("plan_discount_hint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-min`}>{t("plan_min")}</Label>
          <Input id={`${ids}-min`} inputMode="numeric" value={d.min} onChange={(e) => onChange({ min: e.target.value.replace(/\D/g, "") })} />
          <p className="text-xs text-muted-foreground">{t("plan_min_hint")}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={d.active} onCheckedChange={(v) => onChange({ active: v })} aria-label={t("plan_active")} />{t("plan_active")}
        </label>
        {basePrice > 0 && <p className="text-sm text-muted-foreground">{t("plan_preview", { price: money(subscriptionUnit(basePrice, plan.discount_percent)) })}</p>}
      </div>
      {confirmSlot}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("plan_delete")}</Button>
        <Button onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("plan_save")}
        </Button>
      </div>
    </section>
  );
}
