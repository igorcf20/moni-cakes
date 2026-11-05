import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Trash2 } from "lucide-react";
import { usePrintMethods } from "@/hooks/usePrintMethods";
import PriceInput from "./PriceInput";
import { saveMaterials, validMoney, type MaterialDraft } from "./TechniquePricingManager";

const db = supabase as any;

export type TechDraft = {
  id?: string; technique: string; pricing_mode: "flat" | "per_cm2";
  base_price: number; price_per_cm2: number; min_price: number; is_active: boolean;
  materials: MaterialDraft[];
};

const norm = (s: string) => s.trim().toLocaleLowerCase("pt-PT");
const toMaterial = (m: any, priceKey: string): MaterialDraft => ({
  id: m.id, name: m.name, price: Number(m[priceKey] ?? 0),
  pricingMode: (m.pricing_mode ?? "fixed") as MaterialDraft["pricingMode"],
  pricePerMeter: Number(m.price_per_meter ?? 0),
  calculationDimension: (m.calculation_dimension ?? "height") as MaterialDraft["calculationDimension"],
});

export async function loadAreaTechniques(areaId: string): Promise<TechDraft[]> {
  const { data, error } = await db.from("product_print_area_techniques").select("*").eq("print_area_id", areaId).order("display_order");
  if (error) throw error;
  const ids = (data ?? []).map((t: any) => t.id);
  const mats = ids.length ? await db.from("product_print_area_technique_materials").select("*").in("area_technique_id", ids).order("display_order") : { data: [], error: null };
  if (mats.error) throw mats.error;
  return (data ?? []).map((t: any) => ({
    id: t.id, technique: t.technique, pricing_mode: t.pricing_mode, is_active: t.is_active,
    base_price: Number(t.base_price), price_per_cm2: Number(t.price_per_cm2), min_price: Number(t.min_price),
    materials: (mats.data ?? []).filter((m: any) => m.area_technique_id === t.id).map((m: any) => toMaterial(m, "price_adjustment")),
  }));
}

export function validateTechniques(techs: TechDraft[]) {
  for (const t of techs) {
    const label = t.technique;
    if (![t.base_price, t.price_per_cm2, t.min_price].every(validMoney)) throw new Error(`${label}: indique valores iguais ou superiores a zero.`);
    if (t.pricing_mode === "per_cm2" && t.price_per_cm2 <= 0) throw new Error(`${label}: o valor por cm² deve ser maior que zero.`);
    if (t.materials.some((m) => !m.name.trim() || !validMoney(m.price) || !validMoney(m.pricePerMeter))) throw new Error(`${label}: preencha o nome e um valor válido em cada material.`);
    if (t.materials.some((m) => m.pricingMode === "per_linear_meter" && m.pricePerMeter <= 0)) throw new Error(`${label}: o valor por metro deve ser maior que zero.`);
    const names = t.materials.map((m) => norm(m.name));
    if (new Set(names).size !== names.length) throw new Error(`${label}: não repita o mesmo material.`);
  }
}

// Upserts each method + its materials, then removes methods the admin dropped and
// keeps the area's allowed/default techniques in sync so the customer sees them.
export async function saveAreaTechniques(areaId: string, techs: TechDraft[]) {
  const { data: existing, error: readError } = await db.from("product_print_area_techniques").select("id,technique").eq("print_area_id", areaId);
  if (readError) throw readError;
  for (const t of techs) {
    const { data, error } = await db.from("product_print_area_techniques").upsert({
      print_area_id: areaId, technique: t.technique, pricing_mode: t.pricing_mode, base_price: t.base_price,
      price_per_cm2: t.price_per_cm2, min_price: t.min_price, is_active: t.is_active,
      display_order: techs.indexOf(t),
    }, { onConflict: "print_area_id,technique" }).select("id").single();
    if (error) throw error;
    await saveMaterials("product_print_area_technique_materials", "area_technique_id", data.id, t.materials);
  }
  const kept = new Set(techs.map((t) => t.technique));
  const obsolete = (existing ?? []).filter((e: any) => !kept.has(e.technique)).map((e: any) => e.id);
  if (obsolete.length) {
    const { error } = await db.from("product_print_area_techniques").delete().in("id", obsolete);
    if (error) throw error;
  }
  const allowed = techs.filter((t) => t.is_active).map((t) => t.technique);
  if (allowed.length) {
    const { data: area } = await db.from("product_print_areas").select("default_technique").eq("id", areaId).single();
    const { error } = await db.from("product_print_areas").update({
      allowed_techniques: allowed,
      default_technique: allowed.includes(area?.default_technique) ? area.default_technique : allowed[0],
    }).eq("id", areaId);
    if (error) throw error;
  }
}

export default function AreaTechniques({ value, onChange, onManage }: { value: TechDraft[]; onChange: (v: TechDraft[]) => void; onManage: () => void }) {
  const { methods, labels } = usePrintMethods();
  const unused = methods.filter((m) => m.is_active && !value.some((t) => t.technique === m.key));
  const patch = (i: number, p: Partial<TechDraft>) => onChange(value.map((t, n) => n === i ? { ...t, ...p } : t));

  return <section className="space-y-3 rounded-xl border p-3 sm:p-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h3 className="font-semibold">Métodos de estampagem</h3>
        <p className="text-xs text-muted-foreground">Escolha os métodos disponíveis nesta área e o acréscimo de cada um.</p></div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Adicionar método" value="" disabled={!unused.length} className="h-9 rounded-md border bg-background px-2 text-sm"
          onChange={(e) => e.target.value && onChange([...value, { technique: e.target.value, pricing_mode: "flat", base_price: 0, price_per_cm2: 0, min_price: 0, is_active: true, materials: [] }])}>
          <option value="">+ Adicionar método…</option>
          {unused.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={onManage}><Settings2 className="mr-1 h-4 w-4" />Gerir métodos</Button>
      </div>
    </div>
    {value.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Sem métodos definidos: vale o acréscimo por unidade da área.</p>}
    <div className="grid gap-3 lg:grid-cols-2">
      {value.map((t, i) => <div key={t.technique} className="space-y-3 rounded-lg border bg-muted/10 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">{labels[t.technique] ?? t.technique}</p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={t.is_active} onCheckedChange={(is_active) => patch(i, { is_active })} />Disponível</label>
            <Button type="button" variant="ghost" size="icon" aria-label={"Remover " + (labels[t.technique] ?? t.technique)} onClick={() => onChange(value.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Regra</Label>
            <Select value={t.pricing_mode} onValueChange={(v: TechDraft["pricing_mode"]) => patch(i, { pricing_mode: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="flat">Valor fixo</SelectItem><SelectItem value="per_cm2">Por cm²</SelectItem></SelectContent></Select></div>
          {t.pricing_mode === "flat"
            ? <div className="space-y-1.5"><Label>Acréscimo (€)</Label><PriceInput label="Acréscimo do método" value={t.base_price} onChange={(base_price) => patch(i, { base_price })} /></div>
            : <>
              <div className="space-y-1.5"><Label>Valor por cm² (€)</Label><PriceInput label="Valor por cm²" precision={4} value={t.price_per_cm2} onChange={(price_per_cm2) => patch(i, { price_per_cm2 })} /></div>
              <div className="space-y-1.5"><Label>Valor mínimo (€)</Label><PriceInput label="Valor mínimo" value={t.min_price} onChange={(min_price) => patch(i, { min_price })} /></div>
            </>}
        </div>
        {t.materials.length > 0 && <p className="text-xs text-muted-foreground">{t.materials.length} material(is) já configurado(s) mantido(s).</p>}
      </div>)}
    </div>
  </section>;
}
