import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePrintMethods, type PrintMethod } from "@/hooks/usePrintMethods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { useInlineConfirm } from "@/components/admin/shell/useInlineConfirm";

const db = supabase as any;
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const fail = (e: unknown) => toast.error((e as { message?: string })?.message || "Não foi possível guardar.");

// Create / rename / disable / delete the stamping methods offered on product areas.
export default function PrintMethodsManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const cache = useQueryClient();
  const { methods, tableMissing } = usePrintMethods();
  const [newLabel, setNewLabel] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { ask, confirmSlot } = useInlineConfirm();

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); await cache.invalidateQueries({ queryKey: ["print-methods"] }); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const add = () => run(async () => {
    const label = newLabel.trim(); const key = slug(label);
    if (!key) throw new Error("Indique o nome do método.");
    if (methods.some((m) => m.key === key || m.label.toLowerCase() === label.toLowerCase())) throw new Error("Este método já existe.");
    const { error } = await db.from("print_methods").insert({ key, label, display_order: methods.length });
    if (error) throw error;
    setNewLabel(""); toast.success("Método criado.");
  });
  const update = (m: PrintMethod, patch: Partial<PrintMethod>) => run(async () => {
    if (patch.label !== undefined && !patch.label.trim()) throw new Error("O nome não pode ficar vazio.");
    const { error } = await db.from("print_methods").update({ ...patch, ...(patch.label ? { label: patch.label.trim() } : {}) }).eq("id", m.id);
    if (error) throw error;
    setEdits(({ [m.key]: _, ...rest }) => rest);
  });
  const remove = (m: PrintMethod) => run(async () => {
    const [a, b] = await Promise.all([
      db.from("product_print_area_techniques").select("id", { count: "exact", head: true }).eq("technique", m.key),
      db.from("product_print_areas").select("id", { count: "exact", head: true }).contains("allowed_techniques", [m.key]),
    ]);
    const used = Math.max(a.count ?? 0, b.count ?? 0);
    if (used > 0) throw new Error(`“${m.label}” está em uso em ${used} área(s). Remova-o dessas áreas ou desative-o.`);
    if (!(await ask(`Eliminar o método "${m.label}"?`, { confirmLabel: "Eliminar" }))) return;
    const { error } = await db.from("print_methods").delete().eq("id", m.id);
    if (error) throw error;
    toast.success("Método eliminado.");
  });

  // Abre como painel na própria página (sem janela por cima).
  return <InlinePanel open={open} onClose={() => { if (!busy) onOpenChange(false); }} title="Métodos de estampagem"
    description="Crie, renomeie, desative ou elimine os métodos disponíveis nas áreas (ex.: impressão em PLA, gravação a laser, bordado)." className="my-4">
    <div className="space-y-4">
      {confirmSlot}
      {tableMissing && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Aplique a migration <code>20260929120000_print_methods_catalog.sql</code> para gerir os métodos.</p>}
      <div className="flex gap-2">
        <Input aria-label="Novo método" placeholder="Nome do novo método" value={newLabel} disabled={tableMissing}
          onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button onClick={add} disabled={busy || tableMissing || !newLabel.trim()}><Plus className="mr-1 h-4 w-4" />Criar</Button>
      </div>
      <ul className="divide-y rounded-lg border">
        {methods.map((m) => {
          const text = edits[m.key] ?? m.label;
          return <li key={m.key} className="flex flex-wrap items-center gap-2 p-2">
            <Input aria-label={`Nome de ${m.label}`} className="min-w-0 flex-1" value={text} disabled={tableMissing}
              onChange={(e) => setEdits({ ...edits, [m.key]: e.target.value })} />
            {text.trim() !== m.label && <Button size="icon" variant="outline" aria-label="Guardar nome" disabled={busy} onClick={() => update(m, { label: text })}><Save className="h-4 w-4" /></Button>}
            <label className="flex items-center gap-2 text-sm"><Switch checked={m.is_active} disabled={busy || tableMissing} onCheckedChange={(is_active) => update(m, { is_active })} />Ativo</label>
            <Button size="icon" variant="ghost" aria-label={`Eliminar ${m.label}`} disabled={busy || tableMissing} onClick={() => remove(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </li>;
        })}
      </ul>
    </div>
  </InlinePanel>;
}
