// =====================================================================================
// Admin > Devoluções. Dois separadores (aba= no endereço):
//   lista   pedidos de devolução e troca feitos pelos clientes na conta: números, filtros, busca
//   regras  ligar ou desligar, prazo em dias e o que o cliente pode pedir (store_settings.return_settings)
// Cada pedido de devolução abre em página própria (ver=devolucao&id=<id>, returns/ReturnPage.tsx), nunca em janela.
// Regras de segurança na base (migration 20261006160300_return_requests.sql).
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Clock, Inbox, Loader2, RotateCcw, Save, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import ReturnPage, { ReturnBadge } from "./returns/ReturnPage";
import { useMessages } from "@/i18n";
import { adminReturnsMessages } from "@/i18n/adminReturns";
import { returnsMessages } from "@/i18n/returns";
import { useAdminFormat, usePaged } from "@/hooks/useAdminList";
import { useAdminReturns, useReturnSettings, useSaveReturnSettings } from "@/hooks/useReturns";
import { OPEN_RETURN_STATUSES, RETURN_ACTIONS, type ReturnAction, type ReturnSettings, type ReturnStatus } from "@/lib/returns";

type Filter = "all" | "open" | ReturnStatus;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const code = (id: string) => id.slice(0, 8).toUpperCase();

export default function AdminReturns() {
  const { t } = useMessages(adminReturnsMessages);
  const page = useAdminPage();
  const tab = page.tab === "regras" ? "regras" : "lista";

  if (page.view === "devolucao" && page.id) return <ReturnPage id={page.id} onBack={page.close} />;

  return (
    <div className="space-y-5">
      <AdminHelp id="devolucoes" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11">
          <TabsTrigger value="lista" className="px-4">{t("tab_list")}</TabsTrigger>
          <TabsTrigger value="regras" className="px-4">{t("tab_rules")}</TabsTrigger>
        </TabsList>
        <TabsContent value="lista" className="mt-5"><ReturnList onOpen={(id) => page.open("devolucao", id)} /></TabsContent>
        <TabsContent value="regras" className="mt-5"><ReturnRules /></TabsContent>
      </Tabs>
    </div>
  );
}

function ReturnList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useMessages(adminReturnsMessages);
  const { t: tr } = useMessages(returnsMessages);
  const { date, money } = useAdminFormat();
  const { data: rows = [], isLoading, error } = useAdminReturns();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const count = (s: ReturnStatus) => rows.filter((r) => r.status === s).length;
  const openCount = rows.filter((r) => OPEN_RETURN_STATUSES.includes(r.status)).length;

  const filtered = useMemo(() => {
    const needle = norm(q.trim().replace(/^#/, ""));
    return rows.filter((r) =>
      (filter === "all" || (filter === "open" ? OPEN_RETURN_STATUSES.includes(r.status) : r.status === filter))
      && (!needle || norm([r.customer_name, r.order?.guest_email, code(r.order_id), ...r.items.map((i) => i.name)].filter(Boolean).join(" ")).includes(needle)));
  }, [rows, filter, q]);
  const paged = usePaged(filtered, 20);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={Inbox} label={t("stat_new")} value={count("requested")} tone={count("requested") ? "warning" : "default"} active={filter === "requested"} onClick={() => setFilter("requested")} />
        <AdminStatCard icon={Clock} label={t("stat_open")} value={openCount} active={filter === "open"} onClick={() => setFilter("open")} />
        <AdminStatCard icon={CheckCircle2} label={t("stat_done")} value={count("completed")} tone="success" active={filter === "completed"} onClick={() => setFilter("completed")} />
        <AdminStatCard icon={XCircle} label={t("stat_rejected")} value={count("rejected")} active={filter === "rejected"} onClick={() => setFilter("rejected")} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter>
          label={t("f_status")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("f_all"), count: rows.length },
            { value: "open", label: t("f_open"), count: openCount },
            { value: "requested", label: tr("status_requested"), count: count("requested"), tone: "warning" },
            { value: "approved", label: tr("status_approved"), count: count("approved") },
            { value: "received", label: tr("status_received"), count: count("received") },
            { value: "completed", label: tr("status_completed"), count: count("completed") },
            { value: "rejected", label: tr("status_rejected"), count: count("rejected") },
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
        <ul className="space-y-3">
          {paged.items.map((r) => {
            const units = r.items.reduce((s, i) => s + Number(i.quantity || 0), 0);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="flex w-full flex-col gap-3 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{t("order_short", { code: code(r.order_id) })}</span>
                      <ReturnBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-sm">{tr(`action_${r.action}`)} · {tr(`reason_${r.reason}`)}</p>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                      {units === 1 ? t("items_one") : t("items_n", { n: units })}: {r.items.map((i) => i.name).join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[r.customer_name || r.order?.guest_email || t("guest"), date(r.created_at), r.order ? money(r.order.total) : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center text-sm font-semibold text-brand-orange-text">{t("open")}<ChevronRight className="ml-1 h-4 w-4" /></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <AdminPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} />
    </div>
  );
}

function ReturnRules() {
  const { t } = useMessages(adminReturnsMessages);
  const { t: tr } = useMessages(returnsMessages);
  const { data, isLoading } = useReturnSettings();
  const save = useSaveReturnSettings();
  const [form, setForm] = useState<ReturnSettings | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);

  if (isLoading || !form) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  const dirty = JSON.stringify(form) !== JSON.stringify(data);
  const toggleAction = (a: ReturnAction, on: boolean) =>
    setForm((f) => f && ({ ...f, actions: on ? RETURN_ACTIONS.filter((x) => x === a || f.actions.includes(x)) : f.actions.filter((x) => x !== a) }));

  return (
    <div className="space-y-5">
      <section className="space-y-5 rounded-[18px] border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand-orange-text"><RotateCcw className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
            <div>
              <Label htmlFor="rt-enabled" className="text-sm font-semibold">{t("rules_enabled")}</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">{form.enabled ? t("rules_enabled_on") : t("rules_enabled_off")}</p>
            </div>
          </div>
          <Switch id="rt-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
        </div>

        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="rt-days">{t("rules_days")}</Label>
          <Input id="rt-days" type="number" inputMode="numeric" min={0} max={365} value={form.days} onChange={(e) => setForm({ ...form, days: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))) })} />
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">{t("rules_days_hint")}</p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("rules_actions")}</legend>
          <div className="flex flex-wrap gap-3">
            {RETURN_ACTIONS.map((a) => (
              <label key={a} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm">
                <Checkbox checked={form.actions.includes(a)} disabled={form.actions.length === 1 && form.actions.includes(a)} onCheckedChange={(v) => toggleAction(a, v === true)} />
                {tr(`action_${a}`)}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("rules_actions_hint")}</p>
        </fieldset>

        <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
          {t("rules_policy")}{" "}
          <Link to={adminHref.section("pages")} className="font-semibold text-brand-orange-text hover:underline">{t("rules_policy_link")}</Link>
        </p>
      </section>

      <div className="flex justify-end">
        <Button
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(form, { onSuccess: () => toast.success(t("saved")), onError: () => toast.error(t("save_error")) })}
        >
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
          {save.isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
