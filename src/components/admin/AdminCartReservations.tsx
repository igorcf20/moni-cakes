// =====================================================================================
// Admin > Estoque > Reserva no carrinho (recurso cart_reservations): regras (store_settings.cart_reservations) e as
// reservas a valer agora, com Liberar. A reserva em si é feita pelo banco (cart_stock_check) e conferida no pedido.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Clock, Loader2, Package, Save, Timer, UserRound, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import AdminHelp from "./AdminHelp";
import { AdminStatCard } from "./AdminListKit";
import { InlineConfirm } from "./shell/AdminPageParts";
import { adminHref } from "./shell/adminSections";
import { useMessages } from "@/i18n";
import { adminCartReservationsMessages } from "@/i18n/adminCartReservations";
import {
  useActiveCartReservations, useCartReservationSettings, useReleaseCartReservation, useSaveCartReservationSettings,
} from "@/hooks/useCartReservations";
import { DEFAULT_CART_RESERVATIONS, RESERVATION_MINUTES_MAX, normalizeCartReservations, type CartReservationSettings } from "@/lib/cartReservations";

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  return now;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function AdminCartReservations() {
  const { t, locale } = useMessages(adminCartReservationsMessages);
  const { data: settings } = useCartReservationSettings();
  const saveSettings = useSaveCartReservationSettings();
  const list = useActiveCartReservations();
  const release = useReleaseCartReservation();
  const [form, setForm] = useState<CartReservationSettings>(DEFAULT_CART_RESERVATIONS);
  const [minutesText, setMinutesText] = useState(String(DEFAULT_CART_RESERVATIONS.minutes));
  const now = useNow();
  useEffect(() => { if (settings) { setForm(settings); setMinutesText(String(settings.minutes)); } }, [settings]);

  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const rows = (list.data ?? []).filter((r) => Date.parse(r.expires_at) > now);
  const units = rows.reduce((s, r) => s + r.quantity, 0);
  const dirty = !!settings && JSON.stringify(settings) !== JSON.stringify(form);
  const set = <K extends keyof CartReservationSettings>(k: K, v: CartReservationSettings[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => saveSettings.mutate(normalizeCartReservations(form), {
    onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")),
  });

  return (
    <div className="space-y-6">
      <AdminHelp id="cart-reservations" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <AdminStatCard icon={Timer} label={t("st_active")} value={nf.format(rows.length)} />
        <AdminStatCard icon={Package} label={t("st_units")} value={nf.format(units)} />
        <AdminStatCard icon={Clock} label={t("st_minutes")} value={t("minutes_value", { n: settings?.minutes ?? form.minutes })} />
      </div>

      <section className="space-y-4 rounded-[18px] border bg-card p-5">
        <h2 className="text-base font-semibold">{t("rules")}</h2>
        <div className="grid gap-1.5 sm:max-w-xs">
          <label htmlFor="cr-minutes" className="text-sm font-semibold">{t("minutes")}</label>
          <Input
            id="cr-minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={RESERVATION_MINUTES_MAX}
            value={minutesText}
            onChange={(e) => {
              setMinutesText(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 1) set("minutes", Math.min(RESERVATION_MINUTES_MAX, Math.floor(n)));
            }}
            onBlur={() => setMinutesText(String(form.minutes))}
          />
          <p className="text-xs text-muted-foreground">{t("minutes_hint")}</p>
        </div>
        <div className="divide-y">
          <Toggle label={t("notice")} hint={t("notice_hint")} checked={form.notice} onChange={(v) => set("notice", v)} />
          <Toggle label={t("restart")} hint={t("restart_hint")} checked={form.restart_on_change} onChange={(v) => set("restart_on_change", v)} />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={!dirty || saveSettings.isPending}>
            {saveSettings.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t("list_title")}</h2>
        {list.isLoading
          ? <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
          : list.isError
            ? <p className="rounded-[18px] border border-dashed p-6 text-center text-sm text-destructive">{t("load_error")}</p>
            : rows.length === 0
              ? <p className="rounded-[18px] border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
              : (
                <ul className="divide-y overflow-hidden rounded-[18px] border bg-card">
                  {rows.map((r) => (
                    <li key={`${r.holder}|${r.slot}`} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <Link to={adminHref.product(r.product_id)} className="block truncate text-sm font-semibold hover:text-brand-orange-text">
                          {r.product_name || t("product_fallback")}
                        </Link>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.is_guest ? t("guest") : r.customer_email}
                          {" · "}
                          {r.quantity < r.requested ? t("units_of", { n: r.quantity, total: r.requested }) : t("units", { n: r.quantity })}
                          {" · "}
                          <span className="tabular-nums">{t("ends_in", { time: clock(Date.parse(r.expires_at) - now) })}</span>
                        </span>
                      </span>
                      <InlineConfirm
                        label={t("release")}
                        icon={Unlock}
                        title={t("release_title")}
                        description={t("release_text")}
                        confirmLabel={t("release")}
                        busy={release.isPending}
                        onConfirm={() => release.mutateAsync({ holder: r.holder, slot: r.slot })
                          .then(() => { toast.success(t("released")); }, () => { toast.error(t("release_error")); })}
                      />
                    </li>
                  ))}
                </ul>
              )}
      </section>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}
