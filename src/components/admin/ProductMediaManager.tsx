// Admin > Produtos > Imagens: modelo 3D (STL, OBJ ou 3MF, em mm) e vídeos (MP4 ou WebM) da galeria do produto.
// Os ficheiros vão para o bucket público product-media; também aceita colar um endereço. Grava direto no produto
// (products.model_url e products.video_urls), como o ProductGalleryManager faz com as fotos.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Rotate3d, Trash2, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BUCKET = "product-media";
const MODEL_EXT = /\.(stl|obj|3mf)$/i;
const VIDEO_EXT = /\.(mp4|webm)$/i;

/** Envia o ficheiro e devolve o endereço público. Modelos vão como octet-stream (o navegador não lhes dá tipo). */
async function upload(productId: string, file: File, kind: "model" | "video"): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${productId}/${kind}-${Date.now()}.${ext}`;
  const contentType = kind === "video" ? (file.type || `video/${ext}`) : "application/octet-stream";
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function ProductMediaManager({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-product-media", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("products").select("model_url,video_urls").eq("id", productId).single();
      if (error) throw error;
      return data as { model_url: string | null; video_urls: string[] | null };
    },
  });
  const [model, setModel] = useState("");
  const [videos, setVideos] = useState<string[]>([]);
  const [newVideo, setNewVideo] = useState("");
  const [busy, setBusy] = useState<"model" | "video" | "save" | null>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data) return;
    setModel(data.model_url ?? "");
    setVideos(data.video_urls ?? []);
  }, [data]);

  const save = async (next: { model?: string; videos?: string[] }) => {
    const model_url = (next.model ?? model).trim() || null;
    const video_urls = (next.videos ?? videos).map((v) => v.trim()).filter(Boolean);
    setBusy("save");
    const { error } = await (supabase as any).from("products").update({ model_url, video_urls }).eq("id", productId);
    setBusy(null);
    if (error) { toast.error("Não foi possível salvar o modelo 3D e os vídeos."); return false; }
    qc.invalidateQueries({ queryKey: ["admin-product-media", productId] });
    toast.success("Modelo 3D e vídeos salvos.");
    return true;
  };

  const onFile = async (file: File | undefined, kind: "model" | "video") => {
    if (!file) return;
    if (kind === "model" && !MODEL_EXT.test(file.name)) { toast.error("Envie um arquivo STL, OBJ ou 3MF."); return; }
    if (kind === "video" && !VIDEO_EXT.test(file.name)) { toast.error("Envie um vídeo MP4 ou WebM."); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("O arquivo passa de 50 MB."); return; }
    setBusy(kind);
    try {
      const url = await upload(productId, file, kind);
      if (kind === "model") { setModel(url); await save({ model: url }); }
      else { const next = [...videos, url]; setVideos(next); await save({ videos: next }); }
    } catch {
      toast.error("Não foi possível enviar o arquivo.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>;

  return (
    <div className="space-y-6">
      {/* Modelo 3D */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2"><Rotate3d className="h-4 w-4 text-primary" /> Modelo 3D (opcional)</Label>
        <p className="text-sm text-muted-foreground">STL, OBJ ou 3MF em milímetros. Aparece na galeria como "3D" para o cliente girar a peça.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="https://... ou envie o arquivo" />
          <input ref={modelInput} type="file" accept=".stl,.obj,.3mf" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0], "model"); e.target.value = ""; }} />
          <Button type="button" variant="outline" onClick={() => modelInput.current?.click()} disabled={!!busy}>
            {busy === "model" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar
          </Button>
          {model && <Button type="button" variant="ghost" onClick={() => { setModel(""); void save({ model: "" }); }} disabled={!!busy} aria-label="Remover modelo 3D"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>

      {/* Vídeos */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2"><Video className="h-4 w-4 text-primary" /> Vídeos (opcional)</Label>
        <p className="text-sm text-muted-foreground">MP4 ou WebM até 50 MB. Aparecem no fim da galeria.</p>
        {videos.map((v, n) => (
          <div key={`${v}-${n}`} className="flex items-center gap-2">
            <Input value={v} onChange={(e) => setVideos(videos.map((x, k) => (k === n ? e.target.value : x)))} />
            <Button type="button" variant="ghost" onClick={() => { const next = videos.filter((_, k) => k !== n); setVideos(next); void save({ videos: next }); }} disabled={!!busy} aria-label="Remover vídeo"><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={newVideo} onChange={(e) => setNewVideo(e.target.value)} placeholder="https://... ou envie o vídeo" />
          <Button type="button" variant="outline" onClick={() => { if (newVideo.trim()) { setVideos([...videos, newVideo.trim()]); setNewVideo(""); } }} disabled={!newVideo.trim()}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
          <input ref={videoInput} type="file" accept="video/mp4,video/webm" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0], "video"); e.target.value = ""; }} />
          <Button type="button" variant="outline" onClick={() => videoInput.current?.click()} disabled={!!busy}>
            {busy === "video" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar
          </Button>
        </div>
      </div>

      <Button type="button" onClick={() => void save({})} disabled={!!busy}>
        {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} Salvar modelo 3D e vídeos
      </Button>
    </div>
  );
}
