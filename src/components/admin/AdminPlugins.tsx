
import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MessageCircle, Truck, Search, ShieldCheck, Layout, CreditCard, Shield, Sparkles, Save, CalendarOff } from "lucide-react";
import { InlinePanel } from "@/components/admin/shell/AdminPageParts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import PhoneInputWithDDI from "@/components/PhoneInputWithDDI";
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import HelpTip from "./HelpTip";
import { useMessages } from "@/i18n";
import { adminLegacyMessages, type AdminLegacyT } from "@/i18n/adminLegacy";

/** Rótulo de campo com a dica ao lado. */
const FieldLabel = ({ t, label, help, htmlFor }: { t: AdminLegacyT; label: string; help: string; htmlFor?: string }) => (
  <div className="flex items-center gap-1">
    <Label htmlFor={htmlFor}>{label}</Label>
    <HelpTip label={t("help")} text={help} />
  </div>
);

const pluginName = (t: AdminLegacyT, id: string) => t(`plugins_${id}_name` as Parameters<AdminLegacyT>[0]);
const pluginDescription = (t: AdminLegacyT, id: string) => t(`plugins_${id}_desc` as Parameters<AdminLegacyT>[0]);

const AdminPlugins = () => {
  const queryClient = useQueryClient();
  const { t } = useMessages(adminLegacyMessages);
  const { data: visualSettings } = useVisualSettings();
  const [selectedPlugin, setSelectedPlugin] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [plugins, setPlugins] = useState([

    { 
      id: "whatsapp", 
      icon: MessageCircle, 
      enabled: true,
      recommended: true,
      config: {
        phone: "PT:",
        message: "Olá! Gostaria de tirar uma dúvida sobre um produto.",
        position: "right"
      }
    },
    { 
      id: "free_shipping_bar", 
      icon: Truck, 
      enabled: true,
      recommended: false,
      config: {
        threshold: 50,
        successMessage: "Parabéns! Ganhou Portes Grátis!",
        barColor: "primary"
      }
    },
    { 
      id: "smart_search", 
      icon: Search, 
      enabled: true,
      recommended: false,
      config: {
        minChars: 3,
        limit: 5
      }
    },
    { 
      id: "trust_badges", 
      icon: ShieldCheck, 
      enabled: true,
      recommended: true,
      config: {
        title: "Compra segura",
        description: "A sua encomenda está protegida em todas as etapas.",
        placement: "both",
        badges: {
          ssl: true,
          payments: true,
          guarantee: true,
          shipping: true,
        },
      }
    },
    {
      id: "production_pause",
      icon: CalendarOff,
      enabled: false,
      recommended: false,
      config: {
        start_date: "",
        end_date: "",
        reason: "Férias",
        title: "Estamos em pausa de produção",
        message: "Nesta janela não produzimos novos pedidos. Pode encomendar normalmente: a produção arranca no dia de regresso.",
        checkbox_text: "Compreendo que o meu pedido só entra em produção a partir de {data_regresso} e concordo em aguardar.",
        return_date: "",
      }
    },
  ]);

  useEffect(() => {
    if (visualSettings?.plugins) {
      setPlugins(prev => prev.map(p => {
        const savedConfig = (visualSettings.plugins as any)[p.id];
        if (savedConfig) {
          return {
            ...p,
            enabled: savedConfig.enabled,
            config: savedConfig
          };
        }
        return p;
      }));
    }
  }, [visualSettings]);

  const savePlugins = useMutation({
    mutationFn: async (updatedPlugins: any[]) => {
      const pluginsConfig: any = {};
      updatedPlugins.forEach(p => {
        pluginsConfig[p.id] = {
          ...p.config,
          enabled: p.enabled,
        };
      });

      const newSettings = {
        ...visualSettings,
        plugins: pluginsConfig
      };

      const { error } = await supabase
        .from("store_settings")
        .upsert(
          { key: "visual_settings", value: newSettings as unknown as Json, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visualSettings"] });
      toast.success(t("plugins_saved"));
    },
    onError: (e: any) => {
      console.error("savePlugins error", e);
      toast.error(t("plugins_save_error", { message: e?.message || t("plugins_try_again") }));
    }
  });

  const togglePlugin = (id: string) => {
    const updatedPlugins = plugins.map(p => {
      if (p.id === id) {
        return { ...p, enabled: !p.enabled };
      }
      return p;
    });
    setPlugins(updatedPlugins);
    savePlugins.mutate(updatedPlugins);
  };

  const updatePluginConfig = (field: string, value: any) => {
    setSelectedPlugin((prev: any) => ({
      ...prev,
      config: {
        ...prev.config,
        [field]: value
      }
    }));
  };

  const filteredPlugins = plugins.filter(p => 
    pluginName(t, p.id).toLowerCase().includes(searchQuery.toLowerCase()) ||
    pluginDescription(t, p.id).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <p className="text-muted-foreground text-sm">{t("plugins_intro")}</p>
          <HelpTip label={t("help")} text={t("plugins_h_intro")} />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder={t("plugins_search")}
              aria-label={t("plugins_search_aria")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" className="gap-2 hidden sm:flex">
            <Layout className="h-4 w-4" />
            {t("plugins_store")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPlugins.map((plugin) => (
          <div key={plugin.id} className={`group relative border rounded-2xl p-6 hover:shadow-xl transition-all duration-300 hover:border-primary/50 overflow-hidden ${plugin.enabled ? "bg-card" : "bg-muted/40"}`}>
            {plugin.recommended && (
              <div className="absolute -right-12 -top-12 h-24 w-24 bg-primary/10 rotate-45 flex items-end justify-center pb-2">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
            )}
            
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-xl ${plugin.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <plugin.icon className="h-6 w-6" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Switch 
                  checked={plugin.enabled} 
                  onCheckedChange={() => togglePlugin(plugin.id)} 
                  aria-label={t("plugins_toggle_aria", { name: pluginName(t, plugin.id) })}
                />
                {plugin.recommended && (
                  <Badge variant="outline" className="text-[9px] h-4 bg-primary/5 text-primary border-primary/20">
                    {t("plugins_recommended")}
                  </Badge>
                )}
              </div>
            </div>
            <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">{pluginName(t, plugin.id)}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 min-h-[40px]">{pluginDescription(t, plugin.id)}</p>
            
            <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${plugin.enabled ? 'text-green-500' : 'text-muted-foreground'}`}>
                {plugin.enabled ? t("active") : t("inactive")}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs underline group-hover:text-primary"
                onClick={() => setSelectedPlugin(plugin)}
              >
                {t("plugins_configure")}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <InlinePanel
        open={!!selectedPlugin}
        onClose={() => setSelectedPlugin(null)}
        title={<span className="flex items-center gap-2">{selectedPlugin && <selectedPlugin.icon className="h-5 w-5 text-primary" aria-hidden="true" />}{selectedPlugin ? t("plugins_configure_title", { name: pluginName(t, selectedPlugin.id) }) : null}</span>}
        description={t("plugins_panel_intro")}
      >
          <div className="space-y-6 py-4">
            {selectedPlugin?.id === "whatsapp" && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <FieldLabel t={t} htmlFor="phone" label={t("plugins_wa_phone")} help={t("plugins_wa_phone_help")} />
                  <PhoneInputWithDDI
                    value={selectedPlugin.config.phone || "PT:"}
                    onChange={(v) => updatePluginConfig("phone", v)}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("plugins_wa_phone_help")}</p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} htmlFor="message" label={t("plugins_wa_message")} help={t("plugins_wa_message_help")} />
                  <Textarea 
                    id="message" 
                    value={selectedPlugin.config.message || ""}
                    onChange={(e) => updatePluginConfig("message", e.target.value)}
                    placeholder={t("plugins_wa_message_placeholder")}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("plugins_wa_message_help")}</p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} label={t("plugins_wa_position")} help={t("plugins_wa_position_help")} />
                  <Select
                    value={selectedPlugin.config.position || "right"}
                    onValueChange={(v) => updatePluginConfig("position", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("plugins_wa_position_placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="right">{t("plugins_wa_right")}</SelectItem>
                      <SelectItem value="left">{t("plugins_wa_left")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}


            {selectedPlugin?.id === "free_shipping_bar" && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <FieldLabel t={t} htmlFor="threshold" label={t("plugins_fs_threshold")} help={t("plugins_fs_threshold_help")} />
                  <Input
                    id="threshold"
                    type="number"
                    step="0.01"
                    value={selectedPlugin.config.threshold}
                    onChange={(e) => updatePluginConfig("threshold", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("plugins_fs_threshold_help")}</p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} htmlFor="successMessage" label={t("plugins_fs_success")} help={t("plugins_fs_success_help")} />
                  <Input
                    id="successMessage"
                    value={selectedPlugin.config.successMessage}
                    onChange={(e) => updatePluginConfig("successMessage", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} label={t("plugins_fs_color")} help={t("plugins_fs_color_help")} />
                  <Select
                    value={selectedPlugin.config.barColor || "primary"}
                    onValueChange={(v) => updatePluginConfig("barColor", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">{t("plugins_fs_primary")}</SelectItem>
                      <SelectItem value="green">{t("plugins_fs_green")}</SelectItem>
                      <SelectItem value="blue">{t("plugins_fs_blue")}</SelectItem>
                      <SelectItem value="dark">{t("plugins_fs_dark")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {selectedPlugin?.id === "smart_search" && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <FieldLabel t={t} htmlFor="minChars" label={t("plugins_ss_min")} help={t("plugins_ss_min_help")} />
                  <Input
                    id="minChars"
                    type="number"
                    value={selectedPlugin.config.minChars ?? 3}
                    onChange={(e) => updatePluginConfig("minChars", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("plugins_ss_min_help")}</p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} htmlFor="limit" label={t("plugins_ss_limit")} help={t("plugins_ss_limit_help")} />
                  <Input
                    id="limit"
                    type="number"
                    value={selectedPlugin.config.limit ?? 5}
                    onChange={(e) => updatePluginConfig("limit", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("plugins_ss_limit_help")}</p>
                </div>
              </div>
            )}

            {selectedPlugin?.id === "trust_badges" && (
              <div className="space-y-6">
                <div className="grid gap-2">
                  <FieldLabel t={t} label={t("plugins_tb_title")} help={t("plugins_tb_title_help")} />
                  <Input
                    value={selectedPlugin.config.title || ""}
                    onChange={(e) => updatePluginConfig("title", e.target.value)}
                    placeholder={t("plugins_tb_title_placeholder")}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} label={t("plugins_tb_description")} help={t("plugins_tb_description_help")} />
                  <Textarea
                    value={selectedPlugin.config.description || ""}
                    onChange={(e) => updatePluginConfig("description", e.target.value)}
                    rows={2}
                    placeholder={t("plugins_tb_description_placeholder")}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} label={t("plugins_tb_placement")} help={t("plugins_tb_placement_help")} />
                  <Select
                    value={selectedPlugin.config.placement || "both"}
                    onValueChange={(v) => updatePluginConfig("placement", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="footer">{t("plugins_tb_footer")}</SelectItem>
                      <SelectItem value="checkout">{t("plugins_tb_checkout")}</SelectItem>
                      <SelectItem value="both">{t("plugins_tb_both")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <FieldLabel t={t} label={t("plugins_tb_badges")} help={t("plugins_tb_badges_help")} />
                  {[
                    { key: "ssl", label: t("plugins_tb_ssl") },
                    { key: "payments", label: t("plugins_tb_payments") },
                    { key: "guarantee", label: t("plugins_tb_guarantee") },
                    { key: "shipping", label: t("plugins_tb_shipping") },
                  ].map((b) => {
                    const badges = selectedPlugin.config.badges || {};
                    const checked = badges[b.key] ?? true;
                    return (
                      <div key={b.key} className="flex items-center justify-between rounded-lg border bg-card/60 p-3">
                        <span className="text-sm">{b.label}</span>
                        <Checkbox
                          checked={checked}
                          aria-label={b.label}
                          onCheckedChange={(v) =>
                            updatePluginConfig("badges", { ...badges, [b.key]: !!v })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedPlugin?.id === "production_pause" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border bg-amber-500/10 border-amber-500/40 p-3">
                  <div>
                    <div className="flex items-center gap-1">
                      <Label className="text-sm">{t("plugins_pp_active")}</Label>
                      <HelpTip label={t("help")} text={t("plugins_pp_active_help")} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t("plugins_pp_active_help")}</p>
                  </div>
                  <Switch
                    checked={!!selectedPlugin.enabled}
                    aria-label={t("plugins_pp_active")}
                    onCheckedChange={(v) => setSelectedPlugin((prev: any) => ({ ...prev, enabled: !!v }))}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <FieldLabel t={t} label={t("plugins_pp_start")} help={t("plugins_pp_start_help")} />
                    <Input
                      type="date"
                      value={selectedPlugin.config.start_date || ""}
                      onChange={(e) => updatePluginConfig("start_date", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel t={t} label={t("plugins_pp_end")} help={t("plugins_pp_end_help")} />
                    <Input
                      type="date"
                      value={selectedPlugin.config.end_date || ""}
                      onChange={(e) => updatePluginConfig("end_date", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} label={t("plugins_pp_return")} help={t("plugins_pp_return_help")} />
                  <Input
                    type="date"
                    value={selectedPlugin.config.return_date || ""}
                    onChange={(e) => updatePluginConfig("return_date", e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("plugins_pp_return_help")}</p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} label={t("plugins_pp_reason")} help={t("plugins_pp_reason_help")} />
                  <Input
                    value={selectedPlugin.config.reason || ""}
                    onChange={(e) => updatePluginConfig("reason", e.target.value)}
                    placeholder={t("plugins_pp_reason_placeholder")}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} label={t("plugins_pp_title")} help={t("plugins_pp_title_help")} />
                  <Input
                    value={selectedPlugin.config.title || ""}
                    onChange={(e) => updatePluginConfig("title", e.target.value)}
                    placeholder={t("plugins_pp_title_placeholder")}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} label={t("plugins_pp_message")} help={t("plugins_pp_message_help")} />
                  <Textarea
                    rows={4}
                    value={selectedPlugin.config.message || ""}
                    onChange={(e) => updatePluginConfig("message", e.target.value)}
                    placeholder={t("plugins_pp_message_placeholder")}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("plugins_pp_markers")} {"{data_inicio}"}, {"{data_fim}"}, {"{data_regresso}"}, {"{motivo}"}.</p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel t={t} label={t("plugins_pp_checkbox")} help={t("plugins_pp_checkbox_help")} />
                  <Textarea
                    rows={3}
                    value={selectedPlugin.config.checkbox_text || ""}
                    onChange={(e) => updatePluginConfig("checkbox_text", e.target.value)}
                    placeholder={t("plugins_pp_checkbox_placeholder")}
                  />
                </div>
                <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
                  {t("plugins_pp_note_a")}<strong>{t("plugins_pp_note_b")}</strong>{t("plugins_pp_note_c")}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setSelectedPlugin(null)}>{t("cancel")}</Button>
            <Button 
              onClick={() => {
                const updatedPlugins = plugins.map(p => p.id === selectedPlugin.id ? selectedPlugin : p);
                setPlugins(updatedPlugins);
                savePlugins.mutate(updatedPlugins);
                setSelectedPlugin(null);
              }}
              disabled={savePlugins.isPending}
            >
              {savePlugins.isPending ? t("plugins_saving") : t("plugins_save")}
            </Button>
          </div>
      </InlinePanel>
    </div>
  );
};

export default AdminPlugins;
