// =====================================================================================
// Admin > Frete e entrega: frete para qualquer país e transportadora (modelo de loja).
//
//   Formas de envio  tabela shipping_services: transportadora (catálogo em src/lib/carriers.ts) + serviço,
//                    preço pela tabela da loja ou cotação automática (conta Melhor Envio / Sendcloud em
//                    Admin > Integrações), peso máximo, peso volumétrico, produtos e classes de produto recusados,
//                    base do preço (peso, itens, valor ou preço único), taxa fixa, percentual e frete mínimo.
//   Preços           tabela shipping_service_rates: forma de envio x zona x faixa (de peso, itens ou valor), em
//                    centavos da moeda da zona.
//   Zonas            tabela shipping_regions: países ('*' = resto do mundo), estados/distritos, códigos postais.
//   Simular frete    chama a função shipping-quote em modo admin (peso e valor dados).
//   Retirada         o editor antigo das formas de entrega (AdminDeliveryMethods): retirada na loja e
//                    entregas antigas, usadas enquanto nenhuma forma de envio estiver ligada.
// O preço é sempre calculado no servidor (supabase/functions/_shared/shipping/). Textos em src/i18n/adminShipping.ts.
// =====================================================================================
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Ban, Calculator, Globe2, Loader2, MapPin, Pencil, Plus, Search, Store, Table2, Trash2, Truck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminHelp from "./AdminHelp";
import AdminSubpage, { useAdminPage } from "./AdminSubpage";
import AdminDeliveryMethods from "./AdminDeliveryMethods";
import ShippingEstimateSettings from "./ShippingEstimateSettings";
import { shippingEstimateMessages } from "@/i18n/shippingEstimate";
import { CARRIERS, carrierInfo } from "@/lib/carriers";
import { FALLBACK_COUNTRIES, countryName, useCountries } from "@/lib/countries";
import { addressFormat, regionToValue } from "@/lib/addressFormats";
import { currencyDigits, formatCents, fromCents, toCents } from "@/lib/money";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useMessages } from "@/i18n";
import { adminShippingMessages, type AdminShippingKey } from "@/i18n/adminShipping";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";

type Service = {
  id: string; carrier: string; name: string; description_i18n: Record<string, string>; calc_mode: "table" | "api";
  api_provider: string | null; api_service_code: string | null; ships_from: string | null; handling_days: number;
  allow_free_shipping: boolean; max_weight_kg: number | null; volumetric_divisor: number | null;
  excluded_classes: string[]; tracking_url: string | null; is_active: boolean; display_order: number;
  excluded_products: string[]; rate_basis: RateBasis; fee_cents: number; fee_percent: number | string; min_price_cents: number | null;
};
/** O que escolhe a linha da tabela (igual a _shared/shipping/rules.ts). */
type RateBasis = "weight" | "items" | "subtotal" | "flat";
const RATE_BASES: RateBasis[] = ["weight", "items", "subtotal", "flat"];
type Zone = {
  id: string; name: string; countries: string[]; regions: string[]; postal_codes: string[]; currency: string;
  is_active: boolean; display_order: number;
};
type RateRow = {
  id?: string; region_id: string; min_weight_kg: string; max_weight_kg: string; price: string; extra: string;
  days_min: string; days_max: string; free_from: string;
};

const db = supabase as any;
const KEY = ["adminShipping"] as const;
const CURRENCIES = ["BRL", "EUR", "USD", "GBP"];
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const numOrNull = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s.replace(",", "."))) ? null : Number(s.replace(",", ".")));
const dec = (s: string) => numOrNull(s) ?? 0;
/** Número para um campo de texto no formato do idioma (vírgula em pt e es), sem separador de milhar. */
const fieldNum = (n: number, locale: string, digits?: number) =>
  new Intl.NumberFormat(locale, { useGrouping: false, minimumFractionDigits: digits ?? 0, maximumFractionDigits: digits ?? 3 }).format(n);

function useShippingData() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const [services, zones, rates] = await Promise.all([
        db.from("shipping_services").select("*").order("display_order"),
        db.from("shipping_regions").select("*").order("display_order"),
        db.from("shipping_service_rates").select("*").order("min_weight_kg"),
      ]);
      for (const r of [services, zones, rates]) if (r.error) throw r.error;
      return { services: (services.data ?? []) as Service[], zones: (zones.data ?? []) as Zone[], rates: (rates.data ?? []) as any[] };
    },
  });
}

// Criar e editar formas de envio, preços e zonas abre uma página própria (?ver=forma|precos|zona&id=), sem janelas.
const AdminShipping = () => {
  const { t } = useMessages(adminShippingMessages);
  const { t: te } = useMessages(shippingEstimateMessages);
  const page = useAdminPage();
  const qc = useQueryClient();
  const { data } = useShippingData();
  if (page.view && data) {
    const refresh = () => qc.invalidateQueries({ queryKey: KEY });
    const newId = page.id === "nova";
    if (page.view === "forma") {
      const value = newId
        ? { carrier: "correios", calc_mode: "table" as const, allow_free_shipping: true, handling_days: 0, excluded_classes: [], excluded_products: [], rate_basis: "weight" as const, fee_cents: 0, fee_percent: 0, min_price_cents: null, is_active: false, display_order: data.services.length }
        : data.services.find((s) => s.id === page.id);
      if (value) return <ServicePage key={page.id} value={value} onClose={page.close} onSaved={refresh} />;
    }
    if (page.view === "precos") {
      const service = data.services.find((s) => s.id === page.id);
      if (service) return <RatesPage key={service.id} service={service} zones={data.zones} rates={data.rates.filter((r) => r.service_id === service.id)} onClose={page.close} onSaved={refresh} />;
    }
    if (page.view === "zona") {
      const value = newId
        ? { countries: [], regions: [], postal_codes: [], currency: "BRL", is_active: true, display_order: data.zones.length }
        : data.zones.find((z) => z.id === page.id);
      if (value) return <ZonePage key={page.id} value={value} onClose={page.close} onSaved={refresh} />;
    }
  }
  return (
    <div className="space-y-6">
      <AdminHelp id="frete" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3"), t("help_4"), t("help_5")]} />
      <Tabs value={page.tab ?? "services"} onValueChange={page.setTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="services" className="gap-2"><Truck className="h-4 w-4" strokeWidth={1.8} /> {t("tab_services")}</TabsTrigger>
          <TabsTrigger value="zones" className="gap-2"><Globe2 className="h-4 w-4" strokeWidth={1.8} /> {t("tab_zones")}</TabsTrigger>
          <TabsTrigger value="simulate" className="gap-2"><Calculator className="h-4 w-4" strokeWidth={1.8} /> {t("tab_simulate")}</TabsTrigger>
          <TabsTrigger value="pickup" className="gap-2"><Store className="h-4 w-4" strokeWidth={1.8} /> {t("tab_pickup")}</TabsTrigger>
          <TabsTrigger value="calculadora" className="gap-2"><MapPin className="h-4 w-4" strokeWidth={1.8} /> {te("a_tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="services"><ServicesTab /></TabsContent>
        <TabsContent value="zones"><ZonesTab /></TabsContent>
        <TabsContent value="simulate"><SimulateTab /></TabsContent>
        <TabsContent value="pickup"><AdminDeliveryMethods /></TabsContent>
        <TabsContent value="calculadora"><ShippingEstimateSettings /></TabsContent>
      </Tabs>
    </div>
  );
};

// ── Formas de envio ─────────────────────────────────────────────────────────
const ServicesTab = () => {
  const { t } = useMessages(adminShippingMessages);
  const qc = useQueryClient();
  const { data, isLoading, isError } = useShippingData();
  const page = useAdminPage();
  const { ask, confirmSlot } = useInlineConfirm();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>;
  if (isError || !data) return <p className="p-6 text-sm text-destructive">{t("load_error")}</p>;
  const { services, rates } = data;

  const toggle = async (s: Service, on: boolean) => {
    const { error } = await db.from("shipping_services").update({ is_active: on }).eq("id", s.id);
    if (error) toast.error(t("save_error"));
    refresh();
  };
  const move = async (idx: number, dir: -1 | 1) => {
    const a = services[idx], b = services[idx + dir];
    if (!a || !b) return;
    const ao = a.display_order === b.display_order ? idx : a.display_order;
    const bo = a.display_order === b.display_order ? idx + dir : b.display_order;
    await db.from("shipping_services").update({ display_order: bo }).eq("id", a.id);
    await db.from("shipping_services").update({ display_order: ao }).eq("id", b.id);
    refresh();
  };
  const remove = async (s: Service) => {
    if (!(await ask(t("confirm_delete_service")))) return;
    const { error } = await db.from("shipping_services").delete().eq("id", s.id);
    if (error) toast.error(t("save_error")); else toast.success(t("deleted"));
    refresh();
  };

  return (
    <div className="space-y-4">
      {confirmSlot}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => page.open("forma", "nova")}>
          <Plus className="h-4 w-4 mr-1.5" /> {t("new_service")}
        </Button>
      </div>
      {services.length === 0 && (
        <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("services_empty")}</div>
      )}
      {services.map((s, i) => {
        const n = rates.filter((r) => r.service_id === s.id).length;
        return (
          <Card key={s.id} className="rounded-2xl">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Truck className="h-5 w-5 text-brand-orange-text" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {carrierInfo(s.carrier)?.name ?? s.carrier} · {s.calc_mode === "api" ? t("mode_badge_api") : t("mode_badge_table")} · {t(`basis_${s.rate_basis ?? "weight"}` as AdminShippingKey)} · {n ? t("rates_count", { n }) : t("rates_none")}
                    {(s.excluded_products?.length ?? 0) + (s.excluded_classes?.length ?? 0) > 0 && <> · <Ban className="inline h-3 w-3 -mt-0.5" /> {(s.excluded_products?.length ?? 0) + (s.excluded_classes?.length ?? 0)}</>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? t("active") : t("inactive")}</Badge>
                <Switch checked={s.is_active} onCheckedChange={(v) => toggle(s, v)} aria-label={t("active")} />
                <Button size="sm" variant="outline" onClick={() => page.open("precos", s.id)}><Table2 className="h-4 w-4 mr-1.5" />{t("edit_rates")}</Button>
                <Button size="icon" variant="ghost" onClick={() => page.open("forma", s.id)} aria-label={t("edit")}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("move_up")}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" disabled={i === services.length - 1} onClick={() => move(i, 1)} aria-label={t("move_down")}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(s)} aria-label={t("delete")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

const ServicePage = ({ value, onClose, onSaved }: { value: Partial<Service>; onClose: () => void; onSaved: () => void }) => {
  const { t, locale } = useMessages(adminShippingMessages);
  const { data: countries = FALLBACK_COUNTRIES } = useCountries();
  const { currency: base } = useAdminFormat(); // taxas e mínimo na moeda base da loja (como os preços)
  const moneyField = (cents: number | null | undefined) => (cents == null ? "" : fieldNum(fromCents(Number(cents), base), locale, currencyDigits(base)));
  const [f, setF] = useState({
    carrier: value.carrier ?? "custom",
    name: value.name ?? "",
    description: value.description_i18n?.[locale] ?? value.description_i18n?.["pt-BR"] ?? "",
    calc_mode: value.calc_mode ?? "table",
    api_provider: value.api_provider ?? carrierInfo(value.carrier)?.api ?? "",
    api_service_code: value.api_service_code ?? "",
    ships_from: value.ships_from ?? "",
    handling_days: String(value.handling_days ?? 0),
    allow_free_shipping: value.allow_free_shipping ?? true,
    max_weight_kg: value.max_weight_kg == null ? "" : String(value.max_weight_kg),
    volumetric_divisor: value.volumetric_divisor == null ? "" : String(value.volumetric_divisor),
    excluded_classes: value.excluded_classes ?? [],
    excluded_products: value.excluded_products ?? [],
    rate_basis: (value.rate_basis ?? "weight") as RateBasis,
    fee: Number(value.fee_cents) ? moneyField(value.fee_cents) : "",
    fee_percent: Number(value.fee_percent) ? fieldNum(Number(value.fee_percent), locale) : "",
    min_price: moneyField(value.min_price_cents),
    tracking_url: value.tracking_url ?? "",
    is_active: value.is_active ?? false,
  });
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const carrier = carrierInfo(f.carrier);

  const pickCarrier = (id: string) => {
    const c = carrierInfo(id);
    set({
      carrier: id,
      name: f.name || (c && c.services[0] ? `${c.name} ${c.services[0]}` : c?.name ?? ""),
      api_provider: c?.api ?? "",
      volumetric_divisor: f.volumetric_divisor || (c?.volumetricDivisor ? String(c.volumetricDivisor) : ""),
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        carrier: f.carrier,
        name: f.name.trim(),
        description_i18n: { ...(value.description_i18n ?? {}), [locale]: f.description.trim() },
        calc_mode: f.calc_mode,
        api_provider: f.calc_mode === "api" && f.api_provider ? f.api_provider : null,
        api_service_code: f.calc_mode === "api" ? f.api_service_code.trim() || null : null,
        ships_from: f.ships_from || null,
        handling_days: Math.max(0, Math.round(dec(f.handling_days))),
        allow_free_shipping: f.allow_free_shipping,
        max_weight_kg: numOrNull(f.max_weight_kg),
        volumetric_divisor: numOrNull(f.volumetric_divisor) ? Math.round(numOrNull(f.volumetric_divisor)!) : null,
        excluded_classes: f.excluded_classes,
        excluded_products: f.excluded_products,
        rate_basis: f.rate_basis,
        fee_cents: toCents(Math.max(0, dec(f.fee)), base),
        fee_percent: Math.min(100, Math.max(0, dec(f.fee_percent))),
        min_price_cents: numOrNull(f.min_price) == null ? null : toCents(Math.max(0, numOrNull(f.min_price)!), base),
        tracking_url: f.tracking_url.trim() || null,
        is_active: f.is_active,
      };
      const q = value.id
        ? db.from("shipping_services").update(row).eq("id", value.id)
        : db.from("shipping_services").insert({ ...row, display_order: value.display_order ?? 0 });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("saved")); onSaved(); onClose(); },
    onError: () => toast.error(t("save_error")),
  });

  return (
    <AdminSubpage title={value.id ? t("edit_service") : t("new_service")} subtitle={value.id ? value.name : undefined} backLabel={t("back_services")} onBack={onClose}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("carrier")}>
            <Select value={f.carrier} onValueChange={pickCarrier}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CARRIERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.countries[0] !== "*" ? ` (${c.countries.join(", ")})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("service_name")} hint={t("service_name_hint")}>
            <Input value={f.name} onChange={(e) => set({ name: e.target.value })} list="carrier-services" />
            <datalist id="carrier-services">{carrier?.services.map((s) => <option key={s} value={`${carrier.name} ${s}`} />)}</datalist>
          </Field>
          <Field label={t("description")} hint={t("description_hint")} wide>
            <Input value={f.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label={t("calc_mode")} wide>
            <Select value={f.calc_mode} onValueChange={(v) => set({ calc_mode: v as "table" | "api", api_provider: f.api_provider || carrier?.api || "melhor_envio" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="table">{t("mode_table")}</SelectItem>
                <SelectItem value="api">{t("mode_api")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {f.calc_mode === "api" && (
            <>
              <Field label={t("api_provider")}>
                <Select value={f.api_provider || "melhor_envio"} onValueChange={(v) => set({ api_provider: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="melhor_envio">Melhor Envio</SelectItem>
                    <SelectItem value="sendcloud">Sendcloud</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("api_code")} hint={f.api_provider === "sendcloud" ? t("api_code_hint_sc") : t("api_code_hint_me")}>
                <Input value={f.api_service_code} onChange={(e) => set({ api_service_code: e.target.value })} />
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">{t("api_missing")}</p>
            </>
          )}
          <Field label={t("ships_from")}>
            <Select value={f.ships_from || "-"} onValueChange={(v) => set({ ships_from: v === "-" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-">-</SelectItem>
                {countries.map((c) => <SelectItem key={c.code} value={c.code}>{countryName(c.code, locale)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("handling_days")} hint={t("handling_hint")}>
            <Input inputMode="numeric" value={f.handling_days} onChange={(e) => set({ handling_days: e.target.value })} />
          </Field>
          <Field label={t("max_weight")}>
            <Input inputMode="decimal" value={f.max_weight_kg} onChange={(e) => set({ max_weight_kg: e.target.value })} />
          </Field>
          <Field label={t("volumetric")} hint={t("volumetric_hint")}>
            <Input inputMode="numeric" value={f.volumetric_divisor} onChange={(e) => set({ volumetric_divisor: e.target.value })} />
          </Field>
          <Field label={t("tracking")} hint={t("tracking_hint")} wide>
            <Input value={f.tracking_url} placeholder={carrier?.tracking ?? "https://..."} onChange={(e) => set({ tracking_url: e.target.value })} />
          </Field>
          <SwitchRow label={t("allow_free")} hint={t("allow_free_hint")} checked={f.allow_free_shipping} onChange={(v) => set({ allow_free_shipping: v })} />
          <SwitchRow label={t("active")} checked={f.is_active} onChange={(v) => set({ is_active: v })} />
        </div>

        <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
          <h4 className="text-sm font-semibold">{t("sec_price")}</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("rate_basis")} hint={t(`basis_hint_${f.rate_basis}` as AdminShippingKey)} wide>
              <Select value={f.rate_basis} onValueChange={(v) => set({ rate_basis: v as RateBasis })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RATE_BASES.map((b) => <SelectItem key={b} value={b}>{t(`basis_${b}` as AdminShippingKey)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={t("fee", { currency: base })} hint={t("fee_hint")}>
              <Input inputMode="decimal" value={f.fee} placeholder="0" onChange={(e) => set({ fee: e.target.value })} />
            </Field>
            <Field label={t("fee_percent")} hint={t("fee_percent_hint")}>
              <Input inputMode="decimal" value={f.fee_percent} placeholder="0" onChange={(e) => set({ fee_percent: e.target.value })} />
            </Field>
            <Field label={t("min_price", { currency: base })} hint={t("min_price_hint")}>
              <Input inputMode="decimal" value={f.min_price} onChange={(e) => set({ min_price: e.target.value })} />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
          <h4 className="text-sm font-semibold">{t("sec_restrictions")}</h4>
          <ExcludedProducts value={f.excluded_products} onChange={(v) => set({ excluded_products: v })} />
          <ExcludedClasses value={f.excluded_classes} onChange={(v) => set({ excluded_classes: v })} />
        </section>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !f.name.trim()}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{save.isPending ? t("saving") : t("save")}
          </Button>
        </div>
    </AdminSubpage>
  );
};

// ── Restrições: produtos e classes de envio que a forma de envio não leva ────
function useShippingProducts() {
  return useQuery({
    queryKey: ["adminShippingProducts"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("products").select("id,name,shipping_class").order("name").limit(2000);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; shipping_class: string | null }[];
    },
  });
}

const Chip = ({ label, onRemove, removeLabel }: { label: string; onRemove: () => void; removeLabel: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full border bg-background py-1 pl-3 pr-1 text-sm">
    {label}
    <button type="button" onClick={onRemove} aria-label={removeLabel} className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      <X className="h-3.5 w-3.5" />
    </button>
  </span>
);

const ExcludedProducts = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => {
  const { t } = useMessages(adminShippingMessages);
  const { data: products = [] } = useShippingProducts();
  const [q, setQ] = useState("");
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matches = q.trim()
    ? products.filter((p) => !value.includes(p.id) && fold(p.name ?? "").includes(fold(q.trim()))).slice(0, 8)
    : [];
  return (
    <Field label={t("excluded_products")} hint={t("excluded_products_hint")} wide>
      <div className="flex flex-wrap gap-2">
        {value.length === 0 && <p className="text-sm text-muted-foreground">{t("no_products_selected")}</p>}
        {value.map((id) => (
          <Chip key={id} label={nameOf(id)} removeLabel={t("remove_item", { name: nameOf(id) })} onRemove={() => onChange(value.filter((x) => x !== id))} />
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" value={q} placeholder={t("product_search")} onChange={(e) => setQ(e.target.value)} aria-label={t("product_search")} />
      </div>
      {q.trim() && (
        <ul className="divide-y rounded-xl border">
          {matches.length === 0 && <li className="p-3 text-sm text-muted-foreground">{t("no_products_found")}</li>}
          {matches.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-2 pl-3 text-sm">
              <span className="min-w-0 truncate">{p.name}</span>
              <Button size="sm" variant="outline" onClick={() => { onChange([...value, p.id]); setQ(""); }}>
                <Plus className="mr-1 h-4 w-4" />{t("add")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
};

const ExcludedClasses = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => {
  const { t } = useMessages(adminShippingMessages);
  const { data: products = [] } = useShippingProducts();
  const [other, setOther] = useState("");
  const known = [...new Set([
    ...products.map((p) => String(p.shipping_class ?? "").trim().toLowerCase()).filter(Boolean),
    ...value,
  ])].sort();
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  const addOther = () => {
    const c = other.trim().toLowerCase();
    if (c && !value.includes(c)) onChange([...value, c]);
    setOther("");
  };
  return (
    <Field label={t("excluded_classes")} hint={t("excluded_hint")} wide>
      {known.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("classes_none")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {known.map((c) => {
            const on = value.includes(c);
            return (
              <button
                key={c} type="button" aria-pressed={on} onClick={() => toggle(c)}
                className={on
                  ? "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 text-sm font-medium text-destructive"
                  : "inline-flex min-h-[36px] items-center rounded-full border bg-background px-3 text-sm transition-colors hover:border-primary"}
              >
                {on && <Ban className="h-3.5 w-3.5" />}{c}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={other} placeholder={t("class_placeholder")} onChange={(e) => setOther(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOther(); } }} />
        <Button variant="outline" onClick={addOther} disabled={!other.trim()}><Plus className="mr-1 h-4 w-4" />{t("add")}</Button>
      </div>
    </Field>
  );
};

// ── Tabela de preços de uma forma de envio ───────────────────────────────────
const RatesPage = ({ service, zones, rates, onClose, onSaved }: {
  service: Service; zones: Zone[]; rates: any[]; onClose: () => void; onSaved: () => void;
}) => {
  const { t, locale } = useMessages(adminShippingMessages);
  const basis: RateBasis = service.rate_basis ?? "weight";
  const zoneCurrency = (id: string) => zones.find((z) => z.id === id)?.currency ?? "BRL";
  const money = (cents: unknown, id: string) => {
    if (cents == null) return "";
    const cur = zoneCurrency(id);
    return fieldNum(fromCents(Number(cents), cur), locale, currencyDigits(cur));
  };
  const zoneOrder = (id: string) => zones.findIndex((z) => z.id === id);
  // Por zona (na ordem das zonas) e, dentro dela, por peso.
  const sorted = [...rates].sort((a, b) => zoneOrder(a.region_id) - zoneOrder(b.region_id) || Number(a.min_weight_kg) - Number(b.min_weight_kg));
  const [rows, setRows] = useState<RateRow[]>(() => sorted.map((r) => ({
    id: r.id, region_id: r.region_id,
    min_weight_kg: fieldNum(Number(r.min_weight_kg ?? 0), locale), max_weight_kg: r.max_weight_kg == null ? "" : fieldNum(Number(r.max_weight_kg), locale),
    price: money(r.price_cents, r.region_id), extra: Number(r.extra_kg_cents) ? money(r.extra_kg_cents, r.region_id) : "",
    days_min: r.days_min == null ? "" : String(r.days_min), days_max: r.days_max == null ? "" : String(r.days_max),
    free_from: money(r.free_from_cents, r.region_id),
  })));
  const update = (i: number, patch: Partial<RateRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => {
    const last = rs[rs.length - 1];
    return [...rs, {
      region_id: last?.region_id ?? zones[0]?.id ?? "", min_weight_kg: last?.max_weight_kg || "0", max_weight_kg: "",
      price: "", extra: "", days_min: last?.days_min ?? "", days_max: last?.days_max ?? "", free_from: "",
    }];
  });

  const save = useMutation({
    mutationFn: async () => {
      const bad = rows.some((r) => !r.region_id || (numOrNull(r.max_weight_kg) != null && numOrNull(r.max_weight_kg)! < dec(r.min_weight_kg)));
      if (bad) throw new Error("invalid");
      const keep = rows.filter((r) => r.id).map((r) => r.id);
      const gone = rates.map((r) => r.id).filter((id) => !keep.includes(id));
      if (gone.length) {
        const { error } = await db.from("shipping_service_rates").delete().in("id", gone);
        if (error) throw error;
      }
      for (const r of rows) {
        const cur = zoneCurrency(r.region_id);
        const row = {
          service_id: service.id, region_id: r.region_id,
          min_weight_kg: basis === "flat" ? 0 : dec(r.min_weight_kg), max_weight_kg: basis === "flat" ? null : numOrNull(r.max_weight_kg),
          price_cents: toCents(dec(r.price), cur), extra_kg_cents: basis === "weight" || basis === "items" ? toCents(dec(r.extra), cur) : 0,
          days_min: numOrNull(r.days_min), days_max: numOrNull(r.days_max),
          free_from_cents: numOrNull(r.free_from) == null ? null : toCents(numOrNull(r.free_from)!, cur),
        };
        const { error } = r.id
          ? await db.from("shipping_service_rates").update(row).eq("id", r.id)
          : await db.from("shipping_service_rates").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(t("saved")); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message === "invalid" ? t("rates_invalid") : t("save_error")),
  });

  const cell = "h-9 min-w-[4.5rem]";
  // A base de cálculo da forma de envio muda o que "de" e "até" querem dizer (kg, itens, valor) ou esconde-os.
  const showRange = basis !== "flat";
  const showExtra = basis === "weight" || basis === "items";
  const colFrom = basis === "items" ? t("col_from_items") : basis === "subtotal" ? t("col_from_value") : t("col_from");
  const colTo = basis === "items" ? t("col_to_items") : basis === "subtotal" ? t("col_to_value") : t("col_to");
  const colExtra = basis === "items" ? t("col_extra_item") : t("col_extra");
  const hint = basis === "weight" ? t("rates_hint") : t(`rates_hint_${basis}` as AdminShippingKey);
  return (
    <AdminSubpage title={t("rates_title", { name: service.name })} subtitle={t(`basis_${basis}` as AdminShippingKey)} backLabel={t("back_services")} onBack={onClose}>
        <p className="text-sm text-muted-foreground">{hint}</p>
        {zones.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t("need_zone")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-1 font-medium">{t("col_zone")}</th>
                  {showRange && <th className="p-1 font-medium">{colFrom}</th>}
                  {showRange && <th className="p-1 font-medium">{colTo}</th>}
                  <th className="p-1 font-medium">{t("col_price")}</th>
                  {showExtra && <th className="p-1 font-medium">{colExtra}</th>}
                  <th className="p-1 font-medium">{t("col_days")}</th>
                  <th className="p-1 font-medium">{t("col_free")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id ?? `new-${i}`} className="align-top">
                    <td className="p-1">
                      <Select value={r.region_id} onValueChange={(v) => update(i, { region_id: v })}>
                        <SelectTrigger className="h-9 min-w-[13rem]"><SelectValue /></SelectTrigger>
                        <SelectContent>{zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name} ({z.currency})</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    {showRange && <td className="p-1"><Input className={cell} inputMode="decimal" aria-label={colFrom} value={r.min_weight_kg} onChange={(e) => update(i, { min_weight_kg: e.target.value })} /></td>}
                    {showRange && <td className="p-1"><Input className={cell} inputMode="decimal" aria-label={colTo} placeholder={t("to_any")} value={r.max_weight_kg} onChange={(e) => update(i, { max_weight_kg: e.target.value })} /></td>}
                    <td className="p-1"><Input className={cell} inputMode="decimal" aria-label={t("col_price")} value={r.price} onChange={(e) => update(i, { price: e.target.value })} /></td>
                    {showExtra && <td className="p-1"><Input className={cell} inputMode="decimal" aria-label={colExtra} value={r.extra} onChange={(e) => update(i, { extra: e.target.value })} /></td>}
                    <td className="p-1">
                      <div className="flex gap-1">
                        <Input className="h-9 w-14" inputMode="numeric" value={r.days_min} onChange={(e) => update(i, { days_min: e.target.value })} />
                        <Input className="h-9 w-14" inputMode="numeric" value={r.days_max} onChange={(e) => update(i, { days_max: e.target.value })} />
                      </div>
                    </td>
                    <td className="p-1"><Input className={cell} inputMode="decimal" value={r.free_from} onChange={(e) => update(i, { free_from: e.target.value })} /></td>
                    <td className="p-1">
                      <Button size="icon" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={t("delete")}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t("rates_empty")}</p>}
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <Button variant="outline" onClick={addRow} disabled={zones.length === 0}><Plus className="h-4 w-4 mr-1.5" />{t("add_rate")}</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? t("saving") : t("save")}</Button>
          </div>
        </div>
    </AdminSubpage>
  );
};

// ── Zonas ───────────────────────────────────────────────────────────────────
const ZonesTab = () => {
  const { t, locale } = useMessages(adminShippingMessages);
  const qc = useQueryClient();
  const { data, isLoading, isError } = useShippingData();
  const page = useAdminPage();
  const { ask, confirmSlot } = useInlineConfirm();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>;
  if (isError || !data) return <p className="p-6 text-sm text-destructive">{t("load_error")}</p>;

  const remove = async (z: Zone) => {
    if (!(await ask(t("confirm_delete_zone")))) return;
    const { error } = await db.from("shipping_regions").delete().eq("id", z.id);
    if (error) toast.error(t("save_error")); else toast.success(t("deleted"));
    refresh();
  };
  const where = (z: Zone) => z.countries.map((c) => (c === "*" ? t("world") : countryName(c, locale))).join(", ");

  return (
    <div className="space-y-4">
      {confirmSlot}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => page.open("zona", "nova")}>
          <Plus className="h-4 w-4 mr-1.5" /> {t("new_zone")}
        </Button>
      </div>
      {data.zones.length === 0 && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("zones_empty")}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {data.zones.map((z) => {
          const used = data.rates.filter((r) => r.region_id === z.id).length;
          return (
            <Card key={z.id} className="rounded-2xl">
              <CardContent className="flex items-start gap-3 p-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange-text" strokeWidth={1.8} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold">{z.name} <span className="text-xs font-normal text-muted-foreground">{z.currency}</span></p>
                  <p className="text-xs text-muted-foreground">{where(z)}</p>
                  {!!z.regions.length && <p className="text-xs text-muted-foreground">{z.regions.join(", ")}</p>}
                  {!!z.postal_codes.length && <p className="font-mono text-xs text-muted-foreground">{z.postal_codes.join(", ")}</p>}
                  {used > 0 && <p className="text-xs text-muted-foreground">{t("zone_used", { n: used })}</p>}
                  {!z.is_active && <Badge variant="secondary">{t("inactive")}</Badge>}
                </div>
                <Button size="icon" variant="ghost" onClick={() => page.open("zona", z.id)} aria-label={t("edit")}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(z)} aria-label={t("delete")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const ZonePage = ({ value, onClose, onSaved }: { value: Partial<Zone>; onClose: () => void; onSaved: () => void }) => {
  const { t } = useMessages(adminShippingMessages);
  const { data: countries = FALLBACK_COUNTRIES } = useCountries();
  const [f, setF] = useState({
    name: value.name ?? "",
    countries: (value.countries ?? []).join(", "),
    regions: value.regions ?? [],
    postal: (value.postal_codes ?? []).join(", "),
    currency: value.currency ?? "BRL",
    is_active: value.is_active ?? true,
  });
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const codes = useMemo(() => list(f.countries).map((c) => (c === "*" ? c : c.toUpperCase())), [f.countries]);
  // Um só país com lista de regiões conhecida: caixas de seleção; senão, texto livre.
  const fmt = useMemo(() => {
    if (codes.length !== 1 || codes[0] === "*") return null;
    const kind = countries.find((c) => c.code === codes[0])?.postalCodeKind;
    const af = kind ? addressFormat(kind) : null;
    return af && af.regions.length ? af : null;
  }, [codes, countries]);

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        name: f.name.trim(), countries: codes.filter((c) => c === "*" || /^[A-Z]{2}$/.test(c)),
        regions: f.regions, postal_codes: list(f.postal), currency: f.currency, is_active: f.is_active,
      };
      const q = value.id
        ? db.from("shipping_regions").update(row).eq("id", value.id)
        : db.from("shipping_regions").insert({ ...row, display_order: value.display_order ?? 0 });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("saved")); onSaved(); onClose(); },
    onError: () => toast.error(t("save_error")),
  });

  return (
    <AdminSubpage title={value.id ? t("edit_zone") : t("new_zone")} subtitle={value.id ? value.name : undefined} backLabel={t("back_zones")} onBack={onClose}>
        <div className="grid gap-4">
          <Field label={t("zone_name")}><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label={t("countries")} hint={t("countries_hint")}>
            <Input value={f.countries} onChange={(e) => set({ countries: e.target.value, regions: [] })} placeholder="BR" />
          </Field>
          <Field label={t("regions")} hint={t("regions_hint")}>
            {fmt ? (
              <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-3">
                {fmt.regions.map((r) => {
                  const v = regionToValue(fmt, r);
                  const on = f.regions.includes(v);
                  return (
                    <label key={r.code} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={on} onChange={() => set({ regions: on ? f.regions.filter((x) => x !== v) : [...f.regions, v] })} />
                      {r.name}
                    </label>
                  );
                })}
              </div>
            ) : (
              <Input value={f.regions.join(", ")} onChange={(e) => set({ regions: list(e.target.value) })} placeholder={t("all_regions")} />
            )}
          </Field>
          <Field label={t("postal")} hint={t("postal_hint")}>
            <Input value={f.postal} onChange={(e) => set({ postal: e.target.value })} placeholder="9000..9399" />
          </Field>
          <Field label={t("currency")}>
            <Select value={f.currency} onValueChange={(v) => set({ currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <SwitchRow label={t("active")} checked={f.is_active} onChange={(v) => set({ is_active: v })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !f.name.trim() || codes.length === 0}>{save.isPending ? t("saving") : t("save")}</Button>
        </div>
    </AdminSubpage>
  );
};

// ── Simular frete ───────────────────────────────────────────────────────────
type SimResult = {
  currency: string; region: string | null;
  options: { service_id: string; name: string; price_cents: number; free: boolean; days_min: number | null; days_max: number | null; source: string }[];
  unavailable?: { service_id: string; reason: string }[];
};
const SimulateTab = () => {
  const { t, locale } = useMessages(adminShippingMessages);
  const { data: countries = FALLBACK_COUNTRIES } = useCountries();
  const { data } = useShippingData();
  const { data: products = [] } = useShippingProducts();
  const [f, setF] = useState({ country: "BR", postal: "", region: "", weight: "1", subtotal: "100", items: "1", product: "" });
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { data: out, error } = await supabase.functions.invoke("shipping-quote", {
        body: { country_code: f.country, address: { postal_code: f.postal, region: f.region }, simulate: { weight_kg: dec(f.weight), subtotal: dec(f.subtotal), items: Math.max(1, Math.round(dec(f.items))), product_id: f.product || null } },
      });
      if (error) throw error;
      setRes(out as SimResult);
    } catch {
      toast.error(t("sim_error"));
    } finally {
      setBusy(false);
    }
  };
  const nameOf = (id: string) => data?.services.find((s) => s.id === id)?.name ?? id;
  const days = (a: number | null, b: number | null) => (a == null && b == null ? "" : a === b || b == null ? t("sim_day", { n: a ?? b! }) : t("sim_days", { min: a ?? 0, max: b }));

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">{t("sim_hint")}</p>
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label={t("sim_country")}>
            <Select value={f.country} onValueChange={(v) => setF({ ...f, country: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{countries.map((c) => <SelectItem key={c.code} value={c.code}>{countryName(c.code, locale)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={t("sim_postal")}><Input value={f.postal} onChange={(e) => setF({ ...f, postal: e.target.value })} /></Field>
          <Field label={t("sim_region")}><Input value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} /></Field>
          <Field label={t("sim_weight")}><Input inputMode="decimal" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field>
          <Field label={t("sim_subtotal")}><Input inputMode="decimal" value={f.subtotal} onChange={(e) => setF({ ...f, subtotal: e.target.value })} /></Field>
          <Field label={t("sim_items")}><Input inputMode="numeric" value={f.items} onChange={(e) => setF({ ...f, items: e.target.value })} /></Field>
          <Field label={t("sim_product")}>
            <Select value={f.product || "-"} onValueChange={(v) => setF({ ...f, product: v === "-" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-">{t("sim_any_product")}</SelectItem>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Button onClick={run} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}{t("sim_run")}</Button>
        {res && (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">{res.region ? t("sim_zone", { zone: res.region }) : t("sim_no_zone")}</p>
            {res.options.length === 0 && <p>{t("sim_none")}</p>}
            {res.options.map((o) => (
              <div key={o.service_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                <div>
                  <p className="font-medium">{o.name}</p>
                  <p className="text-xs text-muted-foreground">{[days(o.days_min, o.days_max), o.source === "api" ? t("sim_source_api") : t("sim_source_table")].filter(Boolean).join(" · ")}</p>
                </div>
                <p className="font-semibold tabular-nums">{o.free ? t("sim_free") : formatCents(o.price_cents, res.currency, locale)}</p>
              </div>
            ))}
            {(res.unavailable ?? []).map((u) => (
              <p key={u.service_id} className="text-xs text-muted-foreground">
                {t("sim_out", { name: nameOf(u.service_id), reason: t(`why_${u.reason}` as AdminShippingKey) })}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ── Peças pequenas ──────────────────────────────────────────────────────────
const Field = ({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) => (
  <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
    <Label className="text-xs font-semibold">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

const SwitchRow = ({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-start justify-between gap-3 rounded-xl border p-3">
    <span>
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
);

export default AdminShipping;
