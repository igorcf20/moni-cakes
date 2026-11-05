import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save, Star, Copy, Check, X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import StorageImageUploader from "./StorageImageUploader";
import IconPicker from "./IconPicker";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useRef } from "react";
import { Loader2, Upload, ArrowLeft, ArrowRight } from "lucide-react";
import { siteUrl } from "@/lib/siteUrl";

/* ─────────────── Helpers ─────────────── */
const useSection = (key: string) => useQuery({
  queryKey: ["home_section", key],
  queryFn: async () => {
    const { data, error } = await (supabase as any)
      .from("home_sections").select("*").eq("key", key).maybeSingle();
    if (error) throw error;
    return data;
  },
});

const useItems = (sectionKey: string, kind: string) => useQuery({
  queryKey: ["home_items", sectionKey, kind],
  queryFn: async () => {
    const { data, error } = await (supabase as any)
      .from("home_section_items").select("*")
      .eq("section_key", sectionKey).eq("kind", kind)
      .order("display_order", { ascending: true });
    if (error) throw error;
    return data || [];
  },
});

/* ─────────────── CTA Production tab ─────────────── */
const CtaProductionTab = () => {
  const qc = useQueryClient();
  const { data: section } = useSection("cta_production");
  const [form, setForm] = useState<any>(null);
  const current = form ?? section ?? {};
  const save = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await (supabase as any).from("home_sections")
        .update({
          eyebrow: data.eyebrow, title: data.title, subtitle: data.subtitle,
          image_url: data.image_url, cta_text: data.cta_text, cta_url: data.cta_url,
          secondary_cta_text: data.secondary_cta_text, secondary_cta_url: data.secondary_cta_url,
          is_active: data.is_active,
        }).eq("key", "cta_production");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Secção atualizada");
      qc.invalidateQueries({ queryKey: ["home_section", "cta_production"] });
      qc.invalidateQueries({ queryKey: ["home_sections"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro a guardar"),
  });

  if (!section && !form) return <div className="text-sm text-muted-foreground">A carregar...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Etiqueta (eyebrow)</Label>
          <Input value={current.eyebrow || ""} onChange={(e) => setForm({ ...current, eyebrow: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={current.is_active ?? true} onCheckedChange={(v) => setForm({ ...current, is_active: v })} />
          <Label>Secção ativa na home</Label>
        </div>
      </div>
      <div>
        <Label>Título</Label>
        <Input value={current.title || ""} onChange={(e) => setForm({ ...current, title: e.target.value })} />
      </div>
      <div>
        <Label>Subtítulo / descrição</Label>
        <Textarea rows={3} value={current.subtitle || ""} onChange={(e) => setForm({ ...current, subtitle: e.target.value })} />
      </div>
      <StorageImageUploader
        value={current.image_url || ""}
        onChange={(url) => setForm({ ...current, image_url: url })}
        bucket="banners" folder="home-cta"
        label="Imagem de fundo (recomendado 1920×1080)"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><Label>Botão principal — texto</Label><Input value={current.cta_text || ""} onChange={(e) => setForm({ ...current, cta_text: e.target.value })} /></div>
        <div><Label>Botão principal — link</Label><Input value={current.cta_url || ""} onChange={(e) => setForm({ ...current, cta_url: e.target.value })} /></div>
        <div><Label>Botão secundário — texto</Label><Input value={current.secondary_cta_text || ""} onChange={(e) => setForm({ ...current, secondary_cta_text: e.target.value })} /></div>
        <div><Label>Botão secundário — link</Label><Input value={current.secondary_cta_url || ""} onChange={(e) => setForm({ ...current, secondary_cta_url: e.target.value })} /></div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate(current)} disabled={save.isPending}>
          <Save className="h-4 w-4 mr-2" /> Guardar
        </Button>
      </div>
    </div>
  );
};

/* ─────────────── Generic item editor ─────────────── */
const ItemRow = ({ item, fields, onSave, onDelete }: any) => {
  const [form, setForm] = useState<any>(item);
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 space-y-3">
        {fields.includes("image") && (
          <StorageImageUploader
            value={form.image_url || ""}
            onChange={(url) => setForm({ ...form, image_url: url })}
            bucket="banners" folder="home-items"
            label="Imagem"
            previewAspect="aspect-video"
          />
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.includes("title") && (
            <div><Label>Título</Label><Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          )}
          {fields.includes("icon") && (
            <IconPicker value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} />
          )}
          {fields.includes("stat") && (
            <>
              <div><Label>Valor (ex: 4,9/5)</Label><Input value={form.stat_value || ""} onChange={(e) => setForm({ ...form, stat_value: e.target.value })} /></div>
              <div><Label>Rótulo (ex: avaliação Google)</Label><Input value={form.stat_label || ""} onChange={(e) => setForm({ ...form, stat_label: e.target.value })} /></div>
            </>
          )}
          {fields.includes("author") && (
            <>
              <div><Label>Nome</Label><Input value={form.author_name || ""} onChange={(e) => setForm({ ...form, author_name: e.target.value })} /></div>
              <div><Label>Cargo / Marca</Label><Input value={form.author_role || ""} onChange={(e) => setForm({ ...form, author_role: e.target.value })} /></div>
              <div><Label>Localização</Label><Input value={form.author_location || ""} onChange={(e) => setForm({ ...form, author_location: e.target.value })} /></div>
              <div><Label>Estrelas (1-5)</Label><Input type="number" min={1} max={5} value={form.rating || 5} onChange={(e) => setForm({ ...form, rating: parseInt(e.target.value) })} /></div>
            </>
          )}
          <div><Label>Ordem</Label><Input type="number" value={form.display_order || 0} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) })} /></div>
        </div>
        {fields.includes("body") && (
          <div><Label>Texto</Label><Textarea rows={3} value={form.body || ""} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
        )}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label className="text-xs">Ativo</Label>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onDelete(form.id)}><Trash2 className="h-4 w-4" /></Button>
            <Button size="sm" onClick={() => onSave(form)}><Save className="h-4 w-4 mr-1" /> Guardar</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ItemsManager = ({ sectionKey, kind, fields, defaults, title, description }: any) => {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useItems(sectionKey, kind);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["home_items", sectionKey, kind] });
    qc.invalidateQueries({ queryKey: ["home_section_items"] });
  };
  const save = useMutation({
    mutationFn: async (data: any) => {
      const { id, ...rest } = data;
      const { error } = await (supabase as any).from("home_section_items").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item guardado"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Eliminar este item?")) throw new Error("cancelado");
      const { error } = await (supabase as any).from("home_section_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item eliminado"); invalidate(); },
    onError: (e: any) => { if (e.message !== "cancelado") toast.error(e.message); },
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("home_section_items").insert([{
        section_key: sectionKey, kind, display_order: items.length + 1, is_active: true, ...defaults,
      }]);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item criado"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <Button size="sm" onClick={() => add.mutate()}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">A carregar...</p> :
         items.length === 0 ? <p className="text-sm text-muted-foreground">Sem itens. Adiciona o primeiro.</p> :
         items.map((it: any) => (
           <ItemRow key={it.id} item={it} fields={fields}
             onSave={(d: any) => save.mutate(d)}
             onDelete={(id: string) => del.mutate(id)} />
         ))}
      </CardContent>
    </Card>
  );
};

/* ─────────────── Testimonials + Google tab ─────────────── */

/* ─────────────── Gallery ("Em produção") tab ─────────────── */
const GalleryTab = () => {
  const qc = useQueryClient();
  const { data: section } = useSection("gallery");
  const [form, setForm] = useState<any>(null);
  const current = form ?? section ?? {};
  const save = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await (supabase as any).from("home_sections")
        .update({
          eyebrow: data.eyebrow, title: data.title, subtitle: data.subtitle,
          is_active: data.is_active,
        }).eq("key", "gallery");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cabeçalho atualizado");
      qc.invalidateQueries({ queryKey: ["home_section", "gallery"] });
      qc.invalidateQueries({ queryKey: ["home_sections"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro a guardar"),
  });

  if (!section && !form) return <div className="text-sm text-muted-foreground">A carregar...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cabeçalho da secção "Em produção"</CardTitle>
          <CardDescription>Etiqueta, título e subtítulo mostrados por cima da galeria na home.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Etiqueta (eyebrow)</Label>
              <Input value={current.eyebrow || ""} onChange={(e) => setForm({ ...current, eyebrow: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={current.is_active ?? true} onCheckedChange={(v) => setForm({ ...current, is_active: v })} />
              <Label>Secção visível na home</Label>
            </div>
          </div>
          <div>
            <Label>Título</Label>
            <Input value={current.title || ""} onChange={(e) => setForm({ ...current, title: e.target.value })} />
          </div>
          <div>
            <Label>Subtítulo (opcional)</Label>
            <Textarea rows={2} value={current.subtitle || ""} onChange={(e) => setForm({ ...current, subtitle: e.target.value })} />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => save.mutate(current)} disabled={save.isPending}>
              <Save className="h-4 w-4 mr-2" /> Guardar cabeçalho
            </Button>
          </div>
        </CardContent>
      </Card>

      <GalleryImagesManager />
    </div>
  );
};

/* ─────────────── Gallery images manager (multi-upload + reorder) ─────────────── */
const GalleryImagesManager = () => {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useItems("gallery", "gallery");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["home_items", "gallery", "gallery"] });
    qc.invalidateQueries({ queryKey: ["home_section_items"] });
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Eliminar esta imagem?")) throw new Error("cancelado");
      const { error } = await (supabase as any).from("home_section_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Imagem removida"); invalidate(); },
    onError: (e: any) => { if (e.message !== "cancelado") toast.error(e.message); },
  });

  const reorder = useMutation({
    mutationFn: async (ordered: any[]) => {
      for (let i = 0; i < ordered.length; i++) {
        const it = ordered[i];
        if (it.display_order !== i + 1) {
          const { error } = await (supabase as any).from("home_section_items")
            .update({ display_order: i + 1 }).eq("id", it.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message),
  });

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const startOrder = items.length;
      const rows: any[] = [];
      let idx = 0;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name}: máx. 10 MB`);
          continue;
        }
        const ext = file.name.split(".").pop() || "jpg";
        const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `home-gallery/${name}`;
        const { error: upErr } = await supabase.storage.from("banners").upload(path, file, { upsert: true });
        if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
        const { data: pub } = supabase.storage.from("banners").getPublicUrl(path);
        rows.push({
          section_key: "gallery", kind: "gallery",
          display_order: startOrder + (++idx), is_active: true,
          image_url: pub.publicUrl, title: "", body: "",
        });
      }
      if (rows.length) {
        const { error } = await (supabase as any).from("home_section_items").insert(rows);
        if (error) throw error;
        toast.success(`${rows.length} imagem(ns) adicionada(s)`);
        invalidate();
      }
    } catch (e: any) {
      toast.error(e.message || "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const updateTitle = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await (supabase as any).from("home_section_items")
        .update({ title }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Imagens da galeria</CardTitle>
          <CardDescription>
            Adiciona várias imagens em simultâneo. Arrasta pela ordem usando as setas — assim aparecem na home.
            Título é opcional (mostrado como pequena etiqueta).
          </CardDescription>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Adicionar imagens
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem imagens. Adiciona as primeiras (podes selecionar várias de uma vez).</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {items.map((it: any, i: number) => (
              <div key={it.id} className="group relative rounded-lg overflow-hidden border border-border bg-muted">
                <div className="aspect-square">
                  <img src={it.image_url} alt={it.title || ""} className="h-full w-full object-cover" />
                </div>
                <div className="p-2 space-y-2">
                  <Input
                    placeholder="Título (opcional)"
                    defaultValue={it.title || ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (it.title || "")) updateTitle.mutate({ id: it.id, title: v });
                    }}
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7"
                        disabled={i === 0 || reorder.isPending}
                        onClick={() => move(i, -1)}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7"
                        disabled={i === items.length - 1 || reorder.isPending}
                        onClick={() => move(i, 1)}>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                      onClick={() => del.mutate(it.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ─────────────── Testimonials + Google tab ─────────────── */
const TestimonialsAndGoogleTab = () => {
  const qc = useQueryClient();
  const { data: section } = useSection("testimonials");
  const [form, setForm] = useState<any>(null);
  const current = form ?? section ?? {};

  const saveSection = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await (supabase as any).from("home_sections")
        .update({
          eyebrow: data.eyebrow, title: data.title, subtitle: data.subtitle,
          cta_text: data.cta_text, cta_url: data.cta_url,
          secondary_cta_text: data.secondary_cta_text, secondary_cta_url: data.secondary_cta_url,
          is_active: data.is_active,
        }).eq("key", "testimonials");
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Secção atualizada"); qc.invalidateQueries({ queryKey: ["home_sections"] }); qc.invalidateQueries({ queryKey: ["home_section", "testimonials"] }); },
  });

  // Google settings (store_settings)
  const { data: gs } = useQuery({
    queryKey: ["google_review_admin"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("store_settings")
        .select("key, value")
        .in("key", ["google_place_id", "google_maps_review_url", "google_rating_cache"]);
      if (error) throw error;
      const out: any = {};
      (data || []).forEach((r: any) => { out[r.key] = r.value; });
      return {
        place_id: out.google_place_id || "",
        review_url: out.google_maps_review_url || "",
        rating: out.google_rating_cache?.rating ?? "",
        total: out.google_rating_cache?.total ?? "",
        updated_at: out.google_rating_cache?.updated_at ?? null,
      };
    },
  });
  const [gform, setGform] = useState<any>(null);
  const gcurrent = gform ?? gs ?? {};

  const saveGoogle = useMutation({
    mutationFn: async (g: any) => {
      const upserts = [
        { key: "google_place_id", value: JSON.stringify(g.place_id || "") },
        { key: "google_maps_review_url", value: JSON.stringify(g.review_url || "") },
        { key: "google_rating_cache", value: JSON.stringify({
          rating: g.rating === "" ? null : Number(g.rating),
          total: g.total === "" ? null : Number(g.total),
          updated_at: new Date().toISOString(),
        }) },
      ];
      for (const u of upserts) {
        const { error } = await (supabase as any).from("store_settings")
          .upsert({ key: u.key, value: JSON.parse(u.value) }, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Configuração Google guardada"); qc.invalidateQueries({ queryKey: ["google_review_admin"] }); qc.invalidateQueries({ queryKey: ["google_review_settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cabeçalho da secção "Quem imprime connosco"</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Etiqueta</Label><Input value={current.eyebrow || ""} onChange={(e) => setForm({ ...current, eyebrow: e.target.value })} /></div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={current.is_active ?? true} onCheckedChange={(v) => setForm({ ...current, is_active: v })} />
              <Label>Secção ativa</Label>
            </div>
          </div>
          <div><Label>Título</Label><Input value={current.title || ""} onChange={(e) => setForm({ ...current, title: e.target.value })} /></div>
          <div><Label>Subtítulo</Label><Textarea rows={2} value={current.subtitle || ""} onChange={(e) => setForm({ ...current, subtitle: e.target.value })} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>CTA — texto</Label><Input value={current.cta_text || ""} onChange={(e) => setForm({ ...current, cta_text: e.target.value })} placeholder="Deixar avaliação no Google" /></div>
            <div><Label>CTA — link</Label><Input value={current.cta_url || ""} onChange={(e) => setForm({ ...current, cta_url: e.target.value })} placeholder="URL para deixar avaliação" /></div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => saveSection.mutate(current)} disabled={saveSection.isPending}><Save className="h-4 w-4 mr-2" />Guardar cabeçalho</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Star className="h-4 w-4 text-primary" /> Nota Google Maps</CardTitle>
          <CardDescription>
            Mostra a nota da loja no Google Maps. Para sincronização automática precisas de ligar o conector Google Maps Platform; por agora podes introduzir os valores manualmente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Google Place ID</Label><Input value={gcurrent.place_id || ""} onChange={(e) => setGform({ ...gcurrent, place_id: e.target.value })} placeholder="ChIJ..." /></div>
            <div><Label>Link para deixar avaliação (Google Maps)</Label><Input value={gcurrent.review_url || ""} onChange={(e) => setGform({ ...gcurrent, review_url: e.target.value })} placeholder="https://g.page/r/..." /></div>
            <div><Label>Nota atual (ex: 4.9)</Label><Input value={gcurrent.rating ?? ""} onChange={(e) => setGform({ ...gcurrent, rating: e.target.value })} /></div>
            <div><Label>Total de avaliações</Label><Input value={gcurrent.total ?? ""} onChange={(e) => setGform({ ...gcurrent, total: e.target.value })} /></div>
          </div>
          {gcurrent.updated_at && (
            <p className="text-xs text-muted-foreground">Última atualização: {new Date(gcurrent.updated_at).toLocaleString("pt-PT")}</p>
          )}
          <div className="flex justify-end">
            <Button onClick={() => saveGoogle.mutate(gcurrent)} disabled={saveGoogle.isPending}><Save className="h-4 w-4 mr-2" />Guardar Google</Button>
          </div>
        </CardContent>
      </Card>

      <TestimonialsManager />
    </div>
  );
};

/* ─────────────── Testimonials manager (with moderation, list, pagination) ─────────────── */
const PAGE_SIZE = 5;

const TestimonialsManager = () => {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data: all = [], isLoading } = useQuery({
    queryKey: ["admin_testimonials_all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("home_section_items")
        .select("*")
        .eq("section_key", "testimonials")
        .eq("kind", "testimonial")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin_testimonials_all"] });
    qc.invalidateQueries({ queryKey: ["home_section_items"] });
  };

  const pending = all.filter((t: any) => t.status === "pending");
  const approved = all.filter((t: any) => t.status !== "pending");
  const pageCount = Math.max(1, Math.ceil(approved.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = approved.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await (supabase as any).from("home_section_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success("Testemunho atualizado"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Eliminar este testemunho?")) throw new Error("cancelado");
      const { error } = await (supabase as any).from("home_section_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Eliminado"); invalidate(); },
    onError: (e: any) => { if (e.message !== "cancelado") toast.error(e.message); },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("home_section_items").insert([{
        section_key: "testimonials", kind: "testimonial",
        display_order: approved.length + 1, is_active: true, status: "approved",
        author_name: "Novo cliente", rating: 5, body: "",
      }]);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Testemunho criado"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  // Endereço público da loja (VITE_SITE_URL), para não copiar o link da pré-visualização.
  const reviewLink = `${siteUrl()}/deixar-avaliacao`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reviewLink);
      toast.success("Link copiado para a área de transferência");
    } catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <div className="space-y-4">
      {/* Public review link */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Link público para deixar avaliação</p>
            <p className="text-xs text-muted-foreground truncate">{reviewLink}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Partilha este link com clientes. Avaliações ficam pendentes até seres tu a aprovar.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={copyLink}><Copy className="h-4 w-4 mr-1.5" />Copiar link</Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={reviewLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" />Abrir
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending moderation */}
      {pending.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Pendentes de aprovação
              <Badge variant="secondary">{pending.length}</Badge>
            </CardTitle>
            <CardDescription>Recebidas pelo formulário público — só aparecem na home depois de aprovadas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((t: any) => (
              <div key={t.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{t.author_name || "Sem nome"}</p>
                      <span className="text-xs text-muted-foreground">{t.author_role || ""}</span>
                      {t.author_location && <span className="text-[10px] text-primary uppercase tracking-wider">{t.author_location}</span>}
                      <span className="inline-flex items-center gap-0.5 text-amber-500 text-xs">
                        {Array.from({ length: t.rating || 5 }).map((_, i) => <Star key={i} className="h-3 w-3 fill-current" />)}
                      </span>
                    </div>
                    <p className="text-sm mt-1 text-foreground/90 whitespace-pre-line">{t.body}</p>
                    {t.submitter_email && <p className="text-[11px] text-muted-foreground mt-1">{t.submitter_email}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" onClick={() => update.mutate({ id: t.id, patch: { status: "approved", is_active: true } })}>
                      <Check className="h-4 w-4 mr-1" />Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => update.mutate({ id: t.id, patch: { status: "rejected", is_active: false } })}>
                      <X className="h-4 w-4 mr-1" />Rejeitar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => del.mutate(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Approved list */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Testemunhos publicados</CardTitle>
            <CardDescription>{approved.length} no total · clica para expandir e editar</CardDescription>
          </div>
          <Button size="sm" onClick={() => add.mutate()}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar...</p>
          ) : approved.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem testemunhos. Adiciona o primeiro ou partilha o link público.</p>
          ) : (
            <>
              <Accordion type="multiple" className="w-full">
                {pageItems.map((t: any) => (
                  <AccordionItem key={t.id} value={t.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 text-left flex-1 min-w-0">
                        <img
                          src={t.image_url || "/placeholder.svg"}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover border border-border"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{t.author_name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground truncate">{t.body?.slice(0, 80) || "—"}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!t.is_active && <Badge variant="outline" className="text-[10px]">oculto</Badge>}
                          <span className="inline-flex text-amber-500">
                            {Array.from({ length: t.rating || 5 }).map((_, i) => <Star key={i} className="h-3 w-3 fill-current" />)}
                          </span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <TestimonialEditor item={t} onSave={(patch) => update.mutate({ id: t.id, patch })} onDelete={() => del.mutate(t.id)} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              {pageCount > 1 && (
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">Página {safePage} de {pageCount}</p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const TestimonialEditor = ({ item, onSave, onDelete }: any) => {
  const [form, setForm] = useState<any>(item);
  return (
    <div className="space-y-3 pt-2">
      <StorageImageUploader
        value={form.image_url || ""}
        onChange={(url) => setForm({ ...form, image_url: url })}
        bucket="banners" folder="home-items"
        label="Foto"
        previewAspect="aspect-square"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><Label>Nome</Label><Input value={form.author_name || ""} onChange={(e) => setForm({ ...form, author_name: e.target.value })} /></div>
        <div><Label>Cargo / Marca</Label><Input value={form.author_role || ""} onChange={(e) => setForm({ ...form, author_role: e.target.value })} /></div>
        <div><Label>Localização</Label><Input value={form.author_location || ""} onChange={(e) => setForm({ ...form, author_location: e.target.value })} /></div>
        <div><Label>Estrelas (1-5)</Label><Input type="number" min={1} max={5} value={form.rating || 5} onChange={(e) => setForm({ ...form, rating: parseInt(e.target.value) || 5 })} /></div>
        <div><Label>Ordem</Label><Input type="number" value={form.display_order || 0} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })} /></div>
      </div>
      <div><Label>Texto</Label><Textarea rows={3} value={form.body || ""} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label className="text-xs">Visível na home</Label>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => onSave({
            image_url: form.image_url, author_name: form.author_name, author_role: form.author_role,
            author_location: form.author_location, rating: form.rating, display_order: form.display_order,
            body: form.body, is_active: form.is_active,
          })}><Save className="h-4 w-4 mr-1" />Guardar</Button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────── Product Sections tab ─────────────── */
const SOURCE_OPTIONS = [
  { value: "featured", label: "Destaques (produtos com is_featured = true)" },
  { value: "promo", label: "Em promoção (promo_active = true)" },
  { value: "bestsellers", label: "Mais vendidos (ordenado por vendas)" },
  { value: "low_stock", label: "Quase a esgotar (stock 1–10)" },
  { value: "new_arrivals", label: "Novidades (is_new = true)" },
  { value: "customizable", label: "Personalizáveis" },
  { value: "ready_made", label: "Prontos a comprar (já personalizados)" },
  { value: "category", label: "Categoria específica" },
];

const ProductSectionsTab = () => {
  const qc = useQueryClient();
  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["admin_home_product_sections"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("home_product_sections").select("*").order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["admin_categories_slug"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("categories").select("name,slug").eq("is_active", true);
      return data || [];
    },
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin_home_product_sections"] });
    qc.invalidateQueries({ queryKey: ["home_product_sections_public"] });
  };
  const save = useMutation({
    mutationFn: async ({ id, patch }: any) => {
      const { error } = await (supabase as any).from("home_product_sections").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Secção guardada"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Eliminar esta secção da home?")) throw new Error("cancelado");
      const { error } = await (supabase as any).from("home_product_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Secção eliminada"); invalidate(); },
    onError: (e: any) => { if (e.message !== "cancelado") toast.error(e.message); },
  });
  const add = useMutation({
    mutationFn: async () => {
      const key = `custom-${Date.now()}`;
      const { error } = await (supabase as any).from("home_product_sections").insert([{
        key, title: "Nova secção", eyebrow: "Curadoria", source: "featured",
        cta_text: "Ver todos", cta_url: "/produtos", item_limit: 8, layout: "carousel",
        display_order: (sections.length + 1) * 10, is_active: true,
      }]);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Secção criada"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Secções de produtos na home</CardTitle>
          <CardDescription>
            Gere que blocos de produtos aparecem na página inicial (Destaques, Em Promoção, Mais Vendidos, Novidades, Quase a esgotar, etc.),
            a sua ordem e o botão "Ver mais".
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => add.mutate()}><Plus className="h-4 w-4 mr-1" /> Nova secção</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">A carregar...</p> :
         sections.length === 0 ? <p className="text-sm text-muted-foreground">Sem secções configuradas.</p> :
         <Accordion type="multiple" className="w-full">
           {sections.map((s: any) => (
             <ProductSectionRow key={s.id} section={s} categories={categories}
               onSave={(patch: any) => save.mutate({ id: s.id, patch })}
               onDelete={() => del.mutate(s.id)} />
           ))}
         </Accordion>
        }
      </CardContent>
    </Card>
  );
};

const ProductSectionRow = ({ section, categories, onSave, onDelete }: any) => {
  const [f, setF] = useState<any>(section);
  return (
    <AccordionItem value={section.id}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3 text-left flex-1 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{section.title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {SOURCE_OPTIONS.find(o => o.value === section.source)?.label || section.source}
              {" · "}ordem {section.display_order}
            </p>
          </div>
          {!section.is_active && <Badge variant="outline" className="text-[10px]">oculta</Badge>}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Etiqueta (eyebrow)</Label><Input value={f.eyebrow || ""} onChange={(e) => setF({ ...f, eyebrow: e.target.value })} /></div>
            <div><Label>Título</Label><Input value={f.title || ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          </div>
          <div><Label>Subtítulo</Label><Textarea rows={2} value={f.subtitle || ""} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Fonte de produtos</Label>
              <select className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
                {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {f.source === "category" && (
              <div>
                <Label>Categoria (slug)</Label>
                <select className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm" value={f.category_slug || ""} onChange={(e) => setF({ ...f, category_slug: e.target.value })}>
                  <option value="">— escolher —</option>
                  {categories.map((c: any) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label>Layout</Label>
              <select className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm" value={f.layout} onChange={(e) => setF({ ...f, layout: e.target.value })}>
                <option value="carousel">Carrossel (com autoplay + setas)</option>
                <option value="grid">Grelha estática</option>
              </select>
            </div>
            <div><Label>Nº máx. de produtos</Label><Input type="number" min={1} max={24} value={f.item_limit || 8} onChange={(e) => setF({ ...f, item_limit: parseInt(e.target.value) || 8 })} /></div>
            <div><Label>Ordem de exibição</Label><Input type="number" value={f.display_order || 0} onChange={(e) => setF({ ...f, display_order: parseInt(e.target.value) || 0 })} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Botão "Ver mais" — texto</Label><Input value={f.cta_text || ""} onChange={(e) => setF({ ...f, cta_text: e.target.value })} placeholder="Ver todos" /></div>
            <div><Label>Botão "Ver mais" — link</Label><Input value={f.cta_url || ""} onChange={(e) => setF({ ...f, cta_url: e.target.value })} placeholder="/produtos" /></div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Switch checked={f.is_active ?? true} onCheckedChange={(v) => setF({ ...f, is_active: v })} />
              <Label className="text-xs">Visível na home</Label>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
              <Button size="sm" onClick={() => onSave({
                eyebrow: f.eyebrow, title: f.title, subtitle: f.subtitle,
                source: f.source, category_slug: f.source === "category" ? f.category_slug : null,
                cta_text: f.cta_text, cta_url: f.cta_url, item_limit: f.item_limit,
                layout: f.layout, display_order: f.display_order, is_active: f.is_active,
              })}><Save className="h-4 w-4 mr-1" />Guardar</Button>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

/* ─────────────── Root component ─────────────── */
const AdminHomeContent = () => {
  return (
    <Tabs defaultValue="product-sections" className="space-y-4">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="product-sections">Secções de Produtos</TabsTrigger>
        <TabsTrigger value="cta">CTA Produção</TabsTrigger>
        <TabsTrigger value="features">O que nos destaca</TabsTrigger>
        <TabsTrigger value="gallery">Em produção (galeria)</TabsTrigger>
        <TabsTrigger value="testimonials">Quem imprime connosco</TabsTrigger>
      </TabsList>
      <TabsContent value="product-sections"><ProductSectionsTab /></TabsContent>
      <TabsContent value="cta"><CtaProductionTab /></TabsContent>
      <TabsContent value="features" className="space-y-4">
        <ItemsManager
          sectionKey="features" kind="feature"
          fields={["image", "title", "icon", "stat", "body"]}
          defaults={{ title: "Nova característica", icon: "Sparkles", stat_value: "" }}
          title="Cartões de características (max. recomendado: 5)"
          description="Cada item mostra uma imagem, ícone, badge de destaque e texto descritivo."
        />
        <ItemsManager
          sectionKey="features" kind="trust_stat"
          fields={["icon", "stat"]}
          defaults={{ icon: "Award", stat_value: "100%", stat_label: "rótulo" }}
          title="Selos de confiança (4 cartões)"
          description="Pequenos cartões com ícone, número e rótulo, exibidos abaixo das features."
        />
      </TabsContent>
      <TabsContent value="gallery"><GalleryTab /></TabsContent>
      <TabsContent value="testimonials"><TestimonialsAndGoogleTab /></TabsContent>
    </Tabs>
  );
};

export default AdminHomeContent;
