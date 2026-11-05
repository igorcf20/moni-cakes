// =====================================================================================
// Admin > Catálogo > Armazéns (recurso warehouses em Admin > Recursos da loja). Sem janelas:
//   Armazéns     números, aviso de estoque fora dos armazéns (com carga num clique), lista de armazéns
//   armazem      (ver=armazem&id=<id> ou id=novo) dados, países atendidos, prioridade, padrão, pausa; unidades e
//                movimentos deste armazém; apagar só sem unidades
//   Estoque      cada parte (produto, cor, tamanho, cor x tamanho) com unidades por armazém; painel na página para
//                ajustar num armazém (com motivo, entra no Histórico de estoque) ou transferir entre armazéns
//   Movimentos   ajustes, transferências e cargas, com quem fez
// Bloco na página do pedido (de onde saiu cada item): orders/OrderWarehousesPanel.tsx.
// Regras no banco (migration 20261007120000_warehouses.sql); contas em src/lib/warehouses.ts; textos em
// src/i18n/adminWarehouses.ts.
// =====================================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRightLeft, Boxes, ChevronRight, History, Loader2, PackageOpen, Plus, Search, SlidersHorizontal, Star, Trash2, Warehouse as WarehouseIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import { AdminPager, AdminStatCard, FilterChips } from "./AdminListKit";
import { InlinePanel } from "./shell/AdminPageParts";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { useLocale, useMessages } from "@/i18n";
import { adminWarehousesMessages } from "@/i18n/adminWarehouses";
import { useAdminFormat } from "@/hooks/useAdminList";
import { countryName, useCountries } from "@/lib/countries";
import {
  useDeleteWarehouse, useSaveWarehouse, useWarehouseLoad, useWarehouseMoves, useWarehouses, useWarehouseSet,
  useWarehouseSlots, useWarehouseSummary, useWarehouseTransfer, type SlotScope, type WarehouseMove, type WarehouseSlot,
} from "@/hooks/useWarehouses";
import {
  parseCountryList, pickOrder, slotKey, slotLabel, WAREHOUSE_REASONS, warehouseDraftErrors, warehouseErrorOf, warehousePlace,
  type Warehouse, type WarehouseDraft, type WarehouseReason,
} from "@/lib/warehouses";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof adminWarehousesMessages["pt-BR"]>>["t"];
const PAGE_SIZE = 25;

const Loading = ({ t }: { t: T }) => (
  <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>
);
const LoadError = ({ t }: { t: T }) => (
  <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("load_error")}</p>
);
const errText = (t: T, e: unknown) => t(`err_${warehouseErrorOf((e as Error)?.message)}`);

function Chip({ tone = "muted", children }: { tone?: "muted" | "orange" | "amber" | "sky"; children: React.ReactNode }) {
  const cls = tone === "orange" ? "bg-primary/10 text-brand-orange-text" : tone === "amber" ? "bg-amber-50 text-amber-800" : tone === "sky" ? "bg-sky-50 text-sky-700" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>{children}</span>;
}

/** "Atende primeiro: Brasil, Portugal" ou "Atende todos os países". */
function servesText(t: T, w: Pick<Warehouse, "serves_countries">, locale: string) {
  return w.serves_countries.length
    ? t("serves_some", { list: w.serves_countries.map((c) => countryName(c, locale as never)).join(", ") })
    : t("serves_all");
}

export default function AdminWarehouses() {
  const { t } = useMessages(adminWarehousesMessages);
  const page = useAdminPage();
  const tab = page.tab === "estoque" || page.tab === "movimentos" ? page.tab : "armazens";
  if (page.view === "armazem" && page.id) return <WarehousePage id={page.id} onBack={page.close} onOpen={(id) => page.open("armazem", id)} />;
  return (
    <div className="space-y-5">
      <AdminHelp id="warehouses" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4")]} />
      <Tabs value={tab} onValueChange={page.setTab}>
        <TabsList className="h-11 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="armazens" className="px-4">{t("tab_list")}</TabsTrigger>
          <TabsTrigger value="estoque" className="px-4">{t("tab_stock")}</TabsTrigger>
          <TabsTrigger value="movimentos" className="px-4">{t("tab_moves")}</TabsTrigger>
        </TabsList>
        <TabsContent value="armazens" className="mt-5"><WarehouseList onOpen={(id) => page.open("armazem", id)} onStock={() => page.setTab("estoque")} /></TabsContent>
        <TabsContent value="estoque" className="mt-5"><StockGrid /></TabsContent>
        <TabsContent value="movimentos" className="mt-5"><MovesList warehouseId={null} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Armazéns ---------- */

/** Aviso "partes fora dos armazéns" com o botão de carga no armazém padrão. */
function LoadBanner({ warehouses, productId = null }: { warehouses: Warehouse[]; productId?: string | null }) {
  const { t } = useMessages(adminWarehousesMessages);
  const outside = useWarehouseSlots({ q: "", scope: "unmanaged", productId, page: 1, pageSize: 1 });
  const load = useWarehouseLoad();
  const { ask, confirmSlot } = useInlineConfirm();
  const def = warehouses.find((w) => w.is_default) ?? warehouses[0];
  const n = outside.data?.total ?? 0;
  if (!def || n === 0) return null;
  const run = async () => {
    if (!(await ask(t("load_confirm", { name: def.name }), { description: t("load_confirm_d"), confirmLabel: t("load_btn", { name: def.name }) }))) return;
    try {
      const done = await load.mutateAsync({ warehouseId: def.id, productId });
      toast.success(t("load_done", { n: done }));
    } catch (e) {
      toast.error(errText(t, e));
    }
  };
  return (
    <div className="space-y-2 rounded-[18px] border border-amber-200 bg-amber-50/70 p-4">
      <p className="flex items-start gap-2 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        <span>{n === 1 ? t("outside_one") : t("outside", { n })} {t("outside_d")}</span>
      </p>
      <Button size="sm" onClick={() => void run()} disabled={load.isPending}>
        {load.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageOpen className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
        {t("load_btn", { name: def.name })}
      </Button>
      {confirmSlot}
    </div>
  );
}

function WarehouseList({ onOpen, onStock }: { onOpen: (id: string) => void; onStock: () => void }) {
  const { t } = useMessages(adminWarehousesMessages);
  const locale = useLocale((s) => s.locale);
  const { data: list = [], isLoading, error } = useWarehouses();
  const { data: summary = {} } = useWarehouseSummary();
  const low = useWarehouseSlots({ q: "", scope: "low", page: 1, pageSize: 1 });
  const units = Object.values(summary).reduce((s, x) => s + x.units, 0);

  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;
  if (!list.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-10 text-center">
        <WarehouseIcon className="h-8 w-8 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">{t("empty_all")}</p>
        <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new_first")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard icon={WarehouseIcon} label={t("stat_warehouses")} value={list.filter((w) => w.is_active).length} hint={list.some((w) => !w.is_active) ? t("stat_paused", { n: list.filter((w) => !w.is_active).length }) : undefined} />
        <AdminStatCard icon={Boxes} label={t("stat_units")} value={units} />
        <AdminStatCard icon={AlertTriangle} label={t("stat_low")} value={low.data?.total ?? 0} tone={(low.data?.total ?? 0) > 0 ? "warning" : "default"} onClick={onStock} />
        <AdminStatCard icon={Star} label={t("stat_default")} value={list.find((w) => w.is_default)?.name ?? "-"} />
      </div>

      <LoadBanner warehouses={list} />

      <div className="flex justify-end">
        <Button onClick={() => onOpen("novo")}><Plus className="mr-1.5 h-4 w-4" />{t("new")}</Button>
      </div>

      <ul className="space-y-3">
        {pickOrder(list).map((w, i) => {
          const s = summary[w.id];
          return (
            <li key={w.id}>
              <button type="button" onClick={() => onOpen(w.id)} className="flex w-full flex-col gap-2 rounded-[18px] border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-sm font-bold tabular-nums text-muted-foreground" title={t("order_pos")}>{i + 1}</span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{w.name}</span>
                      {w.code && <Chip>{w.code}</Chip>}
                      {w.is_default && <Chip tone="orange">{t("badge_default")}</Chip>}
                      {!w.is_active && <Chip tone="amber">{t("badge_paused")}</Chip>}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {[warehousePlace(w), servesText(t, w, locale), t("priority_n", { n: w.priority })].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-3 self-end sm:self-auto">
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{t("units_n", { n: s?.units ?? 0 })}</span>
                    <span className="block text-xs text-muted-foreground">{t("products_n", { n: s?.products ?? 0 })}</span>
                  </span>
                  <ChevronRight className="hidden h-4 w-4 text-brand-orange-text sm:block" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t("list_order_hint")}</p>
    </div>
  );
}

/* ---------- Página do armazém ---------- */

const EMPTY: WarehouseDraft = { name: "", code: null, address: null, city: null, country: null, serves_countries: [], priority: 100, is_default: false, is_active: true, notes: null };

function WarehousePage({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const { t } = useMessages(adminWarehousesMessages);
  const locale = useLocale((s) => s.locale);
  const isNew = id === "novo";
  const { data: list = [], isLoading } = useWarehouses();
  const { data: summary = {} } = useWarehouseSummary();
  const { data: countries = [] } = useCountries();
  const w = list.find((x) => x.id === id);
  const save = useSaveWarehouse();
  const del = useDeleteWarehouse();
  const { ask, confirmSlot } = useInlineConfirm();
  const [f, setF] = useState<WarehouseDraft>(EMPTY);
  const [servesText_, setServesText] = useState("");
  const [tried, setTried] = useState(false);

  useEffect(() => {
    const src = w ?? { ...EMPTY, is_default: !list.length };
    setF({ ...src });
    setServesText(src.serves_countries.join(", "));
  }, [w, list.length]);

  if (isLoading) return <Loading t={t} />;
  if (!isNew && !w) {
    return <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}><p className="text-sm text-muted-foreground">{t("not_found_hint")}</p></AdminSubpage>;
  }

  const errs = warehouseDraftErrors(f, list, isNew ? null : id);
  const s = w ? summary[w.id] : undefined;
  const set = <K extends keyof WarehouseDraft>(k: K, v: WarehouseDraft[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggleCountry = (c: string) => {
    const next = f.serves_countries.includes(c) ? f.serves_countries.filter((x) => x !== c) : parseCountryList([...f.serves_countries, c]);
    set("serves_countries", next);
    setServesText(next.join(", "));
  };

  const submit = async () => {
    setTried(true);
    if (errs.length) return;
    try {
      const newId = await save.mutateAsync({ id: isNew ? null : id, draft: { ...f, serves_countries: parseCountryList(servesText_) } });
      toast.success(t("saved"));
      if (isNew) onOpen(newId);
    } catch (e) {
      toast.error(String((e as Error)?.message ?? "").includes("warehouses_code_key") ? t("err_code_taken") : t("save_error"));
    }
  };
  const remove = async () => {
    if (!w) return;
    if ((s?.units ?? 0) > 0) { toast.error(t("err_warehouse_has_stock")); return; }
    if (!(await ask(t("delete_confirm", { name: w.name }), { confirmLabel: t("delete"), tone: "danger" }))) return;
    try {
      await del.mutateAsync(w.id);
      toast.success(t("deleted"));
      onBack();
    } catch (e) {
      toast.error(errText(t, e));
    }
  };

  return (
    <AdminSubpage
      title={isNew ? t("new") : w!.name}
      subtitle={isNew ? t("new_d") : [w!.code, warehousePlace(w!)].filter(Boolean).join(" · ") || undefined}
      backLabel={t("back")}
      onBack={onBack}
      actions={!isNew && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={del.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("delete")}</Button>}
    >
      {confirmSlot}
      {!isNew && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminStatCard icon={Boxes} label={t("stat_units")} value={s?.units ?? 0} />
          <AdminStatCard icon={PackageOpen} label={t("stat_products")} value={s?.products ?? 0} hint={t("parts_n", { n: s?.slots ?? 0 })} />
          <AdminStatCard icon={AlertTriangle} label={t("stat_empty")} value={s?.empty ?? 0} tone={(s?.empty ?? 0) > 0 ? "warning" : "default"} />
          <AdminStatCard icon={Star} label={t("stat_role")} value={w!.is_default ? t("badge_default") : w!.is_active ? t("badge_active") : t("badge_paused")} />
        </div>
      )}

      <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
        <h4 className="font-semibold">{t("form_title")}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wh-name">{t("f_name")}</Label>
            <Input id="wh-name" value={f.name} maxLength={120} onChange={(e) => set("name", e.target.value)} placeholder={t("f_name_ph")} aria-invalid={tried && errs.includes("name")} />
            {tried && errs.includes("name") && <p className="text-xs text-destructive">{t("err_name")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-code">{t("f_code")}</Label>
            <Input id="wh-code" value={f.code ?? ""} maxLength={30} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="SP-01" aria-invalid={errs.includes("code_taken")} />
            {errs.includes("code_taken") ? <p className="text-xs text-destructive">{t("err_code_taken")}</p> : <p className="text-xs text-muted-foreground">{t("f_code_d")}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="wh-address">{t("f_address")}</Label>
            <Textarea id="wh-address" rows={2} maxLength={500} value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-city">{t("f_city")}</Label>
            <Input id="wh-city" value={f.city ?? ""} maxLength={120} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-country">{t("f_country")}</Label>
            <Input id="wh-country" value={f.country ?? ""} maxLength={2} className="max-w-[120px] uppercase" onChange={(e) => set("country", e.target.value.replace(/[^a-z]/gi, "").toUpperCase() || null)} placeholder="BR" />
            {f.country && f.country.length === 2 && <p className="text-xs text-muted-foreground">{countryName(f.country, locale)}</p>}
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="wh-serves">{t("f_serves")}</Label>
          <p className="text-xs text-muted-foreground">{t("f_serves_d")}</p>
          {countries.length > 0 && (
            <div role="group" aria-label={t("f_serves")} className="flex flex-wrap gap-2">
              {countries.map((c) => {
                const on = f.serves_countries.includes(c.code);
                return (
                  <button key={c.code} type="button" aria-pressed={on} onClick={() => toggleCountry(c.code)}
                    className={cn("inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/40")}>
                    {countryName(c.code, locale)}
                  </button>
                );
              })}
            </div>
          )}
          <Input id="wh-serves" value={servesText_} onChange={(e) => setServesText(e.target.value)}
            onBlur={() => { const l = parseCountryList(servesText_); set("serves_countries", l); setServesText(l.join(", ")); }} placeholder="BR, PT, ES" />
          <p className="text-xs text-muted-foreground">{servesText(t, { serves_countries: parseCountryList(servesText_) }, locale)}</p>
        </div>

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wh-prio">{t("f_priority")}</Label>
            <Input id="wh-prio" inputMode="numeric" className="max-w-[140px]" value={String(f.priority)} onChange={(e) => set("priority", Number(e.target.value.replace(/\D/g, "").slice(0, 5) || 0))} />
            <p className="text-xs text-muted-foreground">{t("f_priority_d")}</p>
          </div>
          <div className="space-y-3">
            <label className="flex items-start justify-between gap-3">
              <span><span className="block text-sm font-medium">{t("f_default")}</span><span className="block text-xs text-muted-foreground">{t("f_default_d")}</span></span>
              <Switch checked={f.is_default} disabled={!!w?.is_default} onCheckedChange={(v) => set("is_default", v)} aria-label={t("f_default")} />
            </label>
            <label className="flex items-start justify-between gap-3">
              <span><span className="block text-sm font-medium">{t("f_active")}</span><span className="block text-xs text-muted-foreground">{t("f_active_d")}</span></span>
              <Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} aria-label={t("f_active")} />
            </label>
          </div>
        </div>

        <div className="space-y-1.5 border-t pt-4">
          <Label htmlFor="wh-notes">{t("f_notes")}</Label>
          <Textarea id="wh-notes" rows={2} maxLength={2000} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder={t("f_notes_ph")} />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void submit()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{isNew ? t("create") : t("save")}</Button>
        </div>
      </section>

      {!isNew && w && (
        <>
          <section className="space-y-3">
            <h4 className="font-semibold">{t("here_stock")}</h4>
            <StockGrid warehouseId={w.id} />
          </section>
          <section className="space-y-3">
            <h4 className="font-semibold">{t("here_moves")}</h4>
            <MovesList warehouseId={w.id} />
          </section>
        </>
      )}
    </AdminSubpage>
  );
}

/* ---------- Estoque por armazém ---------- */

function StockGrid({ warehouseId = null }: { warehouseId?: string | null }) {
  const { t } = useMessages(adminWarehousesMessages);
  const { data: list = [], isLoading: wLoading } = useWarehouses();
  const [scope, setScope] = useState<SlotScope>(warehouseId ? "warehouse" : "all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setPage(1), [scope, q]);
  const filters = { q, scope, warehouseId, page, pageSize: PAGE_SIZE };
  const { data, isLoading, error, isFetching } = useWarehouseSlots(filters);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cols = useMemo(() => (warehouseId ? list.filter((w) => w.id === warehouseId) : pickOrder(list)), [list, warehouseId]);

  if (wLoading) return <Loading t={t} />;
  if (!list.length) return <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("empty_all")}</p>;

  return (
    <div className="space-y-4">
      {!warehouseId && <LoadBanner warehouses={list} />}
      <div className="flex flex-col gap-3 rounded-[18px] border bg-card p-4">
        {!warehouseId && (
          <FilterChips<SlotScope>
            label={t("f_label")}
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: t("s_all") },
              { value: "managed", label: t("s_managed") },
              { value: "unmanaged", label: t("s_unmanaged") },
              { value: "low", label: t("s_low") },
            ]}
          />
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-9" />
        </div>
      </div>

      {isLoading ? <Loading t={t} /> : error ? <LoadError t={t} /> : rows.length === 0 ? (
        <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{warehouseId ? t("here_empty") : t("stock_empty")}</p>
      ) : (
        <ul className={cn("divide-y rounded-[18px] border bg-card transition-opacity duration-150", isFetching && "opacity-70")}>
          {rows.map((r) => {
            const key = slotKey(r);
            return (
              <SlotRow key={key} row={r} cols={cols} all={list} open={open === key} onToggle={() => setOpen(open === key ? null : key)} />
            );
          })}
        </ul>
      )}
      <AdminPager page={page} pages={pages} total={total} from={total ? (page - 1) * PAGE_SIZE + 1 : 0} to={Math.min(total, page * PAGE_SIZE)} onPage={setPage} />
    </div>
  );
}

function SlotRow({ row, cols, all, open, onToggle }: { row: WarehouseSlot; cols: Warehouse[]; all: Warehouse[]; open: boolean; onToggle: () => void }) {
  const { t } = useMessages(adminWarehousesMessages);
  const label = slotLabel(row);
  return (
    <li className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
            {row.product_image ? <img src={row.product_image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Boxes className="m-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link to={adminHref.productStats(row.product_id)} className="min-w-0 break-words font-semibold hover:underline">{row.product_name}</Link>
              {label && <span className="text-sm text-muted-foreground">{label}</span>}
              {!row.managed && <Chip tone="amber">{t("badge_outside")}</Chip>}
            </div>
            <p className="text-sm text-muted-foreground">{[row.sku, t("total_n", { n: row.stock })].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {cols.map((w) => {
            const n = row.per_warehouse[w.id];
            return (
              <span key={w.id} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-sm", n == null ? "border-dashed text-muted-foreground" : n <= 2 ? "border-amber-200 bg-amber-50 text-amber-900" : "bg-background")}>
                <span className="max-w-[9rem] truncate">{w.code || w.name}</span>
                <span className="font-bold tabular-nums">{n ?? 0}</span>
              </span>
            );
          })}
          <Button variant="outline" size="sm" className="min-h-9" onClick={onToggle} aria-expanded={open}>
            <SlidersHorizontal className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("manage")}
          </Button>
        </div>
      </div>
      <InlinePanel open={open} onClose={onToggle} title={[row.product_name, label].filter(Boolean).join(" / ")} description={row.managed ? t("panel_d") : t("panel_d_outside")} className="mt-3">
        <SlotActions row={row} all={all} onDone={onToggle} />
      </InlinePanel>
    </li>
  );
}

function SlotActions({ row, all, onDone }: { row: WarehouseSlot; all: Warehouse[]; onDone: () => void }) {
  const { t } = useMessages(adminWarehousesMessages);
  const ordered = pickOrder(all);
  const def = all.find((w) => w.is_default) ?? ordered[0];
  const [mode, setMode] = useState<"adjust" | "transfer">("adjust");
  const [wh, setWh] = useState(def?.id ?? "");
  const [how, setHow] = useState<"set" | "add">("add");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<WarehouseReason>("receive");
  const [note, setNote] = useState("");
  const [from, setFrom] = useState(() => ordered.find((w) => (row.per_warehouse[w.id] ?? 0) > 0)?.id ?? def?.id ?? "");
  const [to, setTo] = useState(() => ordered.find((w) => w.id !== from)?.id ?? "");
  const [qty, setQty] = useState("");
  const adjust = useWarehouseSet();
  const transfer = useWarehouseTransfer();
  const slot = { productId: row.product_id, variationId: row.variation_id, sizeId: row.size_id };
  const current = row.managed ? (row.per_warehouse[wh] ?? 0) : wh === def?.id ? row.stock : 0;
  const n = Number(value.replace(",", "."));
  const preview = value.trim() && Number.isFinite(n) ? (how === "set" ? n : current + n) : null;

  const runAdjust = async () => {
    if (!wh || preview == null || preview < 0 || !Number.isInteger(n)) { toast.error(t("err_invalid_value")); return; }
    try {
      const total = await adjust.mutateAsync({ ...slot, warehouseId: wh, mode: how, value: n, reason, note });
      toast.success(t("adjusted", { n: total }));
      onDone();
    } catch (e) { toast.error(errText(t, e)); }
  };
  const runTransfer = async () => {
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) { toast.error(t("err_invalid_value")); return; }
    try {
      await transfer.mutateAsync({ ...slot, from, to, quantity: q, note });
      toast.success(t("transferred"));
      onDone();
    } catch (e) { toast.error(errText(t, e)); }
  };
  const whSelect = (id: string, v: string, on: (v: string) => void, exclude?: string) => (
    <Select value={v} onValueChange={on}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent>
        {ordered.filter((w) => w.id !== exclude).map((w) => (
          <SelectItem key={w.id} value={w.id}>{w.name} ({row.managed ? (row.per_warehouse[w.id] ?? 0) : w.id === def?.id ? row.stock : 0})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const busy = adjust.isPending || transfer.isPending;

  return (
    <div className="space-y-4">
      <FilterChips<"adjust" | "transfer">
        label={t("manage")}
        value={mode}
        onChange={setMode}
        options={[{ value: "adjust", label: t("m_adjust") }, ...(all.length > 1 ? [{ value: "transfer" as const, label: t("m_transfer") }] : [])]}
      />
      {mode === "adjust" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="wa-wh">{t("a_warehouse")}</Label>{whSelect("wa-wh", wh, setWh)}</div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-value">{how === "set" ? t("a_set") : t("a_add")}</Label>
            <div className="flex gap-2">
              <FilterChips<"set" | "add"> label={t("a_how")} value={how} onChange={setHow} options={[{ value: "add", label: t("a_how_add") }, { value: "set", label: t("a_how_set") }]} />
              <Input id="wa-value" inputMode="numeric" className="max-w-[120px]" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, "").slice(0, 8))} placeholder={how === "add" ? "+10" : "0"} />
            </div>
            <p className="text-xs text-muted-foreground">{preview == null ? t("a_now", { n: current }) : t("a_preview", { from: current, to: preview })}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-reason">{t("a_reason")}</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as WarehouseReason)}>
              <SelectTrigger id="wa-reason"><SelectValue /></SelectTrigger>
              <SelectContent>{WAREHOUSE_REASONS.map((r) => <SelectItem key={r} value={r}>{t(`r_${r}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="wa-note">{t("a_note")}</Label><Input id="wa-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("a_note_ph")} /></div>
          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={onDone}>{t("cancel")}</Button>
            <Button onClick={() => void runAdjust()} disabled={busy}>{adjust.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("a_save")}</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="wt-from">{t("t_from")}</Label>{whSelect("wt-from", from, (v) => { setFrom(v); if (v === to) setTo(ordered.find((w) => w.id !== v)?.id ?? ""); })}</div>
          <div className="space-y-1.5"><Label htmlFor="wt-to">{t("t_to")}</Label>{whSelect("wt-to", to, setTo, from)}</div>
          <div className="space-y-1.5"><Label htmlFor="wt-qty">{t("t_qty")}</Label><Input id="wt-qty" inputMode="numeric" className="max-w-[140px]" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 7))} /></div>
          <div className="space-y-1.5"><Label htmlFor="wt-note">{t("a_note")}</Label><Input id="wt-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("t_note_ph")} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t("t_hint")}</p>
          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={onDone}>{t("cancel")}</Button>
            <Button onClick={() => void runTransfer()} disabled={busy || !from || !to}>{transfer.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}<ArrowRightLeft className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("t_save")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Movimentos ---------- */

function MovesList({ warehouseId }: { warehouseId: string | null }) {
  const { t } = useMessages(adminWarehousesMessages);
  const { dateTime } = useAdminFormat();
  const { data: list = [] } = useWarehouses();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useWarehouseMoves(warehouseId, page, PAGE_SIZE);
  const name = (id: string | null) => list.find((w) => w.id === id)?.name ?? t("removed");
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  if (isLoading) return <Loading t={t} />;
  if (error) return <LoadError t={t} />;
  if (!rows.length) return <p className="rounded-[18px] border border-dashed p-10 text-center text-sm text-muted-foreground">{t("moves_empty")}</p>;
  const what = (m: WarehouseMove) =>
    m.kind === "transfer" ? t("mv_transfer", { n: m.quantity, from: name(m.from_warehouse), to: name(m.to_warehouse) })
      : m.kind === "load" ? t("mv_load", { n: m.quantity, to: name(m.to_warehouse) })
      : t("mv_adjust", { to: name(m.to_warehouse), from: m.quantity_before ?? 0, after: m.quantity_after ?? 0 });
  return (
    <div>
      <ul className="divide-y rounded-[18px] border bg-card">
        {rows.map((m) => (
          <li key={m.id} className="flex gap-3 p-3 sm:p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted">
              {m.kind === "transfer" ? <ArrowRightLeft className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} /> : m.kind === "load" ? <PackageOpen className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} /> : <History className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} />}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link to={adminHref.productStats(m.product_id)} className="font-semibold hover:underline">{m.product_name ?? t("removed")}</Link>
                {slotLabel(m) && <span className="text-sm text-muted-foreground">{slotLabel(m)}</span>}
                <Chip tone={m.kind === "transfer" ? "sky" : m.kind === "load" ? "muted" : "orange"}>{t(`k_${m.kind}`)}</Chip>
                {m.reason && <Chip>{t(`r_${m.reason as WarehouseReason}`)}</Chip>}
              </div>
              <p className="text-sm">{what(m)}</p>
              {m.note && <p className="text-sm text-muted-foreground">{m.note}</p>}
              <p className="text-xs text-muted-foreground">{[dateTime(m.created_at), m.actor_email].filter(Boolean).join(" · ")}</p>
            </div>
          </li>
        ))}
      </ul>
      <AdminPager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} from={(page - 1) * PAGE_SIZE + 1} to={Math.min(total, page * PAGE_SIZE)} onPage={setPage} />
    </div>
  );
}
