// =====================================================================================
// Admin > Pontos (recurso reward_points em Admin > Recursos da loja). Sem janelas:
//   Clientes  (aba padrão) números (clientes com saldo, pontos em aberto e o valor, ganhos e usados em 30 dias),
//             filtros, busca e a lista; clicar abre a página do cliente
//   Regras    (aba=regras) pontos por unidade de moeda, valor do ponto, mínimo, máximo do pedido, quando entram,
//             validade e bónus de boas-vindas, com exemplo ao vivo
//   cliente   (ver=cliente&id=<user_id>) saldo, valor, a vencer, ajuste com motivo e extrato com os pedidos
// Regras e saldo no servidor (migration 20261006200000_reward_points.sql); contas em src/lib/rewardPoints.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, Coins, Loader2, Save, Search, Sparkles, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { adminRewardPointsMessages } from "@/i18n/adminRewardPoints";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useCurrency } from "@/hooks/use-currency";
import {
  useAdjustRewardPoints, useAdminRewardCustomers, useAdminRewardOf, useRecentRewardEntries, useRewardHistory, useRewardSettings,
  useSaveRewardSettings,
} from "@/hooks/useRewardPoints";
import { normalizeRewardSettings, pointsEarned, pointsValue, type RewardSettings } from "@/lib/rewardPoints";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmtN = (n: number) => new Intl.NumberFormat().format(n);
type Filter = "all" | "balance" | "zero";

export default function AdminRewardPoints() {
  const { t } = useMessages(adminRewardPointsMessages);
  const page = useAdminPage();
  if (page.view === "cliente" && page.id) return <CustomerPoints userId={page.id} onBack={page.close} />;
  const tab = page.tab === "regras" ? "regras" : "clientes";
  return (
    <div className="space-y-5">
      <AdminHelp id="reward-points" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <div role="tablist" className="inline-flex rounded-xl border bg-card p-1">
        {(["clientes", "regras"] as const).map((v) => (
          <button
            key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => page.setTab(v)}
            className={cn("min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors duration-150", tab === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {v === "clientes" ? t("tab_customers") : t("tab_rules")}
          </button>
        ))}
      </div>
      {tab === "regras" ? <RulesForm /> : <CustomerList onOpen={(id) => page.open("cliente", id)} />}
    </div>
  );
}

/* ---------- Clientes ---------- */

function CustomerList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminRewardPointsMessages);
  const { money, relative } = useAdminFormat();
  const { data: settings } = useRewardSettings();
  const { data: rows = [], isLoading, error } = useAdminRewardCustomers();
  const { data: recent = [] } = useRecentRewardEntries(30);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const s = settings ?? normalizeRewardSettings(null);

  const withBalance = rows.filter((r) => r.balance > 0);
  const open = withBalance.reduce((sum, r) => sum + r.balance, 0);
  const earned = recent.filter((e) => e.kind === "earn" || e.kind === "signup").reduce((sum, e) => sum + e.points, 0);
  const redeemed = Math.abs(recent.filter((e) => e.kind === "redeem").reduce((sum, e) => sum + e.points, 0));

  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    return rows.filter((r) => (filter === "all" || (filter === "balance" ? r.balance > 0 : r.balance <= 0))
      && (!needle || norm([r.full_name, r.email].filter(Boolean).join(" ")).includes(needle)));
  }, [rows, filter, q]);
  const paged = usePaged(filtered, 20);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Users} label={t("stat_customers")} value={withBalance.length} active={filter === "balance"} onClick={() => setFilter("balance")} />
        <AdminStatCard icon={Coins} label={t("stat_balance")} value={fmtN(open)} hint={t("stat_balance_hint", { value: money(pointsValue(open, s)) })} />
        <AdminStatCard icon={TrendingUp} label={t("stat_earned")} value={fmtN(earned)} tone="success" />
        <AdminStatCard icon={TrendingDown} label={t("stat_redeemed")} value={fmtN(redeemed)} hint={t("stat_redeemed_hint", { value: money(pointsValue(redeemed, s)) })} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter>
          label={t("f_label")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("f_all"), count: rows.length },
            { value: "balance", label: t("f_balance"), count: withBalance.length },
            { value: "zero", label: t("f_zero"), count: rows.length - withBalance.length },
          ]}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("f_search")} aria-label={t("f_search")} className="pl-9" />
        </div>
      </div>

      {paged.items.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{rows.length ? t("empty") : t("empty_all")}</p>
      ) : (
        <div className="overflow-hidden rounded-[18px] border bg-card">
          <table className="w-full text-sm">
            <thead className="hidden bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground sm:table-header-group">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("col_customer")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("col_balance")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("col_earned")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("col_redeemed")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("col_last")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paged.items.map((r) => (
                <tr key={r.user_id} onClick={() => onOpen(r.user_id)} className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/40 sm:table-row sm:p-0">
                  <td className="min-w-0 flex-1 sm:px-4 sm:py-3">
                    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r.user_id); }} className="text-left font-semibold hover:underline">{r.full_name || r.email}</button>
                    {r.full_name && <p className="text-xs text-muted-foreground">{r.email}</p>}
                  </td>
                  <td className="text-right font-bold tabular-nums sm:px-4 sm:py-3">
                    {t("points_n", { n: fmtN(r.balance) })}
                    <p className="text-xs font-normal text-muted-foreground">{t("worth", { value: money(pointsValue(Math.max(0, r.balance), s)) })}</p>
                  </td>
                  <td className="hidden text-right tabular-nums text-emerald-700 sm:table-cell sm:px-4 sm:py-3">+{fmtN(r.earned)}</td>
                  <td className="hidden text-right tabular-nums sm:table-cell sm:px-4 sm:py-3">{r.redeemed ? `-${fmtN(r.redeemed)}` : "0"}</td>
                  <td className="w-full text-xs text-muted-foreground sm:w-auto sm:px-4 sm:py-3 sm:text-right">{relative(r.last_activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
    </>
  );
}

/* ---------- Regras ---------- */

type RulesDraft = Record<keyof Omit<RewardSettings, "award_on">, string> & { award_on: RewardSettings["award_on"] };
const toDraft = (s: RewardSettings): RulesDraft => ({
  earn_per_unit: String(s.earn_per_unit), point_value: String(s.point_value), min_redeem: String(s.min_redeem),
  max_percent: String(s.max_percent), award_on: s.award_on, expire_months: String(s.expire_months), signup_bonus: String(s.signup_bonus),
});
const fromDraft = (d: RulesDraft): RewardSettings => normalizeRewardSettings(
  Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k === "award_on" ? v : String(v).replace(",", ".")])),
);

function RulesForm() {
  const { t } = useMessages(adminRewardPointsMessages);
  const { money } = useAdminFormat();
  const currency = useCurrency((s) => s.baseCurrency);
  const { data: settings, isLoading } = useRewardSettings();
  const save = useSaveRewardSettings();
  const [d, setD] = useState<RulesDraft | null>(null);
  useEffect(() => { if (settings) setD(toDraft(settings)); }, [settings]);

  if (isLoading || !d) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;

  const live = fromDraft(d);
  const sample = 100;
  const set = (p: Partial<RulesDraft>) => setD((x) => (x ? { ...x, ...p } : x));
  const submit = async () => {
    try {
      await save.mutateAsync(live);
      toast.success(t("saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };

  const field = (key: keyof Omit<RulesDraft, "award_on">, label: string, hint: string, decimal = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`rp-${key}`}>{label}</Label>
      <Input id={`rp-${key}`} inputMode={decimal ? "decimal" : "numeric"} value={d[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<RulesDraft>)} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <section className="space-y-5 rounded-[18px] border bg-card p-4 sm:p-5">
      <h4 className="font-semibold">{t("r_title")}</h4>
      <div className="grid gap-5 sm:grid-cols-2">
        {field("earn_per_unit", t("r_earn", { unit: money(1) }), t("r_earn_hint"), true)}
        {field("point_value", t("r_value"), t("r_value_hint", { currency, sample: money(pointsValue(100, live)) }), true)}
        {field("min_redeem", t("r_min"), t("r_min_hint"))}
        {field("max_percent", t("r_max"), t("r_max_hint"))}
        <div className="space-y-1.5">
          <Label htmlFor="rp-award">{t("r_award")}</Label>
          <Select value={d.award_on} onValueChange={(v) => set({ award_on: v === "delivered" ? "delivered" : "paid" })}>
            <SelectTrigger id="rp-award"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="paid">{t("r_award_paid")}</SelectItem>
              <SelectItem value="delivered">{t("r_award_delivered")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("r_award_hint")}</p>
        </div>
        {field("expire_months", t("r_expire"), t("r_expire_hint"))}
        {field("signup_bonus", t("r_signup"), t("r_signup_hint"))}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-accent p-4 text-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
        <div>
          <p className="font-semibold">{t("r_example_title")}</p>
          <p className="text-muted-foreground">
            {live.earn_per_unit > 0
              ? t("r_example", { sample: money(sample), earn: fmtN(pointsEarned(sample, live)), min: fmtN(live.min_redeem), value: money(pointsValue(live.min_redeem, live)) })
              : t("r_example_zero")}
          </p>
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

/* ---------- Página do cliente ---------- */

function CustomerPoints({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { t } = useMessages(adminRewardPointsMessages);
  const { money, date, dateTime } = useAdminFormat();
  const { data: settings } = useRewardSettings();
  const { data: bal, isLoading } = useAdminRewardOf(userId);
  const { data: history = [] } = useRewardHistory(userId);
  const adjust = useAdjustRewardPoints();
  const { ask, confirmSlot } = useInlineConfirm();
  const [adj, setAdj] = useState({ points: "", note: "" });
  const s = settings ?? normalizeRewardSettings(null);
  const name = bal?.full_name || bal?.email || "";

  const n = Math.trunc(Number(adj.points.replace(",", ".")) || 0);
  const runAdjust = async () => {
    if (!n) return;
    if (!(await ask(n > 0 ? t("confirm_add", { n: fmtN(n) }) : t("confirm_remove", { n: fmtN(-n) }), { confirmLabel: t("adjust_apply") }))) return;
    try {
      await adjust.mutateAsync({ userId, points: n, note: adj.note });
      setAdj({ points: "", note: "" });
      toast.success(t("adjusted"));
    } catch (e) {
      toast.error((e as Error).message === "negative_balance" ? t("negative") : t("save_error"));
    }
  };

  return (
    <AdminSubpage
      title={t("c_title", { name })}
      subtitle={bal?.full_name ? bal.email ?? undefined : undefined}
      backLabel={t("back")}
      onBack={onBack}
      actions={<Button variant="outline" size="sm" asChild><Link to={adminHref.customer(userId)}><Users className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("c_see_customer")}</Link></Button>}
    >
      {isLoading || !bal ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <AdminStatCard icon={Coins} label={t("c_balance")} value={fmtN(bal.balance)} tone="success" />
          <AdminStatCard icon={Wallet} label={t("c_value")} value={money(pointsValue(Math.max(0, bal.balance), s))} />
          <AdminStatCard icon={CalendarClock} label={t("c_expiring")} value={fmtN(bal.expiring)} tone={bal.expiring ? "warning" : "default"} hint={bal.next_expiry ? t("c_next", { date: date(bal.next_expiry) }) : t("c_no_expiry")} />
        </div>
      )}

      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <div>
          <h4 className="font-semibold">{t("adjust_title")}</h4>
          <p className="text-sm text-muted-foreground">{t("adjust_hint")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="rp-adj">{t("adjust_points")}</Label>
            <Input id="rp-adj" inputMode="numeric" value={adj.points} onChange={(e) => setAdj({ ...adj, points: e.target.value })} placeholder="-50 / 200" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-adj-note">{t("adjust_note")}</Label>
            <Input id="rp-adj-note" value={adj.note} maxLength={500} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />
          </div>
          <Button onClick={() => void runAdjust()} disabled={!n || adjust.isPending}>{t("adjust_apply")}</Button>
        </div>
        {confirmSlot}
      </section>

      <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
        <h4 className="font-semibold">{t("history")}</h4>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">{t("history_empty")}</p> : (
          <ul className="divide-y">
            {history.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(`k_${x.kind}`)}
                    {x.order_id && <> · <Link to={adminHref.order(x.order_id)} className="text-brand-orange-text hover:underline">{t("order_link", { code: x.order_id.slice(0, 8).toUpperCase() })}</Link></>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[dateTime(x.created_at), x.points > 0 && x.expires_at ? t("expires_on", { date: date(x.expires_at) }) : null, x.note].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", x.points < 0 ? "text-destructive" : "text-emerald-700")}>{x.points > 0 ? "+" : ""}{fmtN(x.points)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminSubpage>
  );
}
