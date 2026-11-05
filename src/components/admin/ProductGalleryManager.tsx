import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmStrip } from "@/components/admin/shell/AdminPageParts";
import { ImageUploader } from "./ImageUploader";
import { Trash2, Plus, Loader2, ArrowUp, ArrowDown, Image as ImageIcon, Star } from "lucide-react";
import { toast } from "sonner";

interface Props {
  productId: string;
}

interface ImageRow {
  id: string;
  product_id: string;
  image_url: string;
  display_order: number;
  alt_text: string | null;
  variation_id: string | null;
}

interface Variation {
  id: string;
  name: string;
}

export const ProductGalleryManager = ({ productId }: Props) => {
  const qc = useQueryClient();
  const [newUrl, setNewUrl] = useState("");
  const [targetVariation, setTargetVariation] = useState<string>("__general__");
  const [deleteTarget, setDeleteTarget] = useState<ImageRow | null>(null);

  const { data: images = [], isLoading } = useQuery({
    queryKey: ["adminProductGallery", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_images")
        .select("*")
        .eq("product_id", productId)
        .order("variation_id", { ascending: true, nullsFirst: true })
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as ImageRow[];
    },
  });

  const { data: variations = [] } = useQuery({
    queryKey: ["adminProductVariations", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_variations")
        .select("id, name")
        .eq("product_id", productId)
        .order("display_order");
      if (error) throw error;
      return (data || []) as Variation[];
    },
  });

  const { data: productMainImage = "" } = useQuery({
    queryKey: ["adminProductMainImage", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("products").select("image").eq("id", productId).single();
      if (error) throw error;
      return String(data?.image || "");
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["adminProductGallery", productId] });
    qc.invalidateQueries({ queryKey: ["productImages", productId] });
    qc.invalidateQueries({ queryKey: ["variationImages"] });
    qc.invalidateQueries({ queryKey: ["adminProductMainImage", productId] });
  };

  const addImage = useMutation({
    mutationFn: async (url: string) => {
      const variation_id = targetVariation === "__general__" ? null : targetVariation;
      // Compute next display_order from DB to avoid race conditions / stale cache
      // colliding with the unique (product_id, variation_id, display_order) index.
      let query = (supabase as any)
        .from("product_images")
        .select("display_order")
        .eq("product_id", productId)
        .order("display_order", { ascending: false })
        .limit(1);
      query = variation_id === null ? query.is("variation_id", null) : query.eq("variation_id", variation_id);
      const { data: lastRow } = await query;
      const nextOrder = ((lastRow?.[0]?.display_order as number | undefined) ?? -1) + 1;

      let insertError: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await (supabase as any).from("product_images").insert({
          product_id: productId,
          variation_id,
          image_url: url,
          display_order: nextOrder + attempt,
        });
        if (!error) { insertError = null; break; }
        insertError = error;
        if (!String(error.message || "").includes("product_images_product_variation_order_key")) break;
      }
      if (insertError) throw insertError;
      // Auto-fill the product's main image if it is still empty,
      // so previews (admin hero, catalog card, storefront) reflect the upload immediately.
      const { data: prod } = await (supabase as any)
        .from("products")
        .select("image")
        .eq("id", productId)
        .maybeSingle();
      if (prod && (!prod.image || prod.image.trim() === "")) {
        await (supabase as any).from("products").update({ image: url }).eq("id", productId);
      }
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["adminProductDetail", productId] });
      qc.invalidateQueries({ queryKey: ["adminProducts"] });
      qc.invalidateQueries({ queryKey: ["product", productId] });
      setNewUrl("");
      toast.success("Imagem adicionada");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao adicionar"),
  });

  const deleteImage = useMutation({
    mutationFn: async (image: ImageRow) => {
      const { error } = await (supabase as any).from("product_images").delete().eq("id", image.id);
      if (error) throw error;
      if (productMainImage === image.image_url) {
        const replacement = images.find((candidate) => candidate.id !== image.id)?.image_url || null;
        const { error: productError } = await (supabase as any).from("products").update({ image: replacement }).eq("id", productId);
        if (productError) throw productError;
      }
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["adminProducts"] });
      qc.invalidateQueries({ queryKey: ["adminProductDetail", productId] });
      setDeleteTarget(null);
      toast.success("Imagem removida");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao remover"),
  });

  const setMainImage = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await (supabase as any).from("products").update({ image: url }).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["adminProducts"] });
      qc.invalidateQueries({ queryKey: ["adminProductDetail", productId] });
      toast.success("Imagem principal atualizada");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao definir imagem principal"),
  });

  const updateImage = useMutation({
    mutationFn: async (row: Partial<ImageRow> & { id: string }) => {
      const current = images.find((image) => image.id === row.id);
      const nextVariationId = row.variation_id ?? null;
      const changedGroup = current && (current.variation_id || null) !== nextVariationId;
      let displayOrder = current?.display_order ?? 0;
      if (changedGroup) {
        const targetOrders = images
          .filter((image) => image.id !== row.id && (image.variation_id || null) === nextVariationId)
          .map((image) => image.display_order);
        displayOrder = targetOrders.length ? Math.max(...targetOrders) + 1 : 0;
      }
      const { error } = await (supabase as any)
        .from("product_images")
        .update({
          alt_text: row.alt_text ?? null,
          variation_id: nextVariationId,
          display_order: displayOrder,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Imagem atualizada"); },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar"),
  });

  const reorder = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const img = images.find((i) => i.id === id);
      if (!img) return;
      const siblings = images
        .filter((i) => (i.variation_id || null) === (img.variation_id || null))
        .sort((a, b) => a.display_order - b.display_order);
      const idx = siblings.findIndex((s) => s.id === id);
      const swap = siblings[idx + dir];
      if (!swap) return;
      // Use a temporary out-of-range value to dodge the unique
      // (product_id, variation_id, display_order) index during the swap.
      const temp = -1 * (Date.now() % 100000) - 1;
      const a = await (supabase as any).from("product_images").update({ display_order: temp }).eq("id", img.id);
      if (a.error) throw a.error;
      const b = await (supabase as any).from("product_images").update({ display_order: img.display_order }).eq("id", swap.id);
      if (b.error) throw b.error;
      const c = await (supabase as any).from("product_images").update({ display_order: swap.display_order }).eq("id", img.id);
      if (c.error) throw c.error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message || "Erro ao reordenar"),
  });

  const groups: Array<{ key: string; label: string; items: ImageRow[] }> = [
    {
      key: "__general__",
      label: "Galeria geral (sem variação)",
      items: images.filter((i) => !i.variation_id),
    },
    ...variations.map((v) => ({
      key: v.id,
      label: `Variação · ${v.name}`,
      items: images.filter((i) => i.variation_id === v.id),
    })),
  ];

  // Orphan images whose variation no longer exists
  const knownIds = new Set(variations.map((v) => v.id));
  const orphans = images.filter((i) => i.variation_id && !knownIds.has(i.variation_id));
  if (orphans.length) {
    groups.push({ key: "__orphan__", label: "Imagens órfãs (variação removida)", items: orphans });
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">A carregar imagens…</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed">
        <p className="font-semibold text-foreground mb-1">Gestão completa da galeria</p>
        <p className="text-muted-foreground">
          Aqui vês <strong>todas</strong> as imagens do produto, incluindo as associadas a variações.
          Podes adicionar, definir a principal, reordenar, mudar de variação e remover.
        </p>
      </div>

      {/* Add new image */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> Adicionar imagem
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <Label className="text-xs">Associar a</Label>
            <Select value={targetVariation} onValueChange={setTargetVariation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__general__">Galeria geral</SelectItem>
                {variations.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Upload</Label>
            <ImageUploader
              category="product"
              onImageUploaded={(url) => addImage.mutate(url)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ou cole uma URL</Label>
          <div className="flex gap-2">
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://..."
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              onClick={() => newUrl && addImage.mutate(newUrl)}
              disabled={!newUrl || addImage.isPending}
            >
              {addImage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar</>}
            </Button>
          </div>
        </div>
      </div>

      {/* Groups */}
      {groups.map((g) => (
        <div key={g.key} className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" /> {g.label}
            </h4>
            <Badge variant="secondary">{g.items.length} {g.items.length === 1 ? "imagem" : "imagens"}</Badge>
          </div>

          {g.items.length === 0 ? (
            <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground text-xs">
              Sem imagens neste grupo.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {g.items.map((img, i) => (
                <div
                  key={img.id}
                  className="rounded-xl border bg-card overflow-hidden flex flex-col animate-stagger-item transition-transform duration-200 hover:-translate-y-0.5"
                  style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                >
                  <div className="relative aspect-[3/4] bg-muted">
                    <img src={img.image_url} alt={img.alt_text || ""} className="w-full h-full object-cover" />
                    <button
                      onClick={() => setDeleteTarget(img)}
                      className="absolute top-2 right-2 bg-destructive text-destructive-foreground p-1.5 rounded-full opacity-90 hover:opacity-100"
                      title="Remover imagem"
                      aria-label="Remover imagem"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <div className="absolute top-2 left-2 flex gap-1">
                      <button
                        disabled={i === 0}
                        onClick={() => reorder.mutate({ id: img.id, dir: -1 })}
                        className="bg-background/90 border rounded-full p-1.5 disabled:opacity-40"
                        title="Subir"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        disabled={i === g.items.length - 1}
                        onClick={() => reorder.mutate({ id: img.id, dir: 1 })}
                        className="bg-background/90 border rounded-full p-1.5 disabled:opacity-40"
                        title="Descer"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={productMainImage === img.image_url ? "secondary" : "outline"}
                      className="w-full h-8 text-xs gap-1.5"
                      disabled={productMainImage === img.image_url || setMainImage.isPending}
                      onClick={() => setMainImage.mutate(img.image_url)}
                    >
                      <Star className="h-3.5 w-3.5" />
                      {productMainImage === img.image_url ? "Imagem principal" : "Definir como principal"}
                    </Button>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Alt text</Label>
                      <Input
                        defaultValue={img.alt_text || ""}
                        placeholder="Descrição da imagem"
                        className="h-8 text-xs"
                        onBlur={(e) => {
                          if ((e.target.value || "") !== (img.alt_text || "")) {
                            updateImage.mutate({ id: img.id, alt_text: e.target.value, variation_id: img.variation_id });
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Variação</Label>
                      <Select
                        value={img.variation_id || "__general__"}
                        onValueChange={(val) => {
                          updateImage.mutate({
                            id: img.id,
                            alt_text: img.alt_text,
                            variation_id: val === "__general__" ? null : val,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__general__">Galeria geral</SelectItem>
                          {variations.map((v) => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <ConfirmStrip
        open={!!deleteTarget}
        title="Remover esta imagem?"
        description="A imagem deixa de aparecer neste produto. O ficheiro original não é apagado do armazenamento, para não afetar produtos duplicados."
        confirmLabel="Remover imagem"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteImage.mutate(deleteTarget); setDeleteTarget(null); }}
      />
    </div>
  );
};

export default ProductGalleryManager;
