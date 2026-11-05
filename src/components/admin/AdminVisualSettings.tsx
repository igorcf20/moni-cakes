import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { EyeOff, Save, Layout, Megaphone, PanelTop, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { adminHref } from "@/components/admin/shell/adminSections";
import { usePopupT } from "@/components/admin/popups/fields";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

interface VisualSettings {
  section_styles: {
    hero: string;
    featured: string;
    testimonials: string;
  };
  hidden_categories: string[];
  broadcast_modal: {
    style: string;
    title: string;
    description: string;
    button_text: string;
    discount_code: string;
    terms_text: string;
    enabled: boolean;
  };
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  header_sticky: boolean;
  announcement_bar: {
    enabled: boolean;
    text: string;
    link: string;
    bg_color: string;
    text_color: string;
  };
}

const AdminVisualSettings = () => {
  const { t: pt } = usePopupT();
  const queryClient = useQueryClient();
  const [visualSettings, setVisualSettings] = useState<VisualSettings>({
    section_styles: { hero: "default", featured: "grid", testimonials: "carousel" },
    hidden_categories: [],
    broadcast_modal: {
      style: "modern",
      title: "Participe da nossa Lista VIP",
      description: "Receba descontos exclusivos e novidades em primeira mão!",
      button_text: "Quero entrar na lista",
      discount_code: "VIP10",
      terms_text: "Aceito os termos e condições para receber o desconto.",
      enabled: false,
    },
    // Campos antigos da marca: mantidos só para não apagar o que já estava gravado.
    // A marca agora vive em Admin > Marca e visual (chave store_brand, src/components/admin/brand).
    logo_url: "",
    primary_color: "",
    secondary_color: "",
    font_family: "",
    header_sticky: true,
    announcement_bar: {
      enabled: false,
      text: "",
      link: "",
      bg_color: "#000000",
      text_color: "#ffffff"
    }
  });

  const { data: settings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ["storeSettings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const visualSetting = settings.find((s) => s.key === "visual_settings");
    if (visualSetting && visualSetting.value) {
      // Junta com os padrões: um registo antigo pode não ter todos os blocos (ex.: só broadcast_modal).
      const v = visualSetting.value as unknown as Partial<VisualSettings>;
      setVisualSettings((prev) => ({
        ...prev, ...v,
        section_styles: { ...prev.section_styles, ...v.section_styles },
        broadcast_modal: { ...prev.broadcast_modal, ...v.broadcast_modal },
        announcement_bar: { ...prev.announcement_bar, ...v.announcement_bar },
        hidden_categories: v.hidden_categories ?? prev.hidden_categories,
      }));
    }
  }, [settings]);

  const saveVisualSettings = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("store_settings")
        .upsert(
          { key: "visual_settings", value: visualSettings as unknown as Json, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storeSettings"] });
      toast.success("Design atualizado com sucesso!");
    },
    onError: () => toast.error("Erro ao guardar"),
  });

  const toggleCategory = (categoryId: string) => {
    setVisualSettings((prev) => ({
      ...prev,
      hidden_categories: prev.hidden_categories.includes(categoryId)
        ? prev.hidden_categories.filter((id) => id !== categoryId)
        : [...prev.hidden_categories, categoryId],
    }));
  };

  if (settingsLoading || categoriesLoading) return <Skeleton className="h-[600px] w-full rounded-xl" />;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <p className="text-sm text-muted-foreground">
          Logo, cores e fontes ficam em <strong>Marca e visual</strong>. Aqui: avisos, pop-up e visibilidade.
        </p>
        <Button onClick={() => saveVisualSettings.mutate()} disabled={saveVisualSettings.isPending} size="lg" className="shadow-lg">
          <Save className="h-4 w-4 mr-2" />
          {saveVisualSettings.isPending ? "A guardar..." : "Publicar Alterações"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Announcement Bar */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="h-5 w-5 text-primary" /> Barra de Anúncios
            </CardTitle>
            <CardDescription>Aviso fixo no topo de todas as páginas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
              <Label>Habilitar Barra</Label>
              <Switch
                checked={visualSettings.announcement_bar.enabled}
                onCheckedChange={(v) => setVisualSettings({ 
                  ...visualSettings, 
                  announcement_bar: { ...visualSettings.announcement_bar, enabled: v } 
                })}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto do Anúncio</Label>
              <Input
                value={visualSettings.announcement_bar.text}
                onChange={(e) => setVisualSettings({ 
                  ...visualSettings, 
                  announcement_bar: { ...visualSettings.announcement_bar, text: e.target.value } 
                })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fundo (BG)</Label>
                <Input
                  type="color"
                  value={visualSettings.announcement_bar.bg_color}
                  onChange={(e) => setVisualSettings({ 
                    ...visualSettings, 
                    announcement_bar: { ...visualSettings.announcement_bar, bg_color: e.target.value } 
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>Texto (Color)</Label>
                <Input
                  type="color"
                  value={visualSettings.announcement_bar.text_color}
                  onChange={(e) => setVisualSettings({ 
                    ...visualSettings, 
                    announcement_bar: { ...visualSettings.announcement_bar, text_color: e.target.value } 
                  })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Home Sections Layout */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layout className="h-5 w-5 text-primary" /> Layout da Home
            </CardTitle>
            <CardDescription>Escolha o estilo de exibição das seções.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Banner Principal (Hero)</Label>
              <Select
                value={visualSettings.section_styles.hero}
                onValueChange={(val) => setVisualSettings({ 
                  ...visualSettings, 
                  section_styles: { ...visualSettings.section_styles, hero: val } 
                })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Lado a Lado (Padrão)</SelectItem>
                  <SelectItem value="full">Largura Total (Full)</SelectItem>
                  <SelectItem value="minimal">Minimalista (Centro)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vitrine de Produtos</Label>
              <Select
                value={visualSettings.section_styles.featured}
                onValueChange={(val) => setVisualSettings({ 
                  ...visualSettings, 
                  section_styles: { ...visualSettings.section_styles, featured: val } 
                })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">Grade de Cards</SelectItem>
                  <SelectItem value="carousel">Carrossel (Slider)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20 mt-4">
              <Label>Menu Fixo (Sticky Header)</Label>
              <Switch
                checked={visualSettings.header_sticky}
                onCheckedChange={(v) => setVisualSettings({ ...visualSettings, header_sticky: v })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Categories & Visibility */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <EyeOff className="h-5 w-5 text-primary" /> Visibilidade
            </CardTitle>
            <CardDescription>Oculte categorias do menu ou home se necessário.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-3 p-2 border rounded-xl hover:bg-muted/30 transition-colors">
                  <Checkbox
                    id={`cat-${cat.id}`}
                    checked={visualSettings.hidden_categories.includes(cat.id)}
                    onCheckedChange={() => toggleCategory(cat.id)}
                  />
                  <Label htmlFor={`cat-${cat.id}`} className="text-xs font-medium cursor-pointer flex-1">
                    {cat.name}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* O antigo Modal VIP passou para Admin > Pop-ups de captação (dados em broadcast_modal viram o modelo Modal VIP). */}
        <Card className="lg:col-span-2 shadow-sm border-primary/20 bg-[hsl(var(--brand-orange-soft))]">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><PanelTop className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold">{pt("moved_title")}</p>
              <p className="text-sm text-muted-foreground">{pt("moved_d")}</p>
            </div>
            <Button asChild className="shrink-0">
              <Link to={adminHref.section("popups")}>{pt("moved_open")}<ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminVisualSettings;
