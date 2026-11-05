// =====================================================================================
// Admin > Configurações > Prazos e entrega (recurso delivery_dates em Admin > Recursos da loja). Sem janelas:
//   Regras    prazo padrão, dias de trabalho, hora de corte, fuso, feriados, onde mostrar, com exemplo ao vivo
//   A enviar  pedidos ainda não enviados pela data "enviar até" (atrasados, hoje, próximos 7 dias); abre o pedido
// Contas em src/lib/deliveryDates.ts (iguais no create-order, que grava as datas no pedido).
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarCheck, CalendarClock, Loader2, Plus, Save, Sparkles, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import AdminHelp from "./AdminHelp";
import { AdminStatCard } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { adminDeliveryDatesMessages } from "@/i18n/adminDeliveryDates";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useCountry } from "@/lib/countries";
import { useDeliveryRules, useSaveDeliverySettings } from "@/hooks/useDeliveryDates";
import { orderStatusLabel } from "@/lib/orderStatusStyles";
import {
  addDays, estimateDelivery, formatDay, isLate, localNow, normalizeDeliverySettings, timezoneFor, TZ_BY_COUNTRY, type DeliverySettings,
} from "@/lib/deliveryDates";
import { cn } from "@/lib/utils";

const sb = supabase as any;
const TIMEZONES = [...new Set(Object.values(TZ_BY_COUNTRY).concat(["Atlantic/Madeira", "Atlantic/Azores", "Atlantic/Canary", "America/Manaus", "America/Recife", "UTC"]))].sort();
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export default function AdminDeliveryDates() {
  const { t } = useMessages(adminDeliveryDatesMessages);
  return (
    <div className="space-y-5">
      <AdminHelp id="delivery-dates" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <ShipQueue />
      <RulesForm />
    </div>
  );
}

/* ---------- Regras ---------- */

function RulesForm() {
  const { t } = useMessages(adminDeliveryDatesMessages);
  const { locale } = useAdminFormat();
  const country = useCountry();
  const { settings, raw, isLoading } = useDeliveryRules();
  const save = useSaveDeliverySettings();
  const [d, setD] = useState<DeliverySettings>(settings);
  const [holiday, setHoliday] = useState("");
  useEffect(() => { if (!isLoading) setD(settings); }, [isLoading, settings]);
  const set = (patch: Partial<DeliverySettings>) => setD((cur) => ({ ...cur, ...patch }));
  const live = normalizeDeliverySettings(d);

  const preview = useMemo(() => {
    const e = estimateDelivery(new Date(), { min: live.default_min, max: live.default_max }, { min: 3, max: 7 }, live, country?.code);
    const long = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
    const f = (x: string | null) => (x ? long.format(new Date(`${x}T00:00:00Z`)) : "");
    return t("preview", { start: f(e.start), ship: f(e.ship_by), tmin: 3, tmax: 7, from: f(e.deliver_from), to: f(e.deliver_to) });
  }, [live, country?.code, locale, t]);

  const toggleDay = (n: number) => {
    const has = d.work_days.includes(n);
    if (has && d.work_days.length === 1) return;
    set({ work_days: has ? d.work_days.filter((x) => x !== n) : [...d.work_days, n].sort() });
  };
  const addHoliday = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday)) return;
    set({ holidays: [...new Set([...d.holidays, holiday])].sort() });
    setHoliday("");
  };
  const submit = async () => {
    try {
      await save.mutateAsync({ next: live, raw });
      toast.success(t("saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  const num = (k: "default_min" | "default_max" | "cutoff_hour", label: string, hint: string, max: number) => (
    <div className="space-y-1.5">
      <Label htmlFor={`dd-${k}`}>{label}</Label>
      <Input id={`dd-${k}`} type="number" inputMode="numeric" min={0} max={max} value={String(d[k])}
        onChange={(e) => set({ [k]: Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))) } as Partial<DeliverySettings>)} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
  const toggle = (k: "show_on_product" | "show_in_checkout", label: string, hint: string) => (
    <label className="flex items-start justify-between gap-4 rounded-xl border p-3.5">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={d[k]} onCheckedChange={(v) => set({ [k]: v } as Partial<DeliverySettings>)} />
    </label>
  );

  if (isLoading) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;

  return (
    <section className="space-y-5 rounded-[18px] border bg-card p-4 sm:p-5">
      <h3 className="font-semibold">{t("rules_title")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {num("default_min", t("default_min"), t("default_hint"), 120)}
        {num("default_max", t("default_max"), t("default_hint"), 120)}
      </div>

      <div className="space-y-2">
        <Label>{t("work_days")}</Label>
        <div className="flex flex-wrap gap-2">
          {WEEK.map((n) => {
            const on = d.work_days.includes(n);
            return (
              <button key={n} type="button" aria-pressed={on} onClick={() => toggleDay(n)}
                className={cn("min-h-10 min-w-[3.25rem] rounded-xl border px-3 text-sm font-semibold transition-colors duration-150",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
                {t(`wd_${n}` as "wd_0")}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t("work_days_hint")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {num("cutoff_hour", t("cutoff"), t("cutoff_hint"), 24)}
        <div className="space-y-1.5">
          <Label htmlFor="dd-tz">{t("timezone")}</Label>
          <Select value={d.timezone || "auto"} onValueChange={(v) => set({ timezone: v === "auto" ? "" : v })}>
            <SelectTrigger id="dd-tz"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t("timezone_auto")}</SelectItem>
              {TIMEZONES.map((z) => <SelectItem key={z} value={z}>{z.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("timezone_hint")}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dd-holiday">{t("holidays")}</Label>
        <div className="flex gap-2">
          <Input id="dd-holiday" type="date" value={holiday} onChange={(e) => setHoliday(e.target.value)} className="max-w-[200px]" />
          <Button type="button" variant="outline" onClick={addHoliday} disabled={!holiday}><Plus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("holiday_add")}</Button>
        </div>
        {d.holidays.length === 0 ? <p className="text-xs text-muted-foreground">{t("holidays_empty")}</p> : (
          <ul className="flex flex-wrap gap-2">
            {d.holidays.map((h) => (
              <li key={h} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm">
                {formatDay(h, locale)} {h.slice(0, 4)}
                <button type="button" aria-label={t("holiday_remove", { date: h })} onClick={() => set({ holidays: d.holidays.filter((x) => x !== h) })}
                  className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t("holidays_hint")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {toggle("show_on_product", t("show_product"), t("show_product_hint"))}
        {toggle("show_in_checkout", t("show_checkout"), t("show_checkout_hint"))}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-accent p-4 text-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
        <div>
          <p className="font-semibold">{t("preview_title")}</p>
          <p className="text-muted-foreground">{preview}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}{t("save")}
        </Button>
      </div>
    </section>
  );
}

/* ---------- A enviar ---------- */

type QueueRow = { id: string; status: string | null; estimated_ship_by: string; total: number | null; manual_customer_name: string | null; shipping_address: { recipient_name?: string; country?: string } | null };

function ShipQueue() {
  const { t } = useMessages(adminDeliveryDatesMessages);
  const { locale, money } = useAdminFormat();
  const { settings } = useDeliveryRules();
  const country = useCountry();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-ship-queue"],
    staleTime: 60_000,
    queryFn: async (): Promise<QueueRow[]> => {
      const { data, error } = await sb.from("orders")
        .select("id,status,estimated_ship_by,total,manual_customer_name,shipping_address")
        .not("estimated_ship_by", "is", null)
        .not("status", "in", "(shipped,delivered,cancelled,refunded)")
        .order("estimated_ship_by", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const today = localNow(new Date(), timezoneFor(settings, country?.code)).date;
  const week = addDays(today, 7);
  const late = rows.filter((r) => isLate(r.estimated_ship_by, r.status, today));
  const dueToday = rows.filter((r) => r.estimated_ship_by === today);
  const soon = rows.filter((r) => r.estimated_ship_by > today && r.estimated_ship_by <= week);

  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
      <div>
        <h3 className="font-semibold">{t("queue_title")}</h3>
        <p className="text-sm text-muted-foreground">{t("queue_hint")}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <AdminStatCard icon={AlertTriangle} label={t("stat_late")} value={late.length} tone={late.length ? "danger" : "default"} />
        <AdminStatCard icon={Truck} label={t("stat_today")} value={dueToday.length} tone={dueToday.length ? "warning" : "default"} />
        <AdminStatCard icon={CalendarClock} label={t("stat_week")} value={soon.length} />
      </div>
      {isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
        : rows.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarCheck className="h-4 w-4" strokeWidth={1.8} />{t("queue_empty")}</p> : (
        <ul className="divide-y">
          {rows.slice(0, 50).map((r) => {
            const isL = isLate(r.estimated_ship_by, r.status, today);
            const isT = r.estimated_ship_by === today;
            const name = r.shipping_address?.recipient_name || r.manual_customer_name || "";
            return (
              <li key={r.id}>
                <Link to={adminHref.order(r.id)} className="flex items-center justify-between gap-3 py-3 hover:bg-muted/30 sm:px-2 rounded-lg">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t("order", { code: r.id.slice(0, 8).toUpperCase() })}{name ? ` · ${name}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{orderStatusLabel(r.status, locale)} · {money(r.total)}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                    isL ? "bg-destructive/10 text-destructive" : isT ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground")}>
                    {isL ? `${t("late")} · ${formatDay(r.estimated_ship_by, locale)}` : isT ? t("today") : t("ship_by", { date: formatDay(r.estimated_ship_by, locale) })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
