// =====================================================================================
// Admin > Configurações > Registo de atividade (recurso activity_log). Sem janelas:
//   Números     mudanças no período (criadas, alteradas, apagadas) e administradores
//   Filtros     período, área (catálogo, pedidos, clientes...), ação, administrador, busca; CSV
//   Lista       quem fez o quê, quando, de onde; "Ver alterações" abre o antes e o depois de cada campo na página
//   Lateral     administradores e última ação, entradas na conta, prazo de guarda do registo
// Também exporta EntityActivity (bloco "Alterações no Admin" nas páginas do produto e do pedido).
// Regras em src/lib/activityLog.ts; dados em src/hooks/useActivityLog.ts; textos em src/i18n/adminActivity.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, FilePlus2, FileX2, History, KeyRound, Loader2, PencilLine, Search, ShieldCheck, UserCog, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminHelp from "./AdminHelp";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { AdminPanel } from "./shell/AdminPageParts";
import { useMessages } from "@/i18n";
import { adminActivityMessages, type AdminActivityKey } from "@/i18n/adminActivity";
import { adminFeaturesMessages, type AdminFeaturesKey } from "@/i18n/adminFeatures";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  activityArgs, useActivityActors, useActivityList, useActivitySettings, useActivitySummary, useAdminLogins, useSaveActivitySettings,
} from "@/hooks/useActivityLog";
import {
  ENTITY_GROUP_IDS, RETENTION_OPTIONS, activityHref, activitySince, activityTotals, changedFields, entitiesOf, formatChangeValue,
  humanField, shortAgent, type ActivityAction, type ActivityPeriod, type ActivityRow, type EntityGroup,
} from "@/lib/activityLog";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminActivityMessages["pt-BR"]>>["t"];
const PAGE_SIZE = 25;

/** Campos com nome traduzido (fl_<campo>); os outros aparecem como estão, legíveis. */
const FIELD_KEYS = new Set([
  "name", "title", "description", "price", "compare_at_price", "cost_price", "stock_quantity", "is_active", "active", "status",
  "payment_status", "tracking_number", "notes", "code", "discount_value", "discount_type", "sku", "gtin", "image", "email",
  "password", "full_name", "phone", "role", "slug", "value", "total", "is_featured", "display_order", "category", "max_uses",
  "expires_at", "valid_until", "content", "body", "image_url", "link_url", "show_in_menu", "price_modifier", "is_available",
]);

function useLabels() {
  const { t } = useMessages(adminActivityMessages);
  const entity = (e: string) => {
    // Chave sem texto devolve vazio: usa o nome da tabela, legível.
    return t(`e_${e}` as AdminActivityKey) || humanField(e);
  };
  const { t: tf } = useMessages(adminFeaturesMessages);
  /** Nome do campo; em Recursos da loja, "value.<recurso>" mostra o nome do recurso. */
  const field = (f: string, r?: Pick<ActivityRow, "entity" | "entity_id">) => {
    const [head, ...rest] = f.split(".");
    if (head === "value" && rest.length) {
      if (r?.entity === "store_settings" && r.entity_id === "features") return tf(`f_${rest[0]}` as AdminFeaturesKey) || humanField(rest[0]);
      return humanField(rest.join("."));
    }
    return FIELD_KEYS.has(f) ? t(`fl_${f}` as AdminActivityKey) : humanField(f);
  };
  /** Nome do item: as configurações (store_settings) têm nome próprio pela chave. */
  const item = (r: Pick<ActivityRow, "entity" | "entity_label" | "entity_id">) => {
    const raw = r.entity_label || (r.entity_id ? r.entity_id.slice(0, 12) : "");
    return r.entity === "store_settings" ? t(`k_${raw}` as AdminActivityKey) || raw : raw;
  };
  const value = (v: unknown) => formatChangeValue(v, { yes: t("yes"), no: t("no"), empty: t("empty_value") });
  return { t, entity, field, value, item };
}

const ACTION_ICON = { create: FilePlus2, update: PencilLine, delete: FileX2 } as const;
const ACTION_TONE = { create: "bg-emerald-50 text-emerald-700", update: "bg-sky-50 text-sky-700", delete: "bg-red-50 text-red-700" } as const;

/* ---------- uma linha do registo ---------- */

function ActivityItem({ r, compact = false }: { r: ActivityRow; compact?: boolean }) {
  const { t, entity, field, value, item } = useLabels();
  const { dateTime, relative } = useAdminFormat();
  const [open, setOpen] = useState(false);
  const Icon = ACTION_ICON[r.action];
  const fields = changedFields(r.changes);
  const href = activityHref(r);
  const label = item(r);
  const agent = shortAgent(r.user_agent);

  return (
    <li className="p-3 sm:p-4">
      <div className="flex gap-3">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", ACTION_TONE[r.action])}><Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="break-words text-sm">
            <span className="font-semibold">{r.actor_email ?? t("unknown_admin")}</span>{" "}
            {t(`did_${r.action}`)}{" "}
            <span className="text-muted-foreground">{entity(r.entity)}</span>{" "}
            {label && (href
              ? <Link to={href} className="font-semibold text-foreground underline-offset-2 hover:underline">{label}</Link>
              : <span className="font-semibold">{label}</span>)}
          </p>
          <p className="text-xs text-muted-foreground">
            <time dateTime={r.created_at} title={dateTime(r.created_at)}>{compact ? dateTime(r.created_at) : relative(r.created_at)}</time>
            {r.ip && <> · {t("from_ip", { ip: r.ip })}</>}
            {agent && <> · {agent}</>}
          </p>
          {fields.length > 0 && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              className="inline-flex items-start gap-1 text-left text-sm font-medium text-brand-orange-text hover:underline">
              {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
              {fields.length === 1 ? t("see_change_one", { field: field(fields[0], r) }) : t("see_changes", { n: fields.length })}
            </button>
          )}
          {open && (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr><th className="p-2 font-medium">{t("col_field")}</th><th className="p-2 font-medium">{t("col_before")}</th><th className="p-2 font-medium">{t("col_after")}</th></tr>
                </thead>
                <tbody className="divide-y">
                  {fields.map((f) => (
                    <tr key={f} className="align-top">
                      <td className="whitespace-nowrap p-2 font-medium">{field(f, r)}</td>
                      <td className="min-w-[8rem] max-w-[22rem] break-words p-2 text-muted-foreground">{r.action === "create" ? "" : value(r.changes[f]?.o)}</td>
                      <td className="min-w-[8rem] max-w-[22rem] break-words p-2">{r.action === "delete" ? "" : value(r.changes[f]?.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/* ---------- lateral: administradores, entradas, prazo ---------- */

function ActorsPanel({ value, onPick }: { value: string | null; onPick: (id: string | null) => void }) {
  const { t } = useLabels();
  const { relative } = useAdminFormat();
  const { data = [] } = useActivityActors();
  return (
    <AdminPanel title={t("admins_title")} icon={UserCog}>
      {!data.length ? <p className="text-sm text-muted-foreground">{t("admins_empty")}</p> : (
        <ul className="space-y-1">
          {data.map((a) => (
            <li key={a.actor}>
              <button type="button" onClick={() => onPick(value === a.actor ? null : a.actor)} aria-pressed={value === a.actor}
                className={cn("flex w-full items-start justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted/60", value === a.actor && "bg-primary/10")}>
                <span className="min-w-0">
                  <span className="block break-all font-medium">{a.email ?? t("unknown_admin")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {a.last_action ? t("last_action", { when: relative(a.last_action) }) : t("no_actions")}
                    {!a.is_admin && <> · {t("not_admin_now")}</>}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{a.actions}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("admins_hint")}</p>
    </AdminPanel>
  );
}

function LoginsPanel() {
  const { t } = useLabels();
  const { dateTime } = useAdminFormat();
  const { data = [], isLoading } = useAdminLogins(8);
  return (
    <AdminPanel title={t("logins_title")} icon={KeyRound}>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : !data.length ? (
        <p className="text-sm text-muted-foreground">{t("logins_empty")}</p>
      ) : (
        <ul className="divide-y text-sm">
          {data.map((l, i) => (
            <li key={`${l.created_at}-${i}`} className="py-2">
              <span className="block break-all font-medium">{l.email}</span>
              <span className="block text-xs text-muted-foreground">
                {t(`login_${l.action}` as AdminActivityKey) || l.action} · {dateTime(l.created_at)}{l.ip ? ` · ${l.ip}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

function RetentionPanel() {
  const { t } = useLabels();
  const { data } = useActivitySettings();
  const save = useSaveActivitySettings();
  const current = data?.retentionDays ?? 365;
  const pick = async (days: number) => {
    if (!data || days === current) return;
    try {
      await save.mutateAsync({ retentionDays: days, raw: data.raw });
      toast.success(t("retention_saved"));
    } catch {
      toast.error(t("save_error"));
    }
  };
  return (
    <AdminPanel title={t("retention_title")} icon={ShieldCheck}>
      <p className="mb-3 text-sm text-muted-foreground">{t("retention_hint")}</p>
      <div role="group" aria-label={t("retention_title")} className="flex flex-wrap gap-2">
        {RETENTION_OPTIONS.map((d) => (
          <button key={d} type="button" onClick={() => pick(d)} aria-pressed={current === d} disabled={save.isPending}
            className={cn("min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors", current === d ? "border-foreground bg-foreground text-background" : "bg-card hover:border-primary/50")}>
            {d === 0 ? t("retention_forever") : t(`retention_${d}` as AdminActivityKey)}
          </button>
        ))}
      </div>
    </AdminPanel>
  );
}

/* ---------- seção do Admin ---------- */

export default function AdminActivityLog() {
  const { t } = useLabels();
  const { dateTime } = useAdminFormat();
  const { entity, field, value, item } = useLabels();
  const [period, setPeriod] = useState<ActivityPeriod>("7d");
  const [group, setGroup] = useState<EntityGroup>("all");
  const [action, setAction] = useState<ActivityAction | "all">("all");
  const [actor, setActor] = useState<string | null>(null);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { const h = setTimeout(() => setQ(qInput), 300); return () => clearTimeout(h); }, [qInput]);
  useEffect(() => { setPage(1); }, [period, group, action, actor, q]);

  const since = useMemo(() => activitySince(period), [period]);
  const filters = { since, entities: entitiesOf(group), actions: action === "all" ? null : [action], actor, q, page, pageSize: PAGE_SIZE };
  const { data, isLoading, error, isFetching } = useActivityList(filters);
  const { data: summary = [] } = useActivitySummary(since);
  const { data: actors = [] } = useActivityActors();
  const tot = activityTotals(summary);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const actorEmail = actor ? actors.find((a) => a.actor === actor)?.email : null;

  const exportCsv = async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: rows, error: e } = await (supabase as any).rpc("admin_activity_list", activityArgs(filters, 500, 0));
    if (e) { toast.error(t("load_error")); return; }
    downloadCsv("registo-de-atividade", [t("col_date"), t("col_admin"), t("col_action"), t("col_area"), t("col_item"), t("col_changes"), "IP"],
      (rows as ActivityRow[]).map((r) => [
        dateTime(r.created_at), r.actor_email, t(`a_${r.action}`), entity(r.entity), item(r),
        changedFields(r.changes).map((f) => `${field(f, r)}: ${value(r.changes[f]?.o)} > ${value(r.changes[f]?.n)}`).join(" | "), r.ip,
      ]));
  };

  return (
    <div className="space-y-5">
      <AdminHelp id="activity-log" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips<ActivityPeriod> label={t("period")} value={period} onChange={setPeriod}
          options={(["1d", "7d", "30d", "90d", "all"] as const).map((p) => ({ value: p, label: t(`p_${p}`) }))} />
        <Button variant="outline" onClick={exportCsv} disabled={!total}><Download className="mr-1.5 h-4 w-4" strokeWidth={1.8} />CSV</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={History} label={t("stat_total")} value={tot.total} hint={t("stat_total_hint")} active={action === "all"} onClick={() => setAction("all")} />
        <AdminStatCard icon={FilePlus2} label={t("stat_created")} value={tot.created} tone="success" active={action === "create"} onClick={() => setAction(action === "create" ? "all" : "create")} />
        <AdminStatCard icon={PencilLine} label={t("stat_updated")} value={tot.updated} active={action === "update"} onClick={() => setAction(action === "update" ? "all" : "update")} />
        <AdminStatCard icon={FileX2} label={t("stat_deleted")} value={tot.deleted} tone={tot.deleted ? "warning" : "default"} active={action === "delete"} onClick={() => setAction(action === "delete" ? "all" : "delete")} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
            <FilterChips<EntityGroup> label={t("f_area")} value={group} onChange={setGroup}
              options={ENTITY_GROUP_IDS.map((g) => ({ value: g, label: t(`g_${g}` as AdminActivityKey) }))} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("f_search")} aria-label={t("f_search")} className="pl-9" />
            </div>
            {actor && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("f_admin")}</span>
                <button type="button" onClick={() => setActor(null)} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-medium hover:bg-primary/20">
                  <Users className="h-3.5 w-3.5" />{actorEmail ?? t("unknown_admin")} · {t("f_admin_clear")}
                </button>
              </p>
            )}
          </div>

          {isLoading ? (
            <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
          ) : error ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>
          ) : !data?.rows.length ? (
            <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className={cn("divide-y rounded-[18px] border bg-card transition-opacity", isFetching && "opacity-60")}>
              {data.rows.map((r) => <ActivityItem key={r.id} r={r} />)}
            </ul>
          )}
          <AdminPager page={page} pages={pages} total={total} from={total ? (page - 1) * PAGE_SIZE + 1 : 0} to={Math.min(page * PAGE_SIZE, total)} onPage={setPage} />
        </div>

        <div className="min-w-0 space-y-4">
          <ActorsPanel value={actor} onPick={setActor} />
          <LoginsPanel />
          <RetentionPanel />
        </div>
      </div>
    </div>
  );
}

/* ---------- bloco nas páginas do produto e do pedido ---------- */

export function EntityActivity({ refId }: { refId: string }) {
  const { t } = useLabels();
  const { data, isLoading } = useActivityList({ since: null, entities: null, actions: null, actor: null, q: "", ref: refId, page: 1, pageSize: 6 });
  return (
    <AdminPanel title={t("entity_block")} icon={History}>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : !data?.rows.length ? (
        <p className="text-sm text-muted-foreground">{t("entity_empty")}</p>
      ) : (
        <>
          <ul className="-mx-3 divide-y sm:-mx-4">{data.rows.map((r) => <ActivityItem key={r.id} r={r} compact />)}</ul>
          {data.total > data.rows.length && <p className="mt-2 text-xs text-muted-foreground">{t("entity_more", { n: data.total - data.rows.length })}</p>}
        </>
      )}
    </AdminPanel>
  );
}
