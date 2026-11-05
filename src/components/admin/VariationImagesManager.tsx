import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Loader2, Image as ImageIcon } from "lucide-react";
import { ImageUploader } from "./ImageUploader";
import { toast } from "sonner";

interface VariationImagesManagerProps {
  productId: string;
  variationId: string;
}

export const VariationImagesManager = ({ productId, variationId }: VariationImagesManagerProps) => {
  const queryClient = useQueryClient();
  const [newImageUrl, setNewImageUrl] = useState("");

  const { data: images = [], isLoading } = useQuery({
    queryKey: ["variationImages", variationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_images")
        .select("*")
        .eq("variation_id", variationId)
        .order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const addImage = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase.from("product_images").insert({
        product_id: productId,
        variation_id: variationId,
        image_url: url,
        display_order: images.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variationImages", variationId] });
      // Also invalidate product gallery queries
      queryClient.invalidateQueries({ queryKey: ["productImages", productId, variationId] });
      setNewImageUrl("");
      toast.success("Imagem adicionada à variação");
    },
  });

  const deleteImage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_images").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variationImages", variationId] });
      queryClient.invalidateQueries({ queryKey: ["productImages", productId, variationId] });
    },
  });

  return (
    <div className="space-y-4 pt-4 border-t mt-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Galeria da Variação</h4>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {images.map((img: any) => (
          <div key={img.id} className="relative group aspect-[3/4] rounded-lg overflow-hidden border">
            <img src={img.image_url} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => deleteImage.mutate(img.id)}
              className="absolute top-1 right-1 bg-destructive text-destructive-foreground p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ImageUploader
            category="product"
            onImageUploaded={(url) => addImage.mutate(url)}
          />
          <div className="space-y-1.5">
            <Label className="text-xs">Ou cole a URL da imagem</Label>
            <div className="flex gap-2">
              <Input
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="https://..."
                className="h-9 text-xs"
              />
              <Button 
                size="sm" 
                onClick={() => newImageUrl && addImage.mutate(newImageUrl)}
                disabled={!newImageUrl || addImage.isPending}
              >
                {addImage.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
