import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Ruler, X, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import PriceInput from "./PriceInput";
import { SIZE_PRESET_ERRORS, sizePresetPayload } from "@/lib/sizePresetValidation";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";
import HelpTip from "./HelpTip";
import { useMessages } from "@/i18n";
import { adminLegacyMessages, type AdminLegacyT } from "@/i18n/adminLegacy";

/** Rótulo de campo com a dica ao lado. */
const FieldLabel = ({ t, label, help }: { t: AdminLegacyT; label: string; help: string }) => (
  <div className="flex items-center gap-1">
    <Label className="text-xs">{label}</Label>
    <HelpTip label={t("help")} text={help} className="h-6 w-6" />
  </div>
);

type SizePresetItem = {
  label: string;
  defaultPriceAdjustment: number;
  displayOrder: number;
};

type Preset = {
  id: string;
  name: string;
  sizes: string[];
  items: SizePresetItem[];
  display_order: number | null;
};

const normalizeItems = (value: unknown, legacySizes: unknown): SizePresetItem[] => {
  if (Array.isArray(value) && value.length) {
    return value
      .map((item: any, index) => ({
        label: String(item?.label || "").trim(),
        defaultPriceAdjustment: Number(item?.defaultPriceAdjustment || 0),
        displayOrder: Number.isFinite(Number(item?.displayOrder)) ? Number(item.displayOrder) : index,
      }))
      .filter((item) => item.label)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((item, index) => ({ ...item, displayOrder: index }));
  }
  return (Array.isArray(legacySizes) ? legacySizes : [])
    .map((label, index) => ({ label: String(label).trim(), defaultPriceAdjustment: 0, displayOrder: index }))
    .filter((item) => item.label);
};

const AdminSizes = () => {
  const qc = useQueryClient();
  const { ask, confirmSlot } = useInlineConfirm();
  const { t } = useMessages(adminLegacyMessages);
  const errorText = (code?: string) => (SIZE_PRESET_ERRORS as readonly string[]).includes(code ?? "") ? t(`sizes_err_${code}` as Parameters<typeof t>[0]) : code;
  const [newName, setNewName] = useState("");
  const [newSizes, setNewSizes] = useState("");

  const { data: presets = [], isLoading, error: loadError, refetch } = useQuery({
    queryKey: ["size-presets"],
    queryFn: async () => {
      const { data, error } = await db
        .from("size_presets")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        sizes: Array.isArray(p.sizes) ? p.sizes : [],
        items: normalizeItems(p.items, p.sizes),
      })) as Preset[];
    },
  });

  const createPreset = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      const sizes = newSizes.split(",").map((s) => s.trim()).filter(Boolean);
      const items = sizes.map((label, displayOrder) => ({ label, defaultPriceAdjustment: 0, displayOrder }));
      if (sizes.length === 0) throw new Error(t("sizes_need_one"));
      const payload = sizePresetPayload(name, items);
      const { error } = await db.from("size_presets").insert({
        ...payload,
        display_order: (presets[presets.length - 1]?.display_order ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("sizes_created"));
      setNewName(""); setNewSizes("");
      qc.invalidateQueries({ queryKey: ["size-presets"] });
    },
    onError: (e: any) => toast.error(errorText(e?.message) || t("sizes_create_error")),
  });

  const updatePreset = useMutation({
    mutationFn: async (p: { id: string; name: string; items: SizePresetItem[] }) => {
      const payload = sizePresetPayload(p.name, p.items);
      const { error } = await db
        .from("size_presets")
        .update(payload)
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("sizes_updated"));
      qc.invalidateQueries({ queryKey: ["size-presets"] });
    },
    onError: (error: Error) => toast.error(errorText(error.message) || t("sizes_update_error")),
  });

  const deletePreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("size_presets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("sizes_removed"));
      qc.invalidateQueries({ queryKey: ["size-presets"] });
    },
    onError: () => toast.error(t("sizes_remove_error")),
  });

  const reorderPreset = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= presets.length) return;
    const next = [...presets];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    const results = await Promise.all(next.map((preset, order) =>
      db.from("size_presets").update({ display_order: order }).eq("id", preset.id),
    ));
    if (results.some((result) => result.error)) toast.error(t("sizes_reorder_error"));
    qc.invalidateQueries({ queryKey: ["size-presets"] });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ruler className="h-5 w-5" /> {t("sizes_title")}<HelpTip label={t("help")} text={t("sizes_h_title")} />
          </CardTitle>
          <CardDescription>
            {t("sizes_intro")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {confirmSlot}
          <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
            <div>
              <div className="flex items-center gap-1">
                <p className="text-sm font-semibold">{t("sizes_create")}</p>
                <HelpTip label={t("help")} text={t("sizes_h_create")} />
              </div>
              <p className="text-xs text-muted-foreground">{t("sizes_create_intro")}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 items-end">
              <div>
                <FieldLabel t={t} label={t("sizes_f_name")} help={t("sizes_h_name")} />
                <Input placeholder={t("sizes_name_placeholder")} aria-label={t("sizes_f_name")} value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div>
                <FieldLabel t={t} label={t("sizes_f_sizes")} help={t("sizes_h_sizes")} />
                <Input placeholder="S, M, L, XL, 2XL, 3XL" aria-label={t("sizes_f_sizes")} value={newSizes} onChange={(e) => setNewSizes(e.target.value)} />
              </div>
              <Button onClick={() => createPreset.mutate()} disabled={createPreset.isPending}>
                {createPreset.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                {t("sizes_add")}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("sizes_loading")}</p>
          ) : loadError ? (
            <div role="alert" className="space-y-2 text-sm text-destructive"><p>{t("sizes_load_error")}</p><Button variant="outline" onClick={() => void refetch()}>{t("sizes_retry")}</Button></div>
          ) : presets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("sizes_empty")}</p>
          ) : (
            <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("sizes_list_intro")}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {presets.map((p, index) => (
                <PresetCard key={p.id} preset={p}
                  onSave={(name, items) => updatePreset.mutate({ id: p.id, name, items })}
                  saving={updatePreset.isPending || deletePreset.isPending}
                  onMoveUp={() => reorderPreset(index, -1)}
                  onMoveDown={() => reorderPreset(index, 1)}
                  canMoveUp={index > 0}
                  canMoveDown={index < presets.length - 1}
                  onDelete={async () => {
                    if (await ask(t("sizes_delete_confirm", { name: p.name }), { confirmLabel: t("delete") })) deletePreset.mutate(p.id);
                  }}
                />
              ))}
            </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const draftItems = (items: SizePresetItem[]) => items.map(item => ({ ...item, draftKey: crypto.randomUUID() }));

const PresetCard = ({ preset, onSave, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown, saving }: {
  preset: Preset;
  saving: boolean;
  onSave: (name: string, items: SizePresetItem[]) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) => {
  const { t } = useMessages(adminLegacyMessages);
  const [name, setName] = useState(preset.name);
  const [items, setItems] = useState(() => draftItems(preset.items));
  const [newSize, setNewSize] = useState("");
  const dirty = name !== preset.name || JSON.stringify(items.map(({ draftKey, ...item }) => item)) !== JSON.stringify(preset.items);
  const addSize = () => {
    const label = newSize.trim();
    if (!label) return;
    if (items.some(item => item.label.trim().toLocaleLowerCase("pt-PT") === label.toLocaleLowerCase("pt-PT"))) {
      toast.error(t("sizes_duplicate"));
      return;
    }
    setItems([...items, { label, defaultPriceAdjustment: 0, displayOrder: items.length, draftKey: crypto.randomUUID() }]);
    setNewSize("");
  };

  return (
    <fieldset disabled={saving} aria-busy={saving} className="min-w-0 rounded-lg border p-3 space-y-3 bg-card">
      <div className="flex items-center gap-2">
        <Input aria-label={t("sizes_preset_name")} value={name} onChange={(e) => setName(e.target.value)} className="font-semibold" />
        <Button variant="ghost" size="icon" onClick={onMoveUp} disabled={!canMoveUp} aria-label={t("sizes_move_up")}><ArrowUp className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onMoveDown} disabled={!canMoveDown} aria-label={t("sizes_move_down")}><ArrowDown className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={t("sizes_delete_aria")}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium text-muted-foreground">{t("sizes_items")}</p>
          <HelpTip label={t("help")} text={t("sizes_h_items")} className="h-6 w-6" />
        </div>
        {items.map((item, i) => (
          <div key={item.draftKey} className="grid grid-cols-[auto_minmax(0,1fr)_110px_auto_auto] items-center gap-1.5 rounded-md border bg-muted/20 p-2">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => {
                const arr = [...items];
                [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                setItems(arr.map((entry, displayOrder) => ({ ...entry, displayOrder })));
              }}
              className="rounded hover:bg-primary/20 p-0.5 disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label={t("sizes_size_up")}
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <Input value={item.label} onChange={(event) => setItems(items.map((entry, index) => index === i ? { ...entry, label: event.target.value } : entry))} className="h-8" aria-label={t("sizes_size_name")} />
            <PriceInput
              value={item.defaultPriceAdjustment}
              onChange={(defaultPriceAdjustment) => setItems(items.map((entry, index) => index === i ? { ...entry, defaultPriceAdjustment } : entry))}
              label={t("sizes_price_label", { size: item.label })}
              disabled={saving}
            />
            <button
              type="button"
              disabled={i === items.length - 1}
              onClick={() => {
                const arr = [...items];
                [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                setItems(arr.map((entry, displayOrder) => ({ ...entry, displayOrder })));
              }}
              className="rounded hover:bg-primary/20 p-0.5 disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label={t("sizes_size_down")}
            >
              <ArrowDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== i).map((entry, displayOrder) => ({ ...entry, displayOrder })))}
              className="rounded hover:bg-destructive/20 p-0.5 ml-0.5"
              aria-label={t("sizes_remove")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={t("sizes_add_size")}
          aria-label={t("sizes_add_size")}
          value={newSize}
          onChange={(e) => setNewSize(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newSize.trim()) {
              e.preventDefault();
              addSize();
            }
          }}
          className="h-8"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!newSize.trim()}
          aria-label={t("sizes_add_size")}
          onClick={addSize}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {dirty && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setName(preset.name); setItems(draftItems(preset.items)); }}>
            {t("sizes_discard")}
          </Button>
          <Button size="sm" onClick={() => onSave(name, items)}>
            {t("sizes_save")}
          </Button>
        </div>
      )}
    </fieldset>
  );
};

export default AdminSizes;
