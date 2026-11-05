import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";

interface StorageImageUploaderProps {
  /** Current image URL value */
  value: string;
  /** Called with the public URL after upload or manual entry */
  onChange: (url: string) => void;
  /** Storage bucket name (must exist and be public) */
  bucket?: string;
  /** Sub-folder inside the bucket */
  folder?: string;
  /** Label shown above the uploader */
  label?: string;
  /** Aspect ratio class for preview (e.g. "aspect-video", "aspect-square") */
  previewAspect?: string;
  /** Hint text below the drop zone */
  hint?: string;
  /** Accepted file types (e.g. "image/*", "image/png") */
  accept?: string;
  /** Max file size in MB (default 10) */
  maxSizeMb?: number;
  /** How the preview fills its box: "cover" (photos, default) or "contain" (logos and icons) */
  fit?: "cover" | "contain";
}

/**
 * Generic drag-and-drop image uploader backed by Supabase Storage.
 * Falls back to manual URL input.
 */
const StorageImageUploader = ({
  value,
  onChange,
  bucket = "product-images",
  folder = "uploads",
  label = "Imagem",
  previewAspect = "aspect-video",
  hint,
  accept = "image/*",
  maxSizeMb = 10,
  fit = "cover",
}: StorageImageUploaderProps) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      // Validate file type against accept prop
      const acceptedTypes = accept.split(",").map(t => t.trim().toLowerCase());
      const isAccepted = acceptedTypes.some(type => {
        if (type === "image/*") return file.type.startsWith("image/");
        if (type === "video/*") return file.type.startsWith("video/");
        return file.type.toLowerCase() === type;
      });
      
      if (!isAccepted) {
        toast.error(`Formato não suportado. Use: ${accept}`);
        return;
      }
      
      if (file.size > maxSizeMb * 1024 * 1024) {
        toast.error(`O ficheiro deve ter no máximo ${maxSizeMb} MB`);
        return;
      }

      setUploading(true);
      try {
        const ext = file.name.split(".").pop() || "jpg";
        const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `${folder}/${name}`;

        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(path, file, { upsert: true });

        if (uploadErr) throw uploadErr;

        const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(path);
        onChange(pubData.publicUrl);
        toast.success("Imagem enviada com sucesso!");
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || "Erro ao enviar imagem");
      } finally {
        setUploading(false);
      }
    },
    [bucket, folder, onChange, accept, maxSizeMb],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}

      {/* Preview */}
      {value && (
        <div className={`relative rounded-lg overflow-hidden border bg-muted ${previewAspect}`}>
          {/\.(mp4|webm|mov)(\?|$)/i.test(value) ? (
            <video
              src={value}
              className="w-full h-full object-cover"
              muted
              loop
              autoPlay
              playsInline
            />
          ) : (
            <img src={value} alt="Preview" className={`w-full h-full ${fit === "contain" ? "object-contain p-3" : "object-cover"}`} />
          )}
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={() => onChange("")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors
          ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}
          ${uploading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">A enviar...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">Arraste uma imagem ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground">
              {hint || "JPG, PNG ou WEBP — máx. 10 MB"}
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </div>

      {/* Fallback manual URL */}
      <div>
        <Label className="text-xs text-muted-foreground">Ou insira a URL manualmente</Label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="mt-1"
        />
      </div>
    </div>
  );
};

export default StorageImageUploader;
