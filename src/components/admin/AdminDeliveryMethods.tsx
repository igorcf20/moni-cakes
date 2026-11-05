import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Save, Store, Truck, MapPin, Clock, Calendar, Info, ChevronDown, Plus, Trash2, ArrowUp, ArrowDown, Star } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ConfirmStrip } from "@/components/admin/shell/AdminPageParts";

interface DeliveryMethod {
  id: string;
  type: "pickup" | "delivery";
  name: string;
  description: string;
  is_active: boolean;
  config: Record<string, any>;
  display_order: number;
  is_default?: boolean;
}

const AdminDeliveryMethods = () => {
  const queryClient = useQueryClient();

  const { data: methods = [], isLoading } = useQuery({
    queryKey: ["adminDeliveryMethods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_methods" as any)
        .select("*")
        .order("display_order");
      if (error) throw error;
      return (data || []) as unknown as DeliveryMethod[];
    },
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;

  const pickup = methods.find((m) => m.type === "pickup");
  const deliveryMethods = methods.filter((m) => m.type === "delivery");

  const swapOrder = async (idx: number, dir: -1 | 1) => {
    const target = deliveryMethods[idx + dir];
    const me = deliveryMethods[idx];
    if (!target || !me) return;
    await supabase.from("delivery_methods" as any).update({ display_order: target.display_order }).eq("id", me.id);
    await supabase.from("delivery_methods" as any).update({ display_order: me.display_order }).eq("id", target.id);
    queryClient.invalidateQueries({ queryKey: ["adminDeliveryMethods"] });
  };

  const setDefault = async (m: DeliveryMethod) => {
    const { error } = await supabase
      .from("delivery_methods" as any)
      .update({ is_default: true })
      .eq("id", m.id);
    if (error) { toast.error("Erro ao definir padrão"); return; }
    toast.success(`"${m.name}" definido como padrão`);
    queryClient.invalidateQueries({ queryKey: ["adminDeliveryMethods"] });
  };

  const handleAddDelivery = async () => {
    const nextOrder = (methods.reduce((max, m) => Math.max(max, m.display_order || 0), 0) || 0) + 1;
    const { error } = await supabase
      .from("delivery_methods" as any)
      .insert({
        type: "delivery",
        name: "Novo método de entrega",
        description: "",
        is_active: false,
        display_order: nextOrder,
        config: { shipping_mode: "flat_rate", flat_rate: 0, flat_min_days: 1, flat_max_days: 3 },
      });
    if (error) { toast.error("Erro ao criar método"); return; }
    toast.success("Método criado! Configure e ative.");
    queryClient.invalidateQueries({ queryKey: ["adminDeliveryMethods"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Configure os métodos de entrega disponíveis no checkout. Clique em cada método para expandir.
          </p>
        </div>
        <Button onClick={handleAddDelivery} size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> Novo método
        </Button>
      </div>

      {pickup && <PickupCard method={pickup} queryClient={queryClient} />}
      {deliveryMethods.map((m, i) => (
        <DeliveryCard
          key={m.id}
          method={m}
          queryClient={queryClient}
          canMoveUp={i > 0}
          canMoveDown={i < deliveryMethods.length - 1}
          onMoveUp={() => swapOrder(i, -1)}
          onMoveDown={() => swapOrder(i, 1)}
          onSetDefault={() => setDefault(m)}
        />
      ))}
      {deliveryMethods.length === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-xl">
          Ainda não existem métodos de entrega. Clique em <strong>Novo método</strong> para adicionar.
        </div>
      )}
    </div>
  );
};

// ── Retirada na Loja ──────────────────────────────────────
const PickupCard = ({ method, queryClient }: { method: DeliveryMethod; queryClient: any }) => {
  const [cfg, setCfg] = useState(method.config);
  const [isActive, setIsActive] = useState(method.is_active);
  const [desc, setDesc] = useState(method.description || "");
  const [open, setOpen] = useState(false);

  useEffect(() => { setCfg(method.config); setIsActive(method.is_active); setDesc(method.description || ""); }, [method]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("delivery_methods" as any)
        .update({ is_active: isActive, description: desc, config: cfg, updated_at: new Date().toISOString() })
        .eq("id", method.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["adminDeliveryMethods"] }); toast.success("Retirada na Loja atualizada!"); },
    onError: () => toast.error("Erro ao guardar"),
  });

  return (
    <Card className="border-border/50">
      <Collapsible open={open} onOpenChange={setOpen}>
      <CardHeader className="cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-3 flex-1 text-left">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Store className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Retirada na Loja
                <Badge className={`text-[10px] ${isActive ? "bg-emerald-600 text-white border-emerald-700" : "bg-slate-700 text-slate-100 border-slate-600"}`}>
                  {isActive ? "Ativo" : "Inativo"}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">O cliente retira pessoalmente na loja</CardDescription>
            </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ml-auto ${open ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <Switch checked={isActive} onCheckedChange={setIsActive} onClick={(e) => e.stopPropagation()} />
        </div>
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição para o cliente</Label>
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Ex: Retire o seu pedido em nossa loja de segunda a sábado"
            rows={2}
          />
        </div>

        <Separator />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> Endereço da Loja
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Endereço (Rua, número)</Label>
            <Input placeholder="Rua das Flores, 123" value={cfg.address || ""} onChange={(e) => setCfg({ ...cfg, address: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Freguesia</Label>
            <Input placeholder="Ex: Santo António" value={cfg.parish || cfg.neighborhood || ""} onChange={(e) => setCfg({ ...cfg, parish: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Localidade *</Label>
            <Input placeholder="Lisboa" value={cfg.city || ""} onChange={(e) => setCfg({ ...cfg, city: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Distrito</Label>
            <Input placeholder="Lisboa" value={cfg.district || cfg.state || ""} onChange={(e) => setCfg({ ...cfg, district: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Código Postal</Label>
            <Input placeholder="1000-100" value={cfg.postal_code || cfg.zip_code || ""} onChange={(e) => setCfg({ ...cfg, postal_code: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Complemento</Label>
            <Input placeholder="Sala 5, Loja A" value={cfg.complement || ""} onChange={(e) => setCfg({ ...cfg, complement: e.target.value })} />
          </div>
        </div>

        <Separator />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" /> Horários e Prazos
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Horário de Funcionamento</Label>
            <Input placeholder="Seg-Sex 9h-18h, Sáb 9h-13h" value={cfg.opening_hours || ""} onChange={(e) => setCfg({ ...cfg, opening_hours: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prazo para retirada (dias úteis)</Label>
            <Input
              type="number"
              min="0"
              placeholder="3"
              value={cfg.pickup_deadline_days ?? 3}
              onChange={(e) => setCfg({ ...cfg, pickup_deadline_days: Number(e.target.value) })}
            />
            <p className="text-[10px] text-muted-foreground">Dias úteis após confirmação do pedido</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <Info className="h-4 w-4 text-amber-600 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Verificação de cidade</p>
            <p className="text-[10px] text-muted-foreground">
              No checkout, o sistema verificará automaticamente se o comprador é da mesma cidade da loja para oferecer esta opção.
            </p>
          </div>
          <Switch
            checked={cfg.city_only ?? true}
            onCheckedChange={(v) => setCfg({ ...cfg, city_only: v })}
          />
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          Guardar Configurações de Retirada
        </Button>
      </CardContent>
      </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

// ── Entrega em Domicílio ──────────────────────────────────
const DeliveryCard = ({
  method, queryClient,
  canMoveUp, canMoveDown, onMoveUp, onMoveDown, onSetDefault,
}: {
  method: DeliveryMethod;
  queryClient: any;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSetDefault: () => void;
}) => {
  const [cfg, setCfg] = useState(method.config);
  const [isActive, setIsActive] = useState(method.is_active);
  const [desc, setDesc] = useState(method.description || "");
  const [name, setName] = useState(method.name || "");
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setCfg(method.config); setIsActive(method.is_active);
    setDesc(method.description || ""); setName(method.name || "");
  }, [method]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("delivery_methods" as any)
        .update({ name: name.trim() || "Entrega", is_active: isActive, description: desc, config: cfg, updated_at: new Date().toISOString() })
        .eq("id", method.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["adminDeliveryMethods"] }); toast.success("Método atualizado!"); },
    onError: () => toast.error("Erro ao guardar"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("delivery_methods" as any).delete().eq("id", method.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["adminDeliveryMethods"] }); toast.success("Método removido"); },
    onError: () => toast.error("Erro ao remover"),
  });

  return (
    <Card className="border-border/50">
      <Collapsible open={open} onOpenChange={setOpen}>
      <CardHeader className="cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-3 flex-1 text-left">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {method.name || "Entrega"}
                <Badge className={`text-[10px] ${isActive ? "bg-emerald-600 text-white border-emerald-700" : "bg-slate-700 text-slate-100 border-slate-600"}`}>
                  {isActive ? "Ativo" : "Inativo"}
                </Badge>
                {method.is_default && (
                  <Badge className="text-[10px] bg-amber-500 text-black border-amber-600 gap-1">
                    <Star className="h-3 w-3 fill-current" /> Padrão
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">Taxa fixa ou cálculo automático por região</CardDescription>
            </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ml-auto ${open ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <Button variant="ghost" size="icon" className="h-5 w-7" disabled={!canMoveUp} onClick={(e) => { e.stopPropagation(); onMoveUp(); }} title="Mover para cima">
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-7" disabled={!canMoveDown} onClick={(e) => { e.stopPropagation(); onMoveDown(); }} title="Mover para baixo">
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>
            {!method.is_default && (
              <Button
                variant="ghost" size="icon"
                className="h-9 w-9 text-amber-500 hover:text-amber-500"
                title="Definir como método padrão"
                onClick={(e) => { e.stopPropagation(); onSetDefault(); }}
              >
                <Star className="h-4 w-4" />
              </Button>
            )}
            <Switch checked={isActive} onCheckedChange={setIsActive} onClick={(e) => e.stopPropagation()} />
            <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" aria-label="Remover" onClick={(e) => { e.stopPropagation(); setConfirmRemove(true); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <ConfirmStrip
          open={confirmRemove}
          className="mt-3"
          title="Remover método de entrega?"
          description={`Esta ação não pode ser desfeita. O método "${method.name}" sai do checkout.`}
          confirmLabel="Remover"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => { setConfirmRemove(false); remove.mutate(); }}
        />
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome do método *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: CTT Expresso, Entrega Local, DPD..." />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição para o cliente</Label>
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Ex: Receba em casa com portes calculado pela sua região"
            rows={2}
          />
        </div>

        <Separator />
        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modo de Cálculo do Portes</Label>
          <RadioGroup
            value={cfg.shipping_mode || "calculated"}
            onValueChange={(v) => setCfg({ ...cfg, shipping_mode: v })}
            className="grid sm:grid-cols-2 gap-3"
          >
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${(cfg.shipping_mode || "calculated") === "calculated" ? "border-primary bg-primary/5" : "border-border/50"}`}>
              <RadioGroupItem value="calculated" className="mt-0.5" />
              <div>
                <p className="text-sm font-medium">Cálculo automático</p>
                <p className="text-[11px] text-muted-foreground">Usa as tabelas configuradas na aba <strong>Portes</strong> (peso + região).</p>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${cfg.shipping_mode === "flat_rate" ? "border-primary bg-primary/5" : "border-border/50"}`}>
              <RadioGroupItem value="flat_rate" className="mt-0.5" />
              <div>
                <p className="text-sm font-medium">Taxa fixa</p>
                <p className="text-[11px] text-muted-foreground">Cobra um valor único independente do peso ou região.</p>
              </div>
            </label>
          </RadioGroup>
        </div>

        {cfg.shipping_mode === "flat_rate" && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor da taxa fixa (€) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="5.00"
                value={cfg.flat_rate ?? ""}
                onChange={(e) => setCfg({ ...cfg, flat_rate: Number(e.target.value) })}
              />
              <p className="text-[10px] text-muted-foreground">Valor único cobrado por todos os envios.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prazo estimado (dias úteis)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" min="1" placeholder="Min" value={cfg.flat_min_days ?? 1} onChange={(e) => setCfg({ ...cfg, flat_min_days: Number(e.target.value) })} />
                <Input type="number" min="1" placeholder="Max" value={cfg.flat_max_days ?? 3} onChange={(e) => setCfg({ ...cfg, flat_max_days: Number(e.target.value) })} />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Taxa adicional de manuseio</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={cfg.extra_cost ?? 0}
            onChange={(e) => setCfg({ ...cfg, extra_cost: Number(e.target.value) })}
          />
          <p className="text-[10px] text-muted-foreground">Valor adicionado ao portes (cálculo ou taxa fixa) para cobrir embalagem/manuseio</p>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          Guardar Configurações de Entrega
        </Button>
      </CardContent>
      </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default AdminDeliveryMethods;
