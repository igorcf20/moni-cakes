// =====================================================================================
// Admin > Grupos de clientes (recurso customer_groups em Admin > Recursos da loja). Telas, sem janelas:
//   lista   números (grupos ativos, clientes em grupos, preços próprios, desligados), filtros, busca, Novo grupo
//   novo    (ver=novo) nome, nome para o cliente por idioma, nota, desconto geral, ativo
//   grupo   (ver=grupo&id=<id>) os mesmos dados, clientes do grupo (pôr e tirar) e a tabela de preço
//           (produto, a partir de quantas unidades, preço), apagar
// Regras no servidor (migration 20261007000000_customer_groups.sql); conta do preço em src/lib/customerGroups.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, ImageOff, Loader2, Percent, Plus, Save, Search, Tags, Trash2, UserMinus, UserPlus, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminStatCard, FilterChips } from "./AdminListKit";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/i18n";
import { customerGroupsMessages, type CustomerGroupsKey } from "@/i18n/customerGroups";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  groupErrorCode, useAdminCustomerOptions, useCustomerGroupMemberships, useCustomerGroups, useDeleteCustomerGroup,
  useGroupMembers, useGroupPrices, useSaveCustomerGroup, useSaveGroupPrices, useSetCustomerGroup,
  type CustomerGroup, type CustomerGroupInput, type GroupPriceRow,
} from "@/hooks/useCustomerGroups";
import { validPriceRows } from "@/lib/customerGroups";
import { cn } from "@/lib/utils";

type T = (key: CustomerGroupsKey, vars?: Record<string, string | number>) => string;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const LOCALES = [["pt-BR", "lang_pt_BR"], ["pt-PT", "lang_pt_PT"], ["en", "lang_en"], ["es", "lang_es"]] as const;

export default function AdminCustomerGroups() {
  const { t } = useMessages(customerGroupsMessages);
  const page = useAdminPage();
  if (page.view === "novo") return <GroupForm onBack={page.close} onSaved={(id) => page.open("grupo", id)} />;
  if (page.view === "grupo" && page.id) return <GroupPage id={page.id} onBack={page.close} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="customer-groups" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      <GroupList onOpen={(id) => page.open("grupo", id)} onNew={() => page.open("novo")} />
    </div>
  );
}

/* ---------- Lista ---------- */

type Filter = "all" | "active" | "off";

function GroupList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { t } = useMessages(customerGroupsMessages);
  const { data: groups = [], isLoading, error } = useCustomerGroups();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const active = groups.filter((g) => g.is_active);
  const shown = groups.filter((g) => (filter === "all" || (filter === "active") === g.is_active)
    && (!q.trim() || norm([g.name, g.description ?? "", ...Object.values(g.name_i18n)].join(" ")).includes(norm(q.trim()))));

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><Button onClick={onNew}><Plus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("new")}</Button></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={UsersRound} label={t("st_groups")} value={active.length} active={filter === "active"} onClick={() => setFilter("active")} />
        <AdminStatCard icon={UserPlus} label={t("st_members")} value={groups.reduce((s, g) => s + g.members, 0)} />
        <AdminStatCard icon={Tags} label={t("st_prices")} value={groups.reduce((s, g) => s + g.prices, 0)} />
        <AdminStatCard icon={Percent} label={t("st_off")} value={groups.length - active.length} tone={groups.length - active.length ? "warning" : "default"} active={filter === "off"} onClick={() => setFilter("off")} />
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        <FilterChips<Filter> label={t("f_label")} value={filter} onChange={setFilter} options={[
          { value: "all", label: t("f_all"), count: groups.length },
          { value: "active", label: t("f_active"), count: active.length },
          { value: "off", label: t("f_off"), count: groups.length - active.length },
        ]} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("name")} aria-label={t("name")} className="pl-9" />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{groups.length ? t("empty") : t("empty_all")}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => onOpen(g.id)} className="flex w-full items-center gap-3 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-orange-soft text-brand-orange-text"><UsersRound className="h-5 w-5" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{g.name}</span>
                    <StateBadge on={g.is_active} t={t} />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {[g.discount_percent > 0 ? t("discount_badge", { n: g.discount_percent }) : t("no_discount"), t(g.members === 1 ? "members_count_one" : "members_count", { n: g.members }), t(g.prices === 1 ? "prices_count_one" : "prices_count", { n: g.prices })].join(" · ")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StateBadge({ on, t }: { on: boolean; t: T }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", on ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>{t(on ? "active" : "off")}</span>;
}

/* ---------- Dados do grupo (novo e editar) ---------- */

const EMPTY: CustomerGroupInput = { name: "", name_i18n: {}, description: "", discount_percent: 0, is_active: true };

function GroupFields({ initial, onSaved }: { initial: CustomerGroupInput; onSaved: (id: string) => void }) {
  const { t } = useMessages(customerGroupsMessages);
  const save = useSaveCustomerGroup();
  const [form, setForm] = useState<CustomerGroupInput>(initial);
  const [discount, setDiscount] = useState(String(initial.discount_percent));
  useEffect(() => { setForm(initial); setDiscount(String(initial.discount_percent)); }, [initial]);
  const pct = Number(discount.replace(",", "."));
  const valid = form.name.trim().length > 0 && form.name.trim().length <= 80 && Number.isFinite(pct) && pct >= 0 && pct <= 90;
  const dirty = JSON.stringify({ ...form, discount_percent: pct }) !== JSON.stringify(initial);

  const submit = () => {
    if (!valid) { toast.error(t("invalid")); return; }
    save.mutate({ ...form, discount_percent: Math.round(pct * 100) / 100 }, {
      onSuccess: (id) => { toast.success(t("saved")); onSaved(id); },
      onError: (e) => { const c = groupErrorCode(e); toast.error(t(c === "unknown" ? "save_error" : c)); },
    });
  };

  return (
    <section className="space-y-4 rounded-[18px] border bg-card p-5">
      <h2 className="text-base font-semibold">{t("data_title")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="cg-name">{t("name")}</Label>
          <Input id="cg-name" value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <p className="text-xs text-muted-foreground">{t("name_hint")}</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cg-discount">{t("discount")}</Label>
          <Input id="cg-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="sm:max-w-[160px]" />
          <p className="text-xs text-muted-foreground">{t("discount_hint")}</p>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("public_name")}</legend>
        <p className="text-xs text-muted-foreground">{t("public_name_hint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {LOCALES.map(([loc, label]) => (
            <div key={loc} className="grid gap-1">
              <Label htmlFor={`cg-name-${loc}`} className="text-xs text-muted-foreground">{t(label)}</Label>
              <Input id={`cg-name-${loc}`} value={form.name_i18n[loc] ?? ""} maxLength={60} placeholder={form.name}
                onChange={(e) => setForm((f) => {
                  const next = { ...f.name_i18n, [loc]: e.target.value };
                  if (!e.target.value.trim()) delete next[loc];
                  return { ...f, name_i18n: next };
                })} />
            </div>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="cg-desc">{t("description")}</Label>
        <Textarea id="cg-desc" rows={2} value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("description_hint")} />
      </div>
      <label className="flex cursor-pointer items-start justify-between gap-3 border-t pt-4">
        <span>
          <span className="block text-sm font-semibold">{t("is_active")}</span>
          <span className="block text-xs text-muted-foreground">{t("is_active_hint")}</span>
        </span>
        <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
      </label>
      <div className="flex items-center justify-end gap-3">
        {dirty && initial.id && <span className="text-xs font-medium text-amber-700">{t("unsaved")}</span>}
        <Button onClick={submit} disabled={save.isPending || !valid || (!!initial.id && !dirty)}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("save")}
        </Button>
      </div>
    </section>
  );
}

function GroupForm({ onBack, onSaved }: { onBack: () => void; onSaved: (id: string) => void }) {
  const { t } = useMessages(customerGroupsMessages);
  return (
    <AdminSubpage title={t("new")} subtitle={t("new_hint")} backLabel={t("back")} onBack={onBack}>
      <GroupFields initial={EMPTY} onSaved={onSaved} />
    </AdminSubpage>
  );
}

/* ---------- Página do grupo ---------- */

function GroupPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useMessages(customerGroupsMessages);
  const { data: groups = [], isLoading } = useCustomerGroups();
  const remove = useDeleteCustomerGroup();
  const { ask, confirmSlot } = useInlineConfirm();
  const g = groups.find((x) => x.id === id);
  const initial = useMemo<CustomerGroupInput | null>(() => g
    ? { id: g.id, name: g.name, name_i18n: g.name_i18n, description: g.description ?? "", discount_percent: g.discount_percent, is_active: g.is_active }
    : null, [g]);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!g || !initial) return <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("not_found_hint")}</p></AdminSubpage>;

  const del = async () => {
    if (!(await ask(t("delete_confirm", { name: g.name }), { description: t("delete_hint"), confirmLabel: t("delete"), tone: "danger" }))) return;
    remove.mutate(g.id, { onSuccess: () => { toast.success(t("deleted")); onBack(); }, onError: () => toast.error(t("save_error")) });
  };

  return (
    <AdminSubpage
      title={g.name}
      subtitle={[g.discount_percent > 0 ? t("discount_badge", { n: g.discount_percent }) : t("no_discount"), t(g.members === 1 ? "members_count_one" : "members_count", { n: g.members }), t(g.prices === 1 ? "prices_count_one" : "prices_count", { n: g.prices })].join(" · ")}
      backLabel={t("back")}
      onBack={onBack}
      actions={<Button variant="outline" onClick={del} disabled={remove.isPending} className="text-destructive hover:text-destructive"><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>}
    >
      {confirmSlot}
      <GroupFields initial={initial} onSaved={() => undefined} />
      <MembersBlock group={g} groups={groups} />
      <PricesBlock groupId={g.id} />
    </AdminSubpage>
  );
}

/* ---------- Clientes do grupo ---------- */

function MembersBlock({ group, groups }: { group: CustomerGroup; groups: CustomerGroup[] }) {
  const { t } = useMessages(customerGroupsMessages);
  const { date } = useAdminFormat();
  const { data: members = [], isLoading } = useGroupMembers(group.id);
  const { data: customers = [] } = useAdminCustomerOptions();
  const { data: memberships } = useCustomerGroupMemberships();
  const setGroup = useSetCustomerGroup();
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(customers.map((c) => [c.user_id, c])), [customers]);
  const groupName = (gid?: string) => groups.find((x) => x.id === gid)?.name ?? "";
  const memberIds = new Set(members.map((m) => m.user_id));
  const results = q.trim()
    ? customers.filter((c) => !memberIds.has(c.user_id) && norm(`${c.full_name ?? ""} ${c.email ?? ""}`).includes(norm(q.trim()))).slice(0, 8)
    : [];

  const put = (userId: string, groupId: string | null) => setGroup.mutate({ userId, groupId }, {
    onSuccess: () => { toast.success(t(groupId ? "member_added" : "member_removed")); setQ(""); },
    onError: () => toast.error(t("save_error")),
  });

  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">{t("members_title")}</h2>
        <p className="text-sm text-muted-foreground">{t("members_hint")}</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("member_search")} aria-label={t("member_search")} className="pl-9" />
      </div>
      {q.trim() && (results.length === 0
        ? <p className="text-sm text-muted-foreground">{t("member_no_results")}</p>
        : (
          <ul className="divide-y rounded-[14px] border">
            {results.map((c) => {
              const other = memberships?.get(c.user_id);
              return (
                <li key={c.user_id} className="flex items-center gap-3 p-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.full_name || c.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[c.email, other ? t("member_in_other", { group: groupName(other) }) : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => put(c.user_id, group.id)} disabled={setGroup.isPending}><UserPlus className="mr-1.5 h-4 w-4" />{t("member_add")}</Button>
                </li>
              );
            })}
          </ul>
        ))}
      {isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
        : members.length === 0 ? <p className="rounded-[14px] border border-dashed p-4 text-center text-sm text-muted-foreground">{t("member_none")}</p>
          : (
            <ul className="divide-y rounded-[14px] border">
              {members.map((m) => {
                const c = byId.get(m.user_id);
                return (
                  <li key={m.user_id} className="flex items-center gap-3 p-2.5">
                    <Link to={adminHref.customer(m.user_id)} className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="block truncate text-sm font-medium hover:text-brand-orange-text">{c?.full_name || c?.email || m.user_id}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[c?.full_name ? c.email : null, t("member_since", { date: date(m.added_at) })].filter(Boolean).join(" · ")}</span>
                    </Link>
                    <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={t("member_remove")} title={t("member_remove")} onClick={() => put(m.user_id, null)} disabled={setGroup.isPending}><UserMinus className="h-4 w-4" /></Button>
                  </li>
                );
              })}
            </ul>
          )}
    </section>
  );
}

/* ---------- Tabela de preço ---------- */

type ProductOption = { id: string; name: string; image: string | null; is_active: boolean; sku: string | null; price: number };
type DraftRow = { key: string; product_id: string; min_quantity: string; price: string };

let rowSeq = 0;
const toDraft = (r: GroupPriceRow): DraftRow => ({ key: `r${++rowSeq}`, product_id: r.product_id, min_quantity: String(r.min_quantity), price: String(r.price) });
const fromDraft = (r: DraftRow): GroupPriceRow => ({ product_id: r.product_id, min_quantity: Number(r.min_quantity), price: Number(r.price.replace(",", ".")) });

function PricesBlock({ groupId }: { groupId: string }) {
  const { t } = useMessages(customerGroupsMessages);
  const { money } = useAdminFormat();
  const { data: saved = [], isLoading } = useGroupPrices(groupId);
  const save = useSaveGroupPrices(groupId);
  const { data: products = [] } = useQuery({
    queryKey: ["group-price-products"],
    staleTime: 60_000,
    queryFn: async (): Promise<ProductOption[]> => {
      const { data, error } = await (supabase as any).from("products").select("id,name,image,is_active,sku,price").order("name").limit(2000);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({ ...p, price: Number(p.price) || 0 }));
    },
  });
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const savedKey = JSON.stringify(saved);
  const [rows, setRows] = useState<DraftRow[]>([]);
  useEffect(() => { setRows((JSON.parse(savedKey) as GroupPriceRow[]).map(toDraft)); }, [savedKey]);
  const [q, setQ] = useState("");
  const parsed = rows.map(fromDraft);
  const dirty = JSON.stringify(parsed) !== savedKey;
  const valid = validPriceRows(parsed);
  const inList = new Set(rows.map((r) => r.product_id));
  const results = q.trim()
    ? products.filter((p) => !inList.has(p.id) && norm(`${p.name} ${p.id} ${p.sku ?? ""}`).includes(norm(q.trim()))).slice(0, 8)
    : [];

  // Linhas por produto, na ordem em que entraram.
  const grouped = useMemo(() => {
    const order: string[] = [];
    for (const r of rows) if (!order.includes(r.product_id)) order.push(r.product_id);
    return order.map((pid) => ({ pid, rows: rows.filter((r) => r.product_id === pid) }));
  }, [rows]);

  const patch = (key: string, p: Partial<DraftRow>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = (pid: string, min = 1) => setRows((cur) => [...cur, { key: `r${++rowSeq}`, product_id: pid, min_quantity: String(min), price: String(byId.get(pid)?.price ?? 0) }]);
  const submit = () => {
    if (!valid) { toast.error(t("price_invalid")); return; }
    save.mutate(parsed.map((r) => ({ ...r, price: Math.round(r.price * 100) / 100 })), { onSuccess: () => toast.success(t("price_saved")), onError: () => toast.error(t("price_invalid")) });
  };

  return (
    <section className="space-y-3 rounded-[18px] border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">{t("prices_title")}</h2>
        <p className="text-sm text-muted-foreground">{t("prices_hint")}</p>
      </div>

      {isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
        : grouped.length === 0 ? <p className="rounded-[14px] border border-dashed p-4 text-center text-sm text-muted-foreground">{t("price_none")}</p>
          : (
            <ul className="space-y-3">
              {grouped.map(({ pid, rows: prows }) => {
                const p = byId.get(pid);
                const catalog = p?.price ?? 0;
                const nextMin = Math.max(...prows.map((r) => Number(r.min_quantity) || 1)) + 9;
                return (
                  <li key={pid} className="space-y-2 rounded-[14px] border p-3">
                    <div className="flex items-center gap-3">
                      {p?.image ? <img src={p.image} alt="" className="h-10 w-10 shrink-0 rounded-lg border bg-muted object-cover" loading="lazy" />
                        : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground"><ImageOff className="h-4 w-4" /></span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p?.name ?? pid}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[p?.sku, t("price_catalog", { price: money(catalog) })].filter(Boolean).join(" · ")}
                          {p && !p.is_active && <span className="ml-1 text-amber-700">{t("hidden")}</span>}
                        </p>
                      </div>
                    </div>
                    {prows.map((r) => {
                      const price = Number(r.price.replace(",", "."));
                      const saving = catalog > 0 && price < catalog ? Math.round((1 - price / catalog) * 100) : 0;
                      return (
                        <div key={r.key} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                          <div className="grid gap-1">
                            <Label htmlFor={`${r.key}-min`} className="text-xs text-muted-foreground">{t("price_min")}</Label>
                            <Input id={`${r.key}-min`} inputMode="numeric" value={r.min_quantity} onChange={(e) => patch(r.key, { min_quantity: e.target.value.replace(/\D/g, "") })} />
                          </div>
                          <div className="grid gap-1">
                            <Label htmlFor={`${r.key}-price`} className="text-xs text-muted-foreground">{t("price_value")}</Label>
                            <Input id={`${r.key}-price`} inputMode="decimal" value={r.price} onChange={(e) => patch(r.key, { price: e.target.value })} />
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label={t("price_remove")} onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}><X className="h-4 w-4" /></Button>
                          <p className={cn("col-span-3 -mt-1 text-xs", saving ? "text-emerald-700" : "text-muted-foreground")}>
                            {Number.isFinite(price) && price >= catalog && catalog > 0 ? t("price_above") : saving ? t("price_saving", { n: saving }) : ""}
                          </p>
                        </div>
                      );
                    })}
                    <Button type="button" variant="outline" size="sm" onClick={() => add(pid, nextMin)}><Plus className="mr-1.5 h-4 w-4" />{t("price_add_tier")}</Button>
                  </li>
                );
              })}
            </ul>
          )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("price_search")} aria-label={t("price_search")} className="pl-9" />
      </div>
      {q.trim() && (results.length === 0
        ? <p className="text-sm text-muted-foreground">{t("price_no_results")}</p>
        : (
          <ul className="divide-y rounded-[14px] border">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { add(p.id); setQ(""); }} className="flex w-full items-center gap-3 p-2.5 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[p.sku, money(p.price)].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-orange-text"><Plus className="h-3.5 w-3.5" />{t("price_add")}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      <div className="flex items-center justify-end gap-3 border-t pt-3">
        {dirty && <span className="text-xs font-medium text-amber-700">{valid ? t("unsaved") : t("price_invalid")}</span>}
        <Button onClick={submit} disabled={save.isPending || !dirty || !valid}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t("price_save")}
        </Button>
      </div>
    </section>
  );
}
