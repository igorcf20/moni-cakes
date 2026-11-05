import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Mail, Loader2 } from "lucide-react";

interface TemplateRow {
  key: string;
  display_name: string;
  subject: string;
  intro: string | null;
  enabled: boolean;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
}

const AdminEmailTemplates = () => {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number }>({ used: 0, limit: 1000 });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("email_templates" as any).select("*").order("key");
    if (error) toast.error(error.message);
    else setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("store_settings" as any)
        .select("value")
        .eq("key", "admin_notification_email")
        .maybeSingle();
      const v = (data as any)?.value;
      if (typeof v === "string") setAdminEmail(v);
      else if (v && typeof v === "object" && typeof v.email === "string") setAdminEmail(v.email);

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { data: rows } = await supabase
        .from("email_send_log" as any)
        .select("message_id, status")
        .gte("created_at", monthStart.toISOString())
        .in("status", ["pending", "sent"]);
      const ids = new Set(((rows as any[]) || []).map((r) => r.message_id).filter(Boolean));
      setUsage({ used: ids.size, limit: 1000 });
    })();
  }, []);

  const saveAdminEmail = async () => {
    setSavingAdmin(true);
    const trimmed = adminEmail.trim();
    const { error } = await supabase
      .from("store_settings" as any)
      .upsert({ key: "admin_notification_email", value: trimmed }, { onConflict: "key" });
    if (error) toast.error(error.message);
    else toast.success("Email de notificações guardado");
    setSavingAdmin(false);
  };

  const update = (key: string, patch: Partial<TemplateRow>) => {
    setRows((rs) => rs.map((r) => r.key === key ? { ...r, ...patch } : r));
  };

  const save = async (row: TemplateRow) => {
    setSavingKey(row.key);
    const { error } = await supabase.from("email_templates" as any).update({
      subject: row.subject, intro: row.intro, enabled: row.enabled,
      from_name: row.from_name, from_email: row.from_email, reply_to: row.reply_to,
    }).eq("key", row.key);
    if (error) toast.error(error.message); else toast.success("Modelo guardado");
    setSavingKey(null);
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">A carregar…</div>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground">Personaliza o assunto, introdução e remetente de cada email automático. O design e os botões são gerados pelo sistema.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Email de notificações do admin</CardTitle>
            <CardDescription>Recebe novos pedidos e cancelamentos.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="contato@sualoja.com"
            />
            <Button onClick={saveAdminEmail} disabled={savingAdmin}>
              {savingAdmin ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Envios deste mês</CardTitle>
            <CardDescription>Limite mensal incluído no teu plano.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{usage.used}<span className="text-base text-muted-foreground"> / {usage.limit}</span></div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} />
            </div>
            {usage.used >= usage.limit && (
              <p className="mt-2 text-xs text-destructive">Limite atingido. Novos emails serão suspensos até ao próximo mês.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800">
        Variáveis disponíveis: <code>&#123;order_id&#125;</code>, <code>&#123;customer_name&#125;</code>, <code>&#123;order_total&#125;</code>, <code>&#123;tracking_code&#125;</code>.
        Para começar a enviar, ativa o Resend em <strong>APIs & Integrações → Emails</strong>.
      </div>

      <div className="grid gap-4">
        {rows.map((row) => (
          <Card key={row.key} className="border-border/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Mail className="h-5 w-5 text-primary" /></div>
                  <div>
                    <CardTitle className="text-base">{row.display_name}</CardTitle>
                    <CardDescription>Chave: <code className="text-xs">{row.key}</code></CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Ativo</Label>
                  <Switch checked={row.enabled} onCheckedChange={(v) => update(row.key, { enabled: v })} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Assunto</Label>
                <Input value={row.subject} onChange={(e) => update(row.key, { subject: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Introdução</Label>
                <Textarea rows={3} value={row.intro ?? ""} onChange={(e) => update(row.key, { intro: e.target.value })} />
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nome Remetente</Label>
                  <Input placeholder="Nome da loja" value={row.from_name ?? ""} onChange={(e) => update(row.key, { from_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email Remetente</Label>
                  <Input placeholder="noreply@sualoja.com" value={row.from_email ?? ""} onChange={(e) => update(row.key, { from_email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reply-To</Label>
                  <Input placeholder="suporte@sualoja.com" value={row.reply_to ?? ""} onChange={(e) => update(row.key, { reply_to: e.target.value })} />
                </div>
              </div>
              <Button onClick={() => save(row)} disabled={savingKey === row.key} className="w-full sm:w-auto">
                {savingKey === row.key ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminEmailTemplates;