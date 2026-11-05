import { STORE_DEFAULTS } from "@/config/store";
import { Link } from "react-router-dom";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Store, CreditCard, Save, Settings, Globe, Coins, Share2, Search, Sliders, ShieldAlert, Mail, Phone, MapPin, Instagram, Facebook, MessageSquare, ExternalLink, Shield, Clock, Star, Headphones, RotateCcw, Truck, FileSearch } from "lucide-react";
import StorageImageUploader from "./StorageImageUploader";
import { COUNTRIES } from "@/utils/countries";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StorageUsageCard from "./StorageUsageCard";
import { HardDrive } from "lucide-react";

interface StoreInfo {
  name: string;
  email: string;
  phone: string;
  nif: string;
  address: string;
  footer_text: string;
}

interface Benefit {
  icon: string;
  title: string;
  desc: string;
}

interface SocialLinks {
  instagram: string;
  whatsapp: string;
  facebook: string;
  tiktok: string;
}

interface OperationalSettings {
  maintenance_mode: boolean;
  min_order_value: number;
  support_email: string;
  support_phone: string;
}

interface InternationalShipping {
  enabled: boolean;
  allowed_countries: string[];
  default_country: string;
}

const AdminSettings = () => {
  const queryClient = useQueryClient();
  
  const [storeInfo, setStoreInfo] = useState<StoreInfo>({
    name: STORE_DEFAULTS.name,
    email: "",
    phone: "",
    nif: "",
    address: "",
    footer_text: "",
  });

  const [benefits, setBenefits] = useState<Benefit[]>([]);

  const [socialLinks, setSocialLinks] = useState<SocialLinks>({
    instagram: "",
    whatsapp: "",
    facebook: "",
    tiktok: "",
  });

  const [operationalSettings, setOperationalSettings] = useState<OperationalSettings>({
    maintenance_mode: false,
    min_order_value: 0,
    support_email: "",
    support_phone: "",
  });
  
  const [internationalShipping, setInternationalShipping] = useState<InternationalShipping>({
    enabled: true,
    allowed_countries: ['PT', 'ES', 'FR', 'GB', 'DE', 'IT', 'NL', 'BE', 'LU'],
    default_country: 'PT',
  });
  const [storeOrigin, setStoreOrigin] = useState<string>('PT');

  // Manual review (file analysis fee) + PDF transparency thresholds
  const [manualReview, setManualReview] = useState({
    enabled: true,
    price_per_m2: 1,
    min_price: 1,
    description:
      "O ficheiro pode mesmo assim ser recusado pela equipa após análise. Nesse caso será pedido um novo ficheiro e a taxa de análise não é reembolsada.",
  });
  const [pdfThresholds, setPdfThresholds] = useState({
    block: 0.99,
    warn: 0.92,
  });
  const [pdfAutoAnalysis, setPdfAutoAnalysis] = useState(true);

  // Visual-settings-backed fields (shipping window + print quality warning copy).
  const [printQuality, setPrintQuality] = useState({
    low_dpi_threshold: 300,
    warning_dpi_threshold: 200,
    low_dpi_title: "Imagem com baixa resolução",
    low_dpi_body:
      "A imagem enviada tem DPI inferior ao recomendado (300 dpi). A impressão pode sair com qualidade reduzida — bordas suaves, perda de nitidez ou pixelização. Confirma que aceitas continuar mesmo assim.",
    low_dpi_checkbox:
      "Aceito que a impressão pode sair com qualidade reduzida e assumo a responsabilidade por imprimir uma imagem abaixo de 300 dpi.",
    upscale_title: "A arte foi ampliada além do recomendado",
    upscale_body:
      "Ampliaste a arte a um tamanho onde o DPI efetivo fica abaixo do mínimo recomendado (300 dpi). A impressão pode perder detalhe e nitidez. Confirma que aceitas continuar com esta dimensão.",
    upscale_checkbox:
      "Aceito a perda de qualidade ao ampliar esta arte além do limite recomendado.",
  });

  // Fetch settings
  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["storeSettings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Update state when settings load
  useEffect(() => {
    const storeInfoSetting = settings.find((s) => s.key === "store_info");
    if (storeInfoSetting?.value) setStoreInfo(storeInfoSetting.value as unknown as StoreInfo);
    
    const socialSetting = settings.find((s) => s.key === "social_links");
    if (socialSetting?.value) setSocialLinks(socialSetting.value as unknown as SocialLinks);

    const operationalSetting = settings.find((s) => s.key === "operational_settings");
    if (operationalSetting?.value) setOperationalSettings(operationalSetting.value as unknown as OperationalSettings);

    const shipSetting = settings.find((s) => s.key === "international_shipping");
    if (shipSetting?.value) setInternationalShipping(shipSetting.value as unknown as InternationalShipping);

    const originSetting = settings.find((s) => s.key === "store_origin");
    if (originSetting?.value) setStoreOrigin(originSetting.value as string);

    const benefitsSetting = settings.find((s) => s.key === "benefits_config");
    if (benefitsSetting?.value) setBenefits(benefitsSetting.value as unknown as Benefit[]);

    const mrEnabled = settings.find((s) => s.key === "manual_review_enabled");
    const mrPrice = settings.find((s) => s.key === "manual_review_price_per_m2");
    const mrMin = settings.find((s) => s.key === "manual_review_min_price");
    const mrDesc = settings.find((s) => s.key === "manual_review_description");
    setManualReview((prev) => ({
      enabled: mrEnabled ? Boolean(mrEnabled.value) : prev.enabled,
      price_per_m2: mrPrice ? Number(mrPrice.value) : prev.price_per_m2,
      min_price: mrMin ? Number(mrMin.value) : prev.min_price,
      description: mrDesc ? String(mrDesc.value) : prev.description,
    }));
    const pdfBlock = settings.find((s) => s.key === "pdf_alpha_block_threshold");
    const pdfWarn = settings.find((s) => s.key === "pdf_alpha_warn_threshold");
    setPdfThresholds((prev) => ({
      block: pdfBlock ? Number(pdfBlock.value) : prev.block,
      warn: pdfWarn ? Number(pdfWarn.value) : prev.warn,
    }));
    const pdfAuto = settings.find((s) => s.key === "pdf_auto_analysis_enabled");
    if (pdfAuto) setPdfAutoAnalysis(Boolean(pdfAuto.value));

    const vs: any = settings.find((s) => s.key === "visual_settings")?.value || {};
    if (vs?.print_quality && typeof vs.print_quality === "object") {
      setPrintQuality((p) => ({ ...p, ...vs.print_quality }));
    }
  }, [settings]);

  // Helpers to update nested visual_settings entries without losing other keys.
  const updateVisualSettings = async (patch: Record<string, any>) => {
    const current: any = settings.find((s) => s.key === "visual_settings")?.value || {};
    const merged = { ...current, ...patch };
    await saveSetting.mutateAsync({ key: "visual_settings", value: merged });
    queryClient.invalidateQueries({ queryKey: ["visualSettings"] });
  };

  // Save generic setting
  const saveSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { error } = await supabase
        .from("store_settings")
        .upsert(
          { key, value: value as unknown as Json, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["store_settings_kv"] });
      queryClient.invalidateQueries({ queryKey: ["storeSettings"] });
      toast.success(`Configuração "${variables.key}" guardada com sucesso!`);
    },
    onError: () => {
      toast.error("Erro ao guardar configuração");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">

      <Tabs defaultValue="empresa" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto justify-start gap-1 bg-muted/40 p-1">
          <TabsTrigger value="empresa" className="gap-1.5"><Store className="h-3.5 w-3.5" /> Empresa</TabsTrigger>
          <TabsTrigger value="operacao" className="gap-1.5"><Sliders className="h-3.5 w-3.5" /> Operação</TabsTrigger>
          <TabsTrigger value="seo" className="gap-1.5"><Search className="h-3.5 w-3.5" /> SEO & Social</TabsTrigger>
          <TabsTrigger value="regional" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> Regional & Moeda</TabsTrigger>
          <TabsTrigger value="armazenamento" className="gap-1.5"><HardDrive className="h-3.5 w-3.5" /> Armazenamento</TabsTrigger>
          <TabsTrigger value="configurador" className="gap-1.5"><FileSearch className="h-3.5 w-3.5" /> Configurador</TabsTrigger>
          <TabsTrigger value="entrega-impressao" className="gap-1.5"><Truck className="h-3.5 w-3.5" /> Entrega & Impressão</TabsTrigger>
        </TabsList>

        <TabsContent value="empresa" className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Store Information */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Store className="h-5 w-5 text-primary" /> Dados da Empresa
            </CardTitle>
            <CardDescription>Informações exibidas no rodapé e notas fiscais.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Loja</Label>
                <Input
                  id="name"
                  value={storeInfo.name}
                  onChange={(e) => setStoreInfo({ ...storeInfo, name: e.target.value })}
                  placeholder="Ex.: Nome da sua loja"
                />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email de Contato</Label>
                <Input
                  id="email"
                  type="email"
                  value={storeInfo.email}
                  onChange={(e) => setStoreInfo({ ...storeInfo, email: e.target.value })}
                  placeholder="contato@loja.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={storeInfo.phone}
                  onChange={(e) => setStoreInfo({ ...storeInfo, phone: e.target.value })}
                  placeholder="+351 9XX XXX XXX"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nif">NIF / NIPC</Label>
              <Input
                id="nif"
                value={storeInfo.nif}
                onChange={(e) => setStoreInfo({ ...storeInfo, nif: e.target.value })}
                placeholder="500 123 456"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Endereço Completo</Label>
              <Input
                id="address"
                value={storeInfo.address}
                onChange={(e) => setStoreInfo({ ...storeInfo, address: e.target.value })}
                placeholder="Rua, número, freguesia, localidade, distrito"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer_text">Texto Curto de Rodapé</Label>
              <Input
                id="footer_text"
                value={storeInfo.footer_text || ""}
                onChange={(e) => setStoreInfo({ ...storeInfo, footer_text: e.target.value })}
                placeholder="Ex: Lingerie premium que combina sensualidade e elegância."
              />
            </div>
            <Button 
              className="w-full sm:w-auto" 
              onClick={() => saveSetting.mutate({ key: 'store_info', value: storeInfo })}
              disabled={saveSetting.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar Dados
            </Button>
          </CardContent>
        </Card>

        {/* Store Origin */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5 text-primary" /> Origem da Loja
            </CardTitle>
            <CardDescription>Defina o país sede da sua operação de e-commerce.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store-origin">País de Origem</Label>
              <Select value={storeOrigin} onValueChange={setStoreOrigin}>
                <SelectTrigger id="store-origin">
                  <SelectValue placeholder="Selecione o país de origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PT">Portugal (PT)</SelectItem>
                  <SelectItem value="ES">Espanha (ES)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Isso afetará as opções de portes e configurações regionais disponíveis.
              </p>
            </div>
            <Button 
              className="w-full sm:w-auto" 
              onClick={() => saveSetting.mutate({ key: 'store_origin', value: storeOrigin })}
              disabled={saveSetting.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar Origem
            </Button>
          </CardContent>
        </Card>

        {/* Benefits Bar Configuration */}
        <Card className="shadow-sm border-border/50 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-primary" /> Barra de Benefícios
            </CardTitle>
            <CardDescription>Configure os 4 itens da barra de vantagens exibida na home e rodapé.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {benefits.map((benefit, idx) => (
                <div key={idx} className="space-y-4 p-4 border rounded-xl bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">Item {idx + 1}</Label>
                    <div className="h-8 w-8 rounded-lg bg-background border flex items-center justify-center">
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      value={benefit.title}
                      onChange={(e) => {
                        const newBenefits = [...benefits];
                        newBenefits[idx].title = e.target.value;
                        setBenefits(newBenefits);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      value={benefit.desc}
                      onChange={(e) => {
                        const newBenefits = [...benefits];
                        newBenefits[idx].desc = e.target.value;
                        setBenefits(newBenefits);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ícone (Nome Lucide)</Label>
                    <Select 
                      value={benefit.icon} 
                      onValueChange={(val) => {
                        const newBenefits = [...benefits];
                        newBenefits[idx].icon = val;
                        setBenefits(newBenefits);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Truck">Caminhão (Truck)</SelectItem>
                        <SelectItem value="Shield">Escudo (Shield)</SelectItem>
                        <SelectItem value="CreditCard">Cartão (CreditCard)</SelectItem>
                        <SelectItem value="RotateCcw">Troca (RotateCcw)</SelectItem>
                        <SelectItem value="Star">Estrela (Star)</SelectItem>
                        <SelectItem value="Gift">Presente (Gift)</SelectItem>
                        <SelectItem value="Clock">Relógio (Clock)</SelectItem>
                        <SelectItem value="Headphones">Suporte (Headphones)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
            <Button 
              className="w-full sm:w-auto" 
              onClick={() => saveSetting.mutate({ key: 'benefits_config', value: benefits })}
              disabled={saveSetting.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar Benefícios
            </Button>
          </CardContent>
        </Card>
        </div>
        </TabsContent>

        <TabsContent value="operacao" className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Operational & Status */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sliders className="h-5 w-5 text-primary" /> Operação & Status
            </CardTitle>
            <CardDescription>Controle o funcionamento da loja em tempo real.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/20">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  <Label className="text-base font-semibold">Modo Manutenção</Label>
                </div>
                <p className="text-xs text-muted-foreground">O site ficará inacessível para clientes.</p>
              </div>
              <Switch
                checked={operationalSettings.maintenance_mode}
                onCheckedChange={(checked) => setOperationalSettings({ ...operationalSettings, maintenance_mode: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="min-order">Valor Mínimo do Pedido (€)</Label>
              <Input
                id="min-order"
                type="number"
                value={operationalSettings.min_order_value}
                onChange={(e) => setOperationalSettings({ ...operationalSettings, min_order_value: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
              <p className="text-[10px] text-muted-foreground">Deixe 0 para não ter valor mínimo.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="support-email">Email de Suporte</Label>
                <Input
                  id="support-email"
                  value={operationalSettings.support_email}
                  onChange={(e) => setOperationalSettings({ ...operationalSettings, support_email: e.target.value })}
                  placeholder="suporte@loja.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="support-phone">WhatsApp de Suporte</Label>
                <Input
                  id="support-phone"
                  value={operationalSettings.support_phone}
                  onChange={(e) => setOperationalSettings({ ...operationalSettings, support_phone: e.target.value })}
                  placeholder="351912345678"
                />
              </div>
            </div>

            <Button 
              className="w-full sm:w-auto" 
              onClick={() => saveSetting.mutate({ key: 'operational_settings', value: operationalSettings })}
              disabled={saveSetting.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar Operação
            </Button>
          </CardContent>
        </Card>
        </div>
        </TabsContent>

        <TabsContent value="seo" className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Social Media */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Share2 className="h-5 w-5 text-primary" /> Redes Sociais
            </CardTitle>
            <CardDescription>Links para as redes sociais exibidos no site.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Instagram className="h-3.5 w-3.5" /> Instagram (URL)</Label>
              <Input
                value={socialLinks.instagram}
                onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
                placeholder="https://instagram.com/sualoja"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> WhatsApp (Link ou Número)</Label>
              <Input
                value={socialLinks.whatsapp}
                onChange={(e) => setSocialLinks({ ...socialLinks, whatsapp: e.target.value })}
                placeholder="https://wa.me/351..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Facebook className="h-3.5 w-3.5" /> Facebook (URL)</Label>
              <Input
                value={socialLinks.facebook}
                onChange={(e) => setSocialLinks({ ...socialLinks, facebook: e.target.value })}
                placeholder="https://facebook.com/sualoja"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><ExternalLink className="h-3.5 w-3.5" /> TikTok (URL)</Label>
              <Input
                value={socialLinks.tiktok}
                onChange={(e) => setSocialLinks({ ...socialLinks, tiktok: e.target.value })}
                placeholder="https://tiktok.com/@sualoja"
              />
            </div>
            <Button 
              className="w-full sm:w-auto" 
              onClick={() => saveSetting.mutate({ key: 'social_links', value: socialLinks })}
              disabled={saveSetting.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar Links
            </Button>
          </CardContent>
        </Card>

        {/* SEO: título, descrição, ícone da aba e imagem de partilha passaram para Marca e visual
            (chave store_brand). seo_settings antigo continua a ser lido como reserva (src/theme/brand.ts). */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-primary" /> SEO & Google
            </CardTitle>
            <CardDescription>
              A descrição da loja para o Google, o ícone da aba e a imagem de partilha ficam junto da marca.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/admin?tab=brand">Abrir Marca e visual</Link>
            </Button>
          </CardContent>
        </Card>
        </div>
        </TabsContent>

        <TabsContent value="regional" className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Moeda e câmbio: passou para a seção própria Admin > Moedas e câmbio (AdminCurrencies). */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5 text-primary" /> Moedas e câmbio
            </CardTitle>
            <CardDescription>A moeda base, as taxas de cada moeda e o câmbio automático pelo BCE ficam numa seção própria.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/admin?tab=currencies">Abrir Moedas e câmbio</Link>
            </Button>
          </CardContent>
        </Card>

        {/* International Shipping */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5 text-primary" /> Alcance Global
            </CardTitle>
            <CardDescription>Gira para quais países a sua loja entrega.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/20">
              <div className="space-y-0.5">
                <Label className="text-base">Vendas Internacionais</Label>
                <p className="text-xs text-muted-foreground">Permitir compras de fora do país sede.</p>
              </div>
              <Switch
                checked={internationalShipping.enabled}
                onCheckedChange={(checked) => setInternationalShipping({...internationalShipping, enabled: checked})}
              />
            </div>

            <div className="space-y-2">
              <Label>País Sede (Default)</Label>
              <Select 
                value={internationalShipping.default_country} 
                onValueChange={(v) => setInternationalShipping({...internationalShipping, default_country: v})}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.flag} {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Países Ativos</Label>
              <div className="grid grid-cols-2 gap-3 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                {COUNTRIES.filter(c => c.code !== internationalShipping.default_country).map((country) => (
                  <div key={country.code} className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/30 transition-colors">
                    <span className="text-xs truncate flex items-center gap-2">
                      <span>{country.flag}</span>
                      <span className="truncate">{country.name}</span>
                    </span>
                    <Switch 
                      className="scale-75"
                      checked={internationalShipping.allowed_countries.includes(country.code)}
                      onCheckedChange={(checked) => {
                        const next = checked 
                          ? [...internationalShipping.allowed_countries, country.code]
                          : internationalShipping.allowed_countries.filter(c => c !== country.code);
                        setInternationalShipping({...internationalShipping, allowed_countries: next});
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button 
              className="w-full sm:w-auto" 
              onClick={() => saveSetting.mutate({ key: 'international_shipping', value: internationalShipping })}
              disabled={saveSetting.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar Alcance
            </Button>
          </CardContent>
        </Card>
        </div>
        </TabsContent>

        <TabsContent value="armazenamento" className="space-y-6">
          <div className="max-w-2xl">
            <StorageUsageCard />
            <p className="text-xs text-muted-foreground mt-3">
              O limite total de 2 GB cobre imagens de produtos, banners, ficheiros enviados pelos clientes e branding.
              Para libertar espaço, elimina pedidos antigos ou ficheiros não utilizados.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="configurador" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileSearch className="h-5 w-5" /> Análise manual de ficheiros</CardTitle>
              <CardDescription>
                Cobrança opcional quando um ficheiro é automaticamente bloqueado (ex.: PDF sem transparência). O cliente pode aceitar pagar uma taxa de análise para que a equipa avalie a arte manualmente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="font-semibold">Ativar análise manual paga</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Quando desativado, ficheiros bloqueados não podem prosseguir.</p>
                </div>
                <Switch
                  checked={manualReview.enabled}
                  onCheckedChange={(v) => setManualReview((p) => ({ ...p, enabled: v }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="font-semibold">Ativar análise automática de ficheiros (PDF)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quando desativado, o site aceita qualquer PDF sem verificar transparência/fundo opaco — não é cobrada taxa automática e o ficheiro segue direto para a equipa.
                  </p>
                </div>
                <Switch
                  checked={pdfAutoAnalysis}
                  onCheckedChange={(v) => {
                    setPdfAutoAnalysis(v);
                    saveSetting.mutate({ key: "pdf_auto_analysis_enabled", value: v });
                  }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Preço por m² preenchido (€)</Label>
                  <Input
                    type="number" min={0} step={0.1}
                    value={manualReview.price_per_m2}
                    onChange={(e) => setManualReview((p) => ({ ...p, price_per_m2: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Aplicado a todos os materiais. Cálculo: área do design (largura × altura, em m²) × preço.</p>
                </div>
                <div>
                  <Label>Valor mínimo (€)</Label>
                  <Input
                    type="number" min={0} step={0.1}
                    value={manualReview.min_price}
                    onChange={(e) => setManualReview((p) => ({ ...p, min_price: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Cobrado quando o cálculo por m² for inferior a este valor.</p>
                </div>
              </div>

              <div>
                <Label>Aviso mostrado ao cliente</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border bg-background p-2 text-sm"
                  value={manualReview.description}
                  onChange={(e) => setManualReview((p) => ({ ...p, description: e.target.value }))}
                />
              </div>

              <Button
                onClick={() => {
                  saveSetting.mutate({ key: "manual_review_enabled", value: manualReview.enabled });
                  saveSetting.mutate({ key: "manual_review_price_per_m2", value: manualReview.price_per_m2 });
                  saveSetting.mutate({ key: "manual_review_min_price", value: manualReview.min_price });
                  saveSetting.mutate({ key: "manual_review_description", value: manualReview.description });
                  saveSetting.mutate({ key: "pdf_auto_analysis_enabled", value: pdfAutoAnalysis });
                }}
                className="gap-2"
              >
                <Save className="h-4 w-4" /> Guardar análise manual
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sliders className="h-5 w-5" /> Limiares de transparência (PDF)</CardTitle>
              <CardDescription>
                Percentagem de pixels totalmente opacos numa amostra do PDF. Valores mais altos = mais tolerante (deixa passar ficheiros com muito preenchimento). Valores 0–1.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Limite de bloqueio (default 0,99)</Label>
                  <Input
                    type="number" min={0} max={1} step={0.01}
                    value={pdfThresholds.block}
                    onChange={(e) => setPdfThresholds((p) => ({ ...p, block: Math.max(0, Math.min(1, Number(e.target.value) || 0)) }))}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Acima deste valor o PDF é considerado opaco e bloqueado.</p>
                </div>
                <div>
                  <Label>Limite de aviso (default 0,92)</Label>
                  <Input
                    type="number" min={0} max={1} step={0.01}
                    value={pdfThresholds.warn}
                    onChange={(e) => setPdfThresholds((p) => ({ ...p, warn: Math.max(0, Math.min(1, Number(e.target.value) || 0)) }))}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Acima deste valor mostra aviso ao cliente, mas aceita.</p>
                </div>
              </div>
              <Button
                onClick={() => {
                  saveSetting.mutate({ key: "pdf_alpha_block_threshold", value: pdfThresholds.block });
                  saveSetting.mutate({ key: "pdf_alpha_warn_threshold", value: pdfThresholds.warn });
                }}
                className="gap-2"
              >
                <Save className="h-4 w-4" /> Guardar limiares
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entrega-impressao" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Avisos de qualidade de impressão</CardTitle>
              <CardDescription>
                Textos mostrados ao cliente no configurador quando a arte arrisca sair com qualidade reduzida. O cliente tem de aceitar para continuar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>DPI mínimo recomendado</Label>
                  <Input
                    type="number" min={72} step={1}
                    value={printQuality.low_dpi_threshold === 0 ? "" : printQuality.low_dpi_threshold}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setPrintQuality((p) => ({ ...p, low_dpi_threshold: raw === "" ? 0 : Number(raw) }));
                    }}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!e.target.value || n < 72) setPrintQuality((p) => ({ ...p, low_dpi_threshold: 300 }));
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Abaixo disto, dispara o aviso de baixa qualidade.</p>
                </div>
                <div>
                  <Label>DPI efetivo crítico ao ampliar</Label>
                  <Input
                    type="number" min={72} step={1}
                    value={printQuality.warning_dpi_threshold === 0 ? "" : printQuality.warning_dpi_threshold}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setPrintQuality((p) => ({ ...p, warning_dpi_threshold: raw === "" ? 0 : Number(raw) }));
                    }}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!e.target.value || n < 72) setPrintQuality((p) => ({ ...p, warning_dpi_threshold: 200 }));
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Ao redimensionar uma arte boa, se cair abaixo deste valor o cliente vê o aviso de ampliação.</p>
                </div>
              </div>

              <Separator />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aviso de baixa resolução (DPI baixo)</p>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={printQuality.low_dpi_title} onChange={(e) => setPrintQuality((p) => ({ ...p, low_dpi_title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Texto explicativo</Label>
                <textarea
                  className="w-full min-h-[90px] rounded-md border bg-background p-2 text-sm"
                  value={printQuality.low_dpi_body}
                  onChange={(e) => setPrintQuality((p) => ({ ...p, low_dpi_body: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Texto da caixa de aceitação</Label>
                <Input value={printQuality.low_dpi_checkbox} onChange={(e) => setPrintQuality((p) => ({ ...p, low_dpi_checkbox: e.target.value }))} />
              </div>

              <Separator />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aviso de ampliação (upscale)</p>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={printQuality.upscale_title} onChange={(e) => setPrintQuality((p) => ({ ...p, upscale_title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Texto explicativo</Label>
                <textarea
                  className="w-full min-h-[90px] rounded-md border bg-background p-2 text-sm"
                  value={printQuality.upscale_body}
                  onChange={(e) => setPrintQuality((p) => ({ ...p, upscale_body: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Texto da caixa de aceitação</Label>
                <Input value={printQuality.upscale_checkbox} onChange={(e) => setPrintQuality((p) => ({ ...p, upscale_checkbox: e.target.value }))} />
              </div>

              <Button
                onClick={() => updateVisualSettings({ print_quality: printQuality })}
                className="gap-2"
              >
                <Save className="h-4 w-4" /> Guardar avisos de qualidade
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSettings;
