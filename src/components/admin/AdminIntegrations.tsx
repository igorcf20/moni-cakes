import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CreditCard, Truck, Mail, Receipt, Shield, Save, Loader2, Eye, EyeOff, PlugZap, CheckCircle2, XCircle, ExternalLink, Copy } from "lucide-react";
import { siteUrl } from "@/lib/siteUrl";

export type Provider = "viva" | "ctt" | "resend" | "fiz" | "melhor_envio" | "sendcloud" | "mercado_pago" | "stripe" | "paypal";

interface ProviderState {
  environment: "demo" | "production";
  is_active: boolean;
  public_config: Record<string, any>;
  masked: Record<string, string>;
  updated_at: string | null;
}

const FIELDS: Record<Provider, { key: string; label: string; placeholder?: string; type?: string; helper?: string }[]> = {
  viva: [
    { key: "client_id", label: "Smart Checkout Client ID", helper: "Obrigatório para criar e confirmar pagamentos." },
    { key: "client_secret", label: "Smart Checkout Client Secret", type: "password" },
    { key: "source_code", label: "Source Code", placeholder: "4 dígitos do source/canal" },
    { key: "webhook_key", label: "Webhook Verification Key", helper: "Cola o valor 'Key' que a Viva mostra ao registar o webhook." },
    { key: "merchant_id", label: "Merchant ID", helper: "Necessário para reembolsos pelo site (Settings → API Access)." },
    { key: "api_key", label: "API Key", type: "password", helper: "Necessária para reembolsos pelo site." },
  ],
  ctt: [
    { key: "client_id", label: "CTT Client ID" },
    { key: "client_secret", label: "CTT Client Secret", type: "password" },
    { key: "contract_id", label: "Contract ID (opcional)" },
    { key: "host", label: "API Host (opcional)", placeholder: "https://api.ctt.pt" },
  ],
  resend: [
    { key: "api_key", label: "Resend API Key", type: "password" },
    { key: "from_email", label: "Email Remetente", placeholder: "noreply@sualoja.com" },
    { key: "from_name", label: "Nome Remetente", placeholder: "Nome da loja" },
    { key: "reply_to", label: "Reply-To (opcional)" },
  ],
  fiz: [
    { key: "api_key", label: "FIZ API Key", type: "password", helper: "Em app.fiz.co, Definições, API." },
    { key: "cae", label: "CAE da empresa", placeholder: "Ex.: 47784", helper: "Código de atividade usado nas faturas." },
    { key: "series_id", label: "Série (opcional)", helper: "Vazio usa a série predefinida na FIZ." },
    { key: "auto_mode", label: "Fatura automática", placeholder: "vazio, rascunho ou emitir", helper: "Ao confirmar o pagamento: vazio não faz nada; rascunho cria só o rascunho; emitir emite a fatura (fiscal, irreversível)." },
  ],
  melhor_envio: [
    { key: "token", label: "Token de acesso", type: "password", helper: "No Melhor Envio: Integrações, Permissões de acesso, Gerar novo token (com a permissão shipping-calculate)." },
  ],
  sendcloud: [
    { key: "public_key", label: "Public key", helper: "No Sendcloud: Settings, Integrations, Sendcloud API." },
    { key: "secret_key", label: "Secret key", type: "password" },
  ],
  mercado_pago: [
    { key: "access_token", label: "Access Token", type: "password", helper: "No Mercado Pago Developers: Suas integrações, a sua aplicação, Credenciais de produção (ou de teste, começadas por TEST-)." },
  ],
  stripe: [
    { key: "secret_key", label: "Secret key", type: "password", helper: "No Stripe: Developers, API keys. sk_test_ para testar, sk_live_ para vender. Pode usar uma Restricted key com escrita em Checkout Sessions." },
  ],
  paypal: [
    { key: "client_id", label: "Client ID", helper: "No PayPal Developer: Apps & Credentials, a sua app (Sandbox para testar, Live para vender)." },
    { key: "client_secret", label: "Secret", type: "password" },
  ],
};

// Dados não secretos da conta (gravados em public_config, visíveis no painel).
const PUBLIC_FIELDS: Partial<Record<Provider, { key: string; label: string; placeholder?: string; helper?: string }[]>> = {
  melhor_envio: [
    { key: "from_postal_code", label: "CEP de origem", placeholder: "01310-100", helper: "De onde saem as encomendas." },
    { key: "contact_email", label: "E-mail técnico", placeholder: "contato@sualoja.com", helper: "O Melhor Envio pede um contato em cada pedido de cotação." },
  ],
  sendcloud: [
    { key: "from_country", label: "País de origem", placeholder: "PT", helper: "Código do país de onde saem as encomendas." },
    { key: "from_postal_code", label: "Código postal de origem", placeholder: "1000-001" },
  ],
  mercado_pago: [
    { key: "max_installments", label: "Parcelas no cartão (máximo)", placeholder: "12", helper: "De 1 a 24. Os juros seguem a configuração da sua conta Mercado Pago." },
    { key: "statement_descriptor", label: "Nome na fatura do cartão", placeholder: "MINHALOJA", helper: "Até 13 letras ou números." },
    { key: "currency", label: "Moeda da conta", placeholder: "BRL", helper: "BRL para contas do Brasil. Com a loja noutra moeda, o valor é convertido pelas taxas de Configurações." },
  ],
};

const META: Record<Provider, { title: string; icon: any; description: string; allowEnv: boolean }> = {
  viva:   { title: "Viva Wallet", icon: CreditCard, description: "Pagamentos online (cartão, MB WAY e Multibanco) com confirmação automática via webhook.", allowEnv: true },
  ctt:    { title: "CTT Expresso", icon: Truck, description: "Rastreio automático das encomendas a partir do código enviado pelo admin.", allowEnv: true },
  resend: { title: "Resend (Emails)", icon: Mail, description: "Envio de emails transacionais. O domínio precisa de estar verificado no Resend.", allowEnv: false },
  melhor_envio: { title: "Melhor Envio", icon: Truck, description: "Cotação automática de frete no Brasil (Correios, Jadlog, Loggi, Azul Cargo e outras) para as formas de envio em modo automático.", allowEnv: true },
  sendcloud: { title: "Sendcloud", icon: Truck, description: "Cotação automática de frete na Europa (CTT, DPD, GLS, SEUR, MRW, Correos, DHL, UPS e outras) para as formas de envio em modo automático.", allowEnv: false },
  mercado_pago: { title: "Mercado Pago", icon: CreditCard, description: "Pix, cartão e boleto no Brasil. O pedido fica pago sozinho depois de confirmado na sua conta.", allowEnv: false },
  stripe: { title: "Stripe", icon: CreditCard, description: "Cartão, Apple Pay, Google Pay e meios locais (MB WAY, Multibanco, SEPA...). O pedido fica pago sozinho depois de confirmado na sua conta.", allowEnv: false },
  paypal: { title: "PayPal", icon: CreditCard, description: "Conta PayPal ou cartão, no mundo todo. O pedido fica pago sozinho depois de confirmado na sua conta.", allowEnv: true },
  fiz:    { title: "FIZ (Faturação)", icon: Receipt, description: "Faturas certificadas das encomendas. Rascunhos não são comunicados à AT; a emissão é fiscal e irreversível.", allowEnv: false },
};

// Endereço público da loja (VITE_SITE_URL) para colar nos painéis dos provedores.
// O backend fica no mesmo domínio do site (gateway /functions/v1 no VPS), salvo VITE_SUPABASE_URL explícito.
const apiBase = () => ((import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || siteUrl()).replace(/\/+$/, "");

const CopyRow = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="space-y-1">
    <p className="font-medium text-foreground">{label}</p>
    <div className="flex items-center gap-2">
      <code className="flex-1 break-all rounded bg-background border px-2 py-1 text-[11px] text-foreground">{value}</code>
      <Button type="button" size="sm" variant="outline" className="h-7 shrink-0" onClick={() => { navigator.clipboard?.writeText(value).then(() => toast.success("Copiado"), () => toast.error("Não foi possível copiar")); }}>
        <Copy className="h-3 w-3" />
      </Button>
    </div>
    {hint && <p className="text-muted-foreground">{hint}</p>}
  </div>
);

// Everything the Viva back office asks for, ready to paste (Sales → Online payments → Websites/apps).
const VivaSetupGuide = () => {
  const site = siteUrl();
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-xs">
      <p className="font-semibold text-foreground">Configuração na Viva (fonte de pagamento) — copie e cole</p>
      <div className="grid gap-3 md:grid-cols-2">
        <CopyRow label="Domínio / Website" value={site} hint="Campo do site da fonte de pagamento." />
        <CopyRow label="Success URL" value={`${site}/pagamento/viva/retorno`} hint="A Viva redireciona aqui com ?t (transação) e ?s (ordem). O site confirma o pagamento antes de o aceitar." />
        <CopyRow label="Failure URL" value={`${site}/pagamento/viva/retorno`} hint="Pode ser o mesmo endereço: a página confirma o estado e permite tentar pagar de novo." />
        <CopyRow label="Webhook — Transaction Payment Created (1796)" value={`${apiBase()}/functions/v1/viva-webhook`} hint="Settings → API Access → Webhooks. Registe o mesmo URL também para 1797 (reembolso), 1798 (falha) e 4865." />
        <CopyRow label="Logótipo (transparente, 128×128, até 100 KB)" value={`${site}/viva-logo-128.png`} hint="A Viva só aceita ficheiro, não URL: abra este endereço, guarde a imagem e carregue-a em «Company Logo» da fonte." />
        <CopyRow label="Cor da marca" value="#0057B8" hint="Já é enviada automaticamente no endereço de pagamento (parâmetro color)." />
      </div>
      <ul className="space-y-1.5 text-muted-foreground">
        <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" /> Demo e Produção são contas separadas: <strong className="text-foreground">Client ID, Client Secret, Source Code e Webhook Key mudam</strong> ao passar a Produção.</li>
        <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" /> O webhook deve aceitar apenas os IPs da Viva. Para o exigir, defina o segredo <code className="text-foreground">VIVA_WEBHOOK_STRICT_IP=true</code> nas Edge Functions (os IPs vêm em developer.viva.com/webhooks-for-payments).</li>
        <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" /> Mostrar os métodos de pagamento (ícones) no rodapé, ficha de produto e checkout — recomendação da Viva para conversão.</li>
        <li className="flex gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" /> Antes de abrir ao público: pagamento real de valor baixo com cartão e cancelamento posterior na conta Viva.</li>
      </ul>
      <a href="https://developer.viva.com/smart-checkout/smart-checkout-integration/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 underline">
        Documentação Smart Checkout <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
};

export const ProviderCard = ({ provider, onSaved }: { provider: Provider; onSaved?: () => void }) => {
  const meta = META[provider];
  const Icon = meta.icon;
  const [state, setState] = useState<ProviderState | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let payload: ProviderState | null = null;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${apiBase()}/functions/v1/admin-credentials?provider=${provider}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      payload = await r.json();
    } catch (e) {
      console.error(e);
    }
    if (payload) setState(payload);
    setLoading(false);
  };

  useEffect(() => { load(); }, [provider]);

  const setField = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${apiBase()}/functions/v1/admin-credentials`;
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          environment: state?.environment,
          is_active: state?.is_active,
          credentials: draft,
          public_config: state?.public_config || {},
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao guardar");
      toast.success("Configurações guardadas");
      setDraft({});
      await load();
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (active: boolean) => {
    setState((s) => s ? { ...s, is_active: active } : s);
  };

  return (
    <Card className="border-border/60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {meta.title}
                <Badge className={state?.is_active ? "bg-emerald-600 text-white border-emerald-700" : "bg-zinc-500 text-white border-zinc-600"}>
                  {state?.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </CardTitle>
              <CardDescription>{meta.description}</CardDescription>
            </div>
          </div>
          <Switch checked={!!state?.is_active} onCheckedChange={toggleActive} disabled={loading} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {meta.allowEnv && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ambiente</Label>
              <Select value={state?.environment || "demo"} onValueChange={(v) => setState((s) => s ? { ...s, environment: v as any } : s)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="demo">Demo / Sandbox</SelectItem>
                  <SelectItem value="production">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <Separator />

        <div className="grid sm:grid-cols-2 gap-4">
          {FIELDS[provider].map((f) => {
            const masked = state?.masked?.[f.key];
            const visible = show[f.key];
            return (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</Label>
                <div className="relative">
                  <Input
                    type={f.type === "password" && !visible ? "password" : "text"}
                    placeholder={masked || f.placeholder || "—"}
                    value={draft[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                  {f.type === "password" && (
                    <button type="button" onClick={() => setShow((s) => ({ ...s, [f.key]: !s[f.key] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                {f.helper && <p className="text-[11px] text-muted-foreground">{f.helper}</p>}
                {masked && !draft[f.key] && <p className="text-[11px] text-muted-foreground">Atual: <span className="font-mono">{masked}</span></p>}
              </div>
            );
          })}
        </div>

        {PUBLIC_FIELDS[provider] && (
          <div className="grid sm:grid-cols-2 gap-4">
            {PUBLIC_FIELDS[provider]!.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</Label>
                <Input
                  placeholder={f.placeholder}
                  value={String(state?.public_config?.[f.key] ?? "")}
                  onChange={(e) => setState((s) => s ? { ...s, public_config: { ...(s.public_config || {}), [f.key]: e.target.value } } : s)}
                />
                {f.helper && <p className="text-[11px] text-muted-foreground">{f.helper}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-dashed text-xs text-muted-foreground">
          <Shield className="h-4 w-4 text-emerald-600 shrink-0" />
          As chaves são guardadas cifradas no backend e nunca expostas ao browser. O painel só mostra os últimos 4 caracteres.
        </div>

        {provider === "viva" && (
          <>
            <VivaSetupGuide />

            <TestButton fn="viva-test-connection" label="Testar ligação à Viva Wallet (usa as credenciais já guardadas)" />
          </>
        )}
        {provider === "fiz" && (
          <TestButton fn="fiz-invoice" body={{ action: "company" }} label="Testar ligação à FIZ (usa a chave já guardada)"
            format={(d) => `${d.name ?? "Empresa"} (NIF ${d.taxpayerNumber ?? "?"}). CAE: ${(d.cae ?? []).join(", ") || "nenhum"}. ${d.readiness?.ready ? "Pronta para emitir." : `Ainda não pode emitir: ${(d.readiness?.reasons ?? []).join("; ") || "ver painel da FIZ"}.`}`} />
        )}

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar {meta.title}
        </Button>
      </CardContent>
    </Card>
  );
};

const TestButton = ({ fn, body = {}, label, format }: { fn: string; body?: Record<string, unknown>; label: string; format?: (data: any) => string }) => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      if (data?.ok) {
        setResult({ ok: true, message: format ? format(data) : data.message || "Ligação OK" });
      } else {
        setResult({ ok: false, message: data?.error || "Falha na ligação" });
      }
    } catch (e: any) {
      setResult({ ok: false, message: e.message || "Falha na ligação" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={runTest} disabled={testing} className="w-full">
        {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlugZap className="h-4 w-4 mr-2" />}
        {label}
      </Button>
      {result && (
        <div className={`p-3 rounded-lg border text-xs flex gap-2 ${result.ok ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-800" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>
          {result.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
};

const AdminIntegrations = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">APIs & Integrações</h2>
        <p className="text-muted-foreground">Chaves de pagamento, frete, email e faturação. Todas guardadas em local seguro.</p>
      </div>
      <Tabs defaultValue="viva" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="viva" className="gap-2"><CreditCard className="h-4 w-4" /> Pagamentos (Viva Wallet)</TabsTrigger>
          <TabsTrigger value="mercado_pago" className="gap-2"><CreditCard className="h-4 w-4" /> Mercado Pago</TabsTrigger>
          <TabsTrigger value="stripe" className="gap-2"><CreditCard className="h-4 w-4" /> Stripe</TabsTrigger>
          <TabsTrigger value="paypal" className="gap-2"><CreditCard className="h-4 w-4" /> PayPal</TabsTrigger>
          <TabsTrigger value="ctt" className="gap-2"><Truck className="h-4 w-4" /> Transportadora (CTT)</TabsTrigger>
          <TabsTrigger value="melhor_envio" className="gap-2"><Truck className="h-4 w-4" /> Frete Brasil (Melhor Envio)</TabsTrigger>
          <TabsTrigger value="sendcloud" className="gap-2"><Truck className="h-4 w-4" /> Frete Europa (Sendcloud)</TabsTrigger>
          <TabsTrigger value="resend" className="gap-2"><Mail className="h-4 w-4" /> Emails (Resend)</TabsTrigger>
          <TabsTrigger value="fiz" className="gap-2"><Receipt className="h-4 w-4" /> Faturação (FIZ)</TabsTrigger>
        </TabsList>
        <TabsContent value="viva"><ProviderCard provider="viva" /></TabsContent>
        <TabsContent value="mercado_pago"><ProviderCard provider="mercado_pago" /></TabsContent>
        <TabsContent value="stripe"><ProviderCard provider="stripe" /></TabsContent>
        <TabsContent value="paypal"><ProviderCard provider="paypal" /></TabsContent>
        <TabsContent value="ctt"><ProviderCard provider="ctt" /></TabsContent>
        <TabsContent value="melhor_envio"><ProviderCard provider="melhor_envio" /></TabsContent>
        <TabsContent value="sendcloud"><ProviderCard provider="sendcloud" /></TabsContent>
        <TabsContent value="resend"><ProviderCard provider="resend" /></TabsContent>
        <TabsContent value="fiz"><ProviderCard provider="fiz" /></TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminIntegrations;
