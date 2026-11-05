import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Pencil } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import StorageImageUploader from "@/components/admin/StorageImageUploader";

type Section = {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  category: string | null;
  display_order: number;
  is_active: boolean;
};
type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  display_order: number;
  is_active: boolean;
};

const useTable = <T,>(table: string, key: string) => {
  const qc = useQueryClient();
  const list = useQuery<T[]>({
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(table)
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data as T[]) || [];
    },
  });
  const upsert = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await (supabase as any).from(table).upsert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [key] });
      toast.success("Guardado");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao guardar"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [key] });
      toast.success("Removido");
    },
  });
  return { list, upsert, remove };
};

const SectionsEditor = () => {
  const { list, upsert, remove } = useTable<Section>("usage_guide_sections", "admin-usage-sections");
  const qc = useQueryClient();
  const items = list.data || [];
  const categories = Array.from(
    new Set(items.map((s) => (s.category || "").trim()).filter(Boolean))
  ).sort();

  const [newCat, setNewCat] = useState("");
  const [extraCats, setExtraCats] = useState<string[]>([]);
  const allCategories = Array.from(new Set([...categories, ...extraCats])).sort();

  const renameCategory = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const affected = items.filter((s) => (s.category || "").trim() === oldName);
    for (const s of affected) {
      const { error } = await (supabase as any)
        .from("usage_guide_sections")
        .update({ category: trimmed })
        .eq("id", s.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    setExtraCats((prev) => prev.filter((c) => c !== oldName));
    qc.invalidateQueries({ queryKey: ["admin-usage-sections"] });
    toast.success(`Categoria renomeada para "${trimmed}"`);
  };

  const deleteCategory = async (name: string) => {
    const affected = items.filter((s) => (s.category || "").trim() === name);
    if (affected.length > 0) {
      if (!confirm(`Remover categoria "${name}"? As ${affected.length} secção(ões) ficarão sem categoria.`)) return;
      for (const s of affected) {
        const { error } = await (supabase as any)
          .from("usage_guide_sections")
          .update({ category: null })
          .eq("id", s.id);
        if (error) {
          toast.error(error.message);
          return;
        }
      }
    }
    setExtraCats((prev) => prev.filter((c) => c !== name));
    qc.invalidateQueries({ queryKey: ["admin-usage-sections"] });
    toast.success("Categoria removida");
  };

  const addCategory = () => {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    if (allCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      toast.info("Essa categoria já existe");
      setNewCat("");
      return;
    }
    setExtraCats((prev) => [...prev, trimmed]);
    setNewCat("");
    toast.success(`Categoria "${trimmed}" criada — atribua-a às secções abaixo`);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const a = items[idx], b = items[idx + dir];
    if (!a || !b) return;
    upsert.mutate({ ...a, display_order: b.display_order });
    upsert.mutate({ ...b, display_order: a.display_order });
  };

  const addNew = () =>
    upsert.mutate({
      title: "Nova secção",
      body: "",
      display_order: (items[items.length - 1]?.display_order || 0) + 1,
      is_active: true,
    });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{items.length} secções</p>
        <Button size="sm" onClick={addNew} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova secção
        </Button>
      </div>

      <Card className="p-4 space-y-3 bg-muted/30">
        <div>
          <Label className="text-sm font-semibold">Categorias (abas)</Label>
          <p className="text-[11px] text-muted-foreground">
            Crie, renomeie ou remova categorias. As alterações aplicam-se a todas as secções associadas.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="Nova categoria, ex.: Decoração"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCategory())}
          />
          <Button size="sm" onClick={addCategory} className="gap-1.5">
            <Plus className="h-4 w-4" /> Criar
          </Button>
        </div>
        {allCategories.length > 0 ? (
          <div className="space-y-1.5">
            {allCategories.map((c) => {
              const count = items.filter((s) => (s.category || "").trim() === c).length;
              return (
                <div key={c} className="flex items-center gap-2 bg-background border rounded-md px-2.5 py-1.5">
                  <span className="text-sm flex-1 truncate">{c}</span>
                  <span className="text-[10px] text-muted-foreground">{count} secção(ões)</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      const n = prompt(`Renomear categoria "${c}":`, c);
                      if (n) renameCategory(c, n);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => deleteCategory(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Sem categorias ainda.</p>
        )}
      </Card>

      {items.map((s, idx) => (
        <SectionRow
          key={s.id}
          row={s}
          categories={allCategories}
          onSave={(patch) => upsert.mutate({ ...s, ...patch })}
          onDelete={() => remove.mutate(s.id)}
          onUp={idx > 0 ? () => move(idx, -1) : undefined}
          onDown={idx < items.length - 1 ? () => move(idx, 1) : undefined}
        />
      ))}
    </div>
  );
};

const SectionRow = ({
  row,
  categories,
  onSave,
  onDelete,
  onUp,
  onDown,
}: {
  row: Section;
  categories: string[];
  onSave: (p: Partial<Section>) => void;
  onDelete: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) => {
  const [local, setLocal] = useState(row);
  const NONE = "__none__";
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={local.title}
          onChange={(e) => setLocal({ ...local, title: e.target.value })}
          placeholder="Título"
          className="font-semibold"
        />
        <Button size="icon" variant="ghost" disabled={!onUp} onClick={onUp}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" disabled={!onDown} onClick={onDown}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <Textarea
        value={local.body}
        onChange={(e) => setLocal({ ...local, body: e.target.value })}
        placeholder="Conteúdo (texto simples)"
        rows={4}
      />
      <div className="space-y-2">
        <Label className="text-xs">Categoria (aba)</Label>
        <Select
          value={local.category && local.category.trim() ? local.category : NONE}
          onValueChange={(v) => setLocal({ ...local, category: v === NONE ? null : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecionar categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sem categoria</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Para criar/renomear/remover categorias, use o painel "Categorias (abas)" acima.
        </p>
      </div>
      <StorageImageUploader
        value={local.image_url || ""}
        onChange={(url) => setLocal({ ...local, image_url: url || null })}
        bucket="banners"
        folder="usage-guide"
        label="Imagem da secção (opcional)"
        previewAspect="aspect-video"
        hint="Arraste uma imagem (JPG, PNG, WEBP). Máx. 10 MB."
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={local.is_active}
            onCheckedChange={(v) => setLocal({ ...local, is_active: v })}
          />
          <Label className="text-xs">{local.is_active ? "Activa" : "Inactiva"}</Label>
        </div>
        <Button size="sm" onClick={() => onSave(local)} className="gap-1.5">
          <Save className="h-4 w-4" /> Guardar
        </Button>
      </div>
    </Card>
  );
};

const FaqsEditor = () => {
  const { list, upsert, remove } = useTable<Faq>("usage_guide_faqs", "admin-usage-faqs");
  const items = list.data || [];

  const move = (idx: number, dir: -1 | 1) => {
    const a = items[idx], b = items[idx + dir];
    if (!a || !b) return;
    upsert.mutate({ ...a, display_order: b.display_order });
    upsert.mutate({ ...b, display_order: a.display_order });
  };

  const addNew = () =>
    upsert.mutate({
      question: "Nova pergunta",
      answer: "",
      display_order: (items[items.length - 1]?.display_order || 0) + 1,
      is_active: true,
    });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{items.length} perguntas</p>
        <Button size="sm" onClick={addNew} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova pergunta
        </Button>
      </div>
      {items.map((f, idx) => (
        <FaqRow
          key={f.id}
          row={f}
          onSave={(patch) => upsert.mutate({ ...f, ...patch })}
          onDelete={() => remove.mutate(f.id)}
          onUp={idx > 0 ? () => move(idx, -1) : undefined}
          onDown={idx < items.length - 1 ? () => move(idx, 1) : undefined}
        />
      ))}
    </div>
  );
};

const FaqRow = ({
  row,
  onSave,
  onDelete,
  onUp,
  onDown,
}: {
  row: Faq;
  onSave: (p: Partial<Faq>) => void;
  onDelete: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) => {
  const [local, setLocal] = useState(row);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={local.question}
          onChange={(e) => setLocal({ ...local, question: e.target.value })}
          placeholder="Pergunta"
          className="font-semibold"
        />
        <Button size="icon" variant="ghost" disabled={!onUp} onClick={onUp}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" disabled={!onDown} onClick={onDown}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <Textarea
        value={local.answer}
        onChange={(e) => setLocal({ ...local, answer: e.target.value })}
        placeholder="Resposta"
        rows={3}
      />
      <Input
        value={local.category || ""}
        onChange={(e) => setLocal({ ...local, category: e.target.value })}
        placeholder="Categoria (opcional)"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={local.is_active}
            onCheckedChange={(v) => setLocal({ ...local, is_active: v })}
          />
          <Label className="text-xs">{local.is_active ? "Activa" : "Inactiva"}</Label>
        </div>
        <Button size="sm" onClick={() => onSave(local)} className="gap-1.5">
          <Save className="h-4 w-4" /> Guardar
        </Button>
      </div>
    </Card>
  );
};

const AdminUsageGuide = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Página "Como Utilizar"</h2>
        <p className="text-sm text-muted-foreground">
          Gere as secções editoriais e as FAQs publicadas em /como-utilizar.
        </p>
      </div>
      <Tabs defaultValue="sections">
        <TabsList>
          <TabsTrigger value="sections">Secções</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
        </TabsList>
        <TabsContent value="sections" className="pt-6">
          <SectionsEditor />
        </TabsContent>
        <TabsContent value="faqs" className="pt-6">
          <FaqsEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminUsageGuide;