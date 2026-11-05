import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";
import { ArrowUp, ArrowDown, Plus, Pencil, Copy, Trash2, Settings2 } from "lucide-react";
import StorageImageUploader from "./StorageImageUploader";
import PrintMethodsManager from "./PrintMethodsManager";
import { usePrintMethods } from "@/hooks/usePrintMethods";
import AreaTechniques, { loadAreaTechniques, saveAreaTechniques, validateTechniques, type TechDraft } from "./AreaTechniques";
import { moneyInputValue, parseMoneyInput } from "@/lib/moneyInput";
import { toast } from "sonner";
import { useMessages } from "@/i18n";
import { adminProductAreasMessages } from "@/i18n/adminProductAreas";
import { useAdminFormat } from "@/hooks/useAdminList";

// Deliberately uses the existing area table. Updating basic fields never deletes
// historical techniques, materials, observations or positioning configuration.
const db = supabase as any;
type AreaData = {
  label: string; description: string; preview_image_url: string;
  base_price: number; max_width_cm: number; max_height_cm: number;
};
type Area = AreaData & {
  id: string; key: string; display_order: number; is_active: boolean;
  pricing_mode: string; price_per_cm2: number; min_price: number;
};
type Preset = { id: string; name: string; items: AreaData[] };
const blank = (): AreaData => ({ label: "", description: "", preview_image_url: "", base_price: 0, max_width_cm: 30, max_height_cm: 40 });
const copyData = (a: AreaData): AreaData => ({
  label: a.label, description: a.description || "", preview_image_url: a.preview_image_url || "",
  base_price: Number(a.base_price ?? 0), max_width_cm: Number(a.max_width_cm || 30), max_height_cm: Number(a.max_height_cm || 40),
});
const normalized = (s: string) => s.trim().toLocaleLowerCase("pt-PT");
const keyFor = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "area";

function AreaFields({ value, onChange, folder }: { value: AreaData; onChange: (a: AreaData) => void; folder: string }) {
  const { t } = useMessages(adminProductAreasMessages);
  const { currency } = useAdminFormat();
  const [price, setPrice] = useState(moneyInputValue(value.base_price));
  return <div className="space-y-4">
    <label className="block space-y-1 text-sm font-medium">{t("area_name")}<Input value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} placeholder={t("area_name_placeholder")} /></label>
    <StorageImageUploader value={value.preview_image_url} onChange={(url) => onChange({ ...value, preview_image_url: url })} folder={folder} label={t("area_photo")} previewAspect="aspect-[3/1]" hint={t("area_photo_hint")} />
    <label className="block space-y-1 text-sm font-medium">{t("area_price", { currency })}<Input inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); onChange({ ...value, base_price: parseMoneyInput(e.target.value) ?? NaN }); }} /></label>
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">{t("area_measures")}</summary>
      <p className="my-3 text-xs text-muted-foreground">{t("area_measures_hint")}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">{t("width_cm")}<Input type="number" min="0.1" step="0.1" value={value.max_width_cm} onChange={(e) => onChange({ ...value, max_width_cm: Number(e.target.value) })} /></label>
        <label className="space-y-1 text-sm">{t("height_cm")}<Input type="number" min="0.1" step="0.1" value={value.max_height_cm} onChange={(e) => onChange({ ...value, max_height_cm: Number(e.target.value) })} /></label>
      </div>
      <label className="mt-3 block space-y-1 text-sm">{t("area_description")}<Textarea value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} rows={2} /></label>
    </details>
    <p className="text-xs text-muted-foreground">{t("area_customer_hint")}</p>
  </div>;
}

export default function SimpleProductAreas({ productId }: { productId: string }) {
  // Método inicial de uma área nova: o primeiro ativo em Métodos (nada fixo de uma técnica).
  const { methods: printMethods } = usePrintMethods();
  const firstMethod = printMethods.find((m) => m.is_active)?.key;
  const cache = useQueryClient();
  const { t } = useMessages(adminProductAreasMessages);
  const { money } = useAdminFormat();
  const message = (error: unknown) => (error as { message?: string })?.message || t("err_save");
  const [busy, setBusy] = useState(false);
  const { ask, confirmSlot } = useInlineConfirm();
  const [editor, setEditor] = useState<{ id?: string; data: AreaData; original?: Area } | null>(null);
  const [techs, setTechs] = useState<TechDraft[] | null>(null);
  const [methodsOpen, setMethodsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<{ id?: string; name: string; items: AreaData[] } | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [draftSession, setDraftSession] = useState(0);
  const { data: areas = [], isLoading, error } = useQuery({
    queryKey: ["admin-product-areas", productId],
    queryFn: async (): Promise<Area[]> => {
      const result = await db.from("product_print_areas").select("*").eq("product_id", productId).order("display_order").order("id");
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
  const { data: presets = [], error: presetError, isLoading: loadingPresets } = useQuery({
    queryKey: ["area-presets"],
    queryFn: async (): Promise<Preset[]> => {
      const result = await db.from("customization_area_presets").select("*").order("name");
      if (result.error) throw result.error;
      return (result.data ?? []).map((p: Preset) => ({ ...p, items: (p.items ?? []).map(copyData) }));
    },
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["admin-product-areas", productId] }),
      cache.invalidateQueries({ queryKey: ["print-areas", productId] }),
      cache.invalidateQueries({ queryKey: ["area-presets"] }),
    ]);
  };
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); await refresh(); } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  };
  const validate = (a: AreaData) => {
    if (!a.label.trim()) throw new Error(t("err_area_name"));
    if (!Number.isFinite(a.base_price) || a.base_price < 0) throw new Error(t("err_area_price"));
    if (![a.max_width_cm, a.max_height_cm].every((n) => Number.isFinite(n) && n > 0)) throw new Error(t("err_area_size"));
  };
  // Opens the area modal and loads its stamping methods (null while loading; copies drop ids).
  const openEditor = async (next: NonNullable<typeof editor>, techSource?: string, copy = false) => {
    setEditor(next);
    if (!techSource) { setTechs([]); return; }
    setTechs(null);
    try {
      const loaded = await loadAreaTechniques(techSource);
      setTechs(copy ? loaded.map(({ id, materials, ...t }) => ({ ...t, materials: materials.map(({ id: _m, ...m }) => m) })) : loaded);
    } catch (e) { toast.error(message(e)); setEditor(null); }
  };
  const nextOrder = () => Math.max(-1, ...areas.map((a) => a.display_order ?? 0)) + 1;
  const newRow = (a: AreaData, order: number) => ({
    ...a, label: a.label.trim(), product_id: productId,
    key: keyFor(a.label) + "_" + crypto.randomUUID().slice(0, 8),
    display_order: order, pricing_mode: "flat", is_active: true,
    area_width_cm: a.max_width_cm, area_height_cm: a.max_height_cm,
    allowed_techniques: firstMethod ? [firstMethod] : [], default_technique: firstMethod ?? null, keep_aspect_ratio_default: true,
    observation_required: false, preview_enabled: false,
  });
  const saveArea = () => run(async () => {
    if (!editor) return;
    validate(editor.data);
    const payload = { ...editor.data, label: editor.data.label.trim(), area_width_cm: editor.data.max_width_cm, area_height_cm: editor.data.max_height_cm,
      ...(editor.original ? { pricing_mode: editor.original.pricing_mode, is_active: editor.original.is_active } : {}) };
    // Existing non-flat pricing stays intact until explicitly changed in Materials.
    if (techs) validateTechniques(techs);
    const result = editor.id
      ? await db.from("product_print_areas").update(payload).eq("id", editor.id).eq("product_id", productId).select("id").single()
      : await db.from("product_print_areas").insert(newRow(editor.data, nextOrder())).select("id").single();
    if (result.error) throw result.error;
    if (techs) await saveAreaTechniques(result.data.id, techs);
    setEditor(null); toast.success(t("area_saved"));
  });
  const savePreset = () => run(async () => {
    if (!draft?.name.trim()) throw new Error(t("err_preset_name"));
    draft.items.forEach(validate);
    const names = draft.items.map((a) => normalized(a.label));
    if (new Set(names).size !== names.length) throw new Error(t("err_preset_dup_names"));
    const payload = { name: draft.name.trim(), items: draft.items.map(copyData) };
    const result = draft.id
      ? await db.from("customization_area_presets").update(payload).eq("id", draft.id).select("id").single()
      : await db.from("customization_area_presets").insert(payload).select("id").single();
    if (result.error) throw result.error;
    setDraft({ ...draft, id: result.data.id }); toast.success(t("area_preset_saved"));
  });
  const applyPreset = () => run(async () => {
    const preset = presets.find((p) => p.id === selected);
    if (!preset) return;
    const existing = new Set(areas.map((a) => normalized(a.label)));
    const missing = preset.items.filter((a) => !existing.has(normalized(a.label)));
    missing.forEach(validate);
    if (!missing.length) { toast.info(t("area_preset_all_exist")); return; }
    const result = await db.from("product_print_areas").insert(missing.map((a, i) => newRow(a, nextOrder() + i)));
    if (result.error) throw result.error;
    toast.success(t("areas_added"));
  });
  const move = (index: number, direction: number) => run(async () => {
    const ordered = [...areas];
    const other = index + direction;
    if (other < 0 || other >= ordered.length) return;
    [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
    for (let i = 0; i < ordered.length; i++) {
      const { error } = await db.from("product_print_areas").update({ display_order: i }).eq("id", ordered[i].id).eq("product_id", productId);
      if (error) throw error;
    }
  });
  const presetDraft = (p?: Preset, duplicate = false) => {
    setDraftSession((current) => current + 1);
    setDraft(p ? { id: duplicate ? undefined : p.id, name: duplicate ? t("copy_name", { name: p.name }) : p.name, items: p.items.map(copyData) } : { name: "", items: [] });
    setItemIndex(0);
  };
  return <div className="space-y-5">
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1"><Label htmlFor="area-preset">{t("area_preset_label")}</Label>
        <select id="area-preset" value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">{t("area_preset_select")}</option>{presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <Button variant="outline" disabled={!selected || busy || !!presetError} onClick={applyPreset}>{t("apply_to_product")}</Button>
      <Button variant="outline" onClick={() => setMethodsOpen(true)}><Settings2 className="mr-2 h-4 w-4" />{t("print_methods")}</Button>
      <Button variant="outline" onClick={() => setLibraryOpen(true)}><Settings2 className="mr-2 h-4 w-4" />{t("manage_presets")}</Button>
    </div>
    {presetError && <p role="alert" className="text-sm text-destructive">{t("area_presets_unavailable")}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">{t("areas_title")}</h2><p className="text-sm text-muted-foreground">{t("areas_subtitle")}</p></div>
      <Button onClick={() => openEditor({ data: blank() })}><Plus className="mr-2 h-4 w-4" />{t("add_area")}</Button>
    </div>
    {error && <p role="alert" className="text-destructive">{t("err_load_areas")}</p>}
    {isLoading ? <p role="status">{t("loading_areas")}</p> : !areas.length && !error ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("no_areas")}</p> : <div className="divide-y rounded-lg border">
      {areas.map((a, index) => <div key={a.id} className="flex flex-wrap items-center gap-3 p-3">
        {a.preview_image_url ? <img src={a.preview_image_url} alt={a.label} className="h-16 w-16 rounded border object-contain" /> : <div className="flex h-16 w-16 items-center justify-center rounded bg-muted text-xs text-muted-foreground">{t("no_photo")}</div>}
        <div className="min-w-0 flex-1"><p className="font-medium">{a.label}</p><p className="text-sm text-muted-foreground">+{money(a.base_price)} · {a.max_width_cm} × {a.max_height_cm} cm{!a.is_active && " · " + t("inactive")}</p>
          {a.pricing_mode !== "flat" && <p className="text-xs text-amber-700">{t("legacy_cm2", { price: money(a.price_per_cm2) })}</p>}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="icon" aria-label={t("move_up_name", { name: a.label })} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label={t("move_down_name", { name: a.label })} disabled={busy || index === areas.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => openEditor({ id: a.id, data: copyData(a), original: a }, a.id)}><Pencil className="mr-2 h-4 w-4" />{t("edit")}</Button>
          <Button variant="ghost" size="icon" aria-label={t("duplicate_name", { name: a.label })} onClick={() => openEditor({ data: { ...copyData(a), label: t("copy_name", { name: a.label }) } }, a.id, true)}><Copy className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" disabled={busy} aria-label={t("delete_name", { name: a.label })} onClick={async () => { if (await ask(t("delete_area_q", { name: a.label }), { confirmLabel: t("delete") })) run(async () => { const r = await db.from("product_print_areas").delete().eq("id", a.id).eq("product_id", productId); if (r.error) throw r.error; }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>)}
    </div>}
    {confirmSlot}
    <InlinePanel open={!!editor} onClose={() => { if (!busy) setEditor(null); }} title={editor?.id ? t("edit_area") : t("new_area")}>
      <div className="space-y-4">
        {editor && <AreaFields key={editor.id ?? "new"} value={editor.data} onChange={(data) => setEditor({ ...editor, data })} folder={"customization-areas/" + productId} />}
        {editor && (techs ? <AreaTechniques value={techs} onChange={setTechs} onManage={() => setMethodsOpen(true)} /> : <p role="status" className="text-sm text-muted-foreground">{t("loading_methods")}</p>)}
        {editor?.original && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editor.original.is_active} onChange={(e) => setEditor({ ...editor, original: { ...editor.original!, is_active: e.target.checked } })} />{t("area_available")}</label>}
        {editor?.original && areas.find((a) => a.id === editor.id)?.pricing_mode === "per_cm2" && <label className="flex gap-2 text-sm"><input type="checkbox" checked={editor.original.pricing_mode === "flat"} onChange={(e) => setEditor({ ...editor, original: { ...editor.original!, pricing_mode: e.target.checked ? "flat" : "per_cm2" } })} />{t("replace_legacy")}</label>}
        <p className="text-xs text-muted-foreground">{t("method_priority_hint")}</p>
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setEditor(null)}>{t("cancel")}</Button><Button disabled={busy || !techs} onClick={saveArea}>{busy ? t("saving") : t("save_area")}</Button></div>
      </div>
    </InlinePanel>
    <PrintMethodsManager open={methodsOpen} onOpenChange={setMethodsOpen} />
    <InlinePanel open={libraryOpen} onClose={() => setLibraryOpen(false)} title={t("area_presets_title")} description={t("area_presets_desc")}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!!presetError} onClick={() => presetDraft()}>{t("new_blank")}</Button><Button variant="outline" disabled={!areas.length || !!presetError} onClick={() => { setDraftSession((current) => current + 1); setDraft({ name: "", items: areas.map(copyData) }); setItemIndex(0); }}>{t("from_this_product")}</Button></div>
        {presetError ? <p role="alert" className="text-sm text-destructive">{t("area_presets_need_migration")}</p> : loadingPresets ? <p>{t("loading_presets")}</p> : <div className="space-y-2">{presets.map((p) => <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2"><span className="min-w-0 flex-1 text-sm font-medium">{p.name} · {t(p.items.length === 1 ? "areas_count_one" : "areas_count_other", { n: p.items.length })}</span><Button variant="outline" size="sm" onClick={() => presetDraft(p)}>{t("edit")}</Button><Button variant="outline" size="sm" onClick={() => presetDraft(p, true)}>{t("duplicate")}</Button><Button variant="ghost" size="icon" aria-label={t("delete_preset_name", { name: p.name })} disabled={busy} onClick={async () => { if (await ask(t("delete_area_preset_q"), { description: t("delete_area_preset_desc"), confirmLabel: t("delete") })) run(async () => { const r = await db.from("customization_area_presets").delete().eq("id", p.id); if (r.error) throw r.error; if (draft?.id === p.id) setDraft(null); }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>)}{!presets.length && <p className="text-sm text-muted-foreground">{t("no_area_presets")}</p>}</div>}
        {draft && <div className="space-y-4 border-t pt-4">
          <label className="block text-sm font-medium">{t("preset_name")}<Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select aria-label={t("preset_item_select")} className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3" value={itemIndex} onChange={(e) => setItemIndex(Number(e.target.value))}>
              {draft.items.map((a, i) => <option key={i} value={i}>{i + 1}. {a.label || t("new_area")}</option>)}
            </select>
            <Button variant="outline" onClick={() => { setDraft({ ...draft, items: [...draft.items, blank()] }); setItemIndex(draft.items.length); }}>{t("add_area_to_preset")}</Button>
          </div>
          {draft.items[itemIndex] && <>
            <AreaFields key={draftSession + ":" + itemIndex + ":" + draft.items.length} value={draft.items[itemIndex]} folder="area-presets" onChange={(a) => setDraft({ ...draft, items: draft.items.map((item, i) => i === itemIndex ? a : item) })} />
            <div className="flex gap-2">
              <Button variant="outline" disabled={itemIndex === 0} onClick={() => { const items = [...draft.items]; [items[itemIndex - 1], items[itemIndex]] = [items[itemIndex], items[itemIndex - 1]]; setDraft({ ...draft, items }); setItemIndex(itemIndex - 1); }}>{t("move_area_up")}</Button>
              <Button variant="outline" disabled={itemIndex === draft.items.length - 1} onClick={() => { const items = [...draft.items]; [items[itemIndex + 1], items[itemIndex]] = [items[itemIndex], items[itemIndex + 1]]; setDraft({ ...draft, items }); setItemIndex(itemIndex + 1); }}>{t("move_area_down")}</Button>
              <Button variant="ghost" onClick={() => { setDraft({ ...draft, items: draft.items.filter((_, i) => i !== itemIndex) }); setItemIndex(0); }}>{t("remove_area")}</Button>
            </div>
          </>}
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>{t("cancel")}</Button><Button disabled={busy || !!presetError} onClick={savePreset}>{t("save_preset")}</Button></div>
        </div>}
      </div>
    </InlinePanel>
  </div>;
}
