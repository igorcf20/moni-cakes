import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function MaterialTagsPicker({ selected, onChange }: Props) {
  const qc = useQueryClient();
  const [newLabel, setNewLabel] = useState("");

  const { data: tags = [] } = useQuery({
    queryKey: ["material-tags"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("material_tags")
        .select("slug,label,display_order")
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const createTag = useMutation({
    mutationFn: async (label: string) => {
      const slug = slugify(label);
      if (!slug) throw new Error("Etiqueta inválida");
      const { error } = await (supabase as any)
        .from("material_tags")
        .insert([{ slug, label: label.trim(), display_order: (tags as any[]).length }]);
      if (error) throw error;
      return slug;
    },
    onSuccess: (slug) => {
      qc.invalidateQueries({ queryKey: ["material-tags"] });
      onChange(Array.from(new Set([...selected, slug])));
      setNewLabel("");
      toast.success("Etiqueta criada");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar etiqueta"),
  });

  const toggle = (slug: string) => {
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Etiquetas de material (filtros)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(tags as any[]).map((t) => {
          const isSel = selected.includes(t.slug);
          return (
            <button
              key={t.slug}
              type="button"
              onClick={() => toggle(t.slug)}
              className={cn(
                "px-2.5 h-7 rounded-full border text-xs font-medium transition-all",
                isSel
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary/60"
              )}
            >
              {t.label}
            </button>
          );
        })}
        {(tags as any[]).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma etiqueta ainda. Crie a primeira abaixo.</p>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Ex: Algodão 155g/m²"
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (newLabel.trim()) createTag.mutate(newLabel);
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => newLabel.trim() && createTag.mutate(newLabel)}
          disabled={!newLabel.trim() || createTag.isPending}
        >
          <Plus className="h-4 w-4 mr-1" /> Criar
        </Button>
      </div>
    </div>
  );
}