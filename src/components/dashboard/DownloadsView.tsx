// Minha conta > Downloads (aba ?tab=downloads, só com o recurso digital_products ligado): cada produto digital pago,
// com estado, prazo, arquivos (Baixar regista o download no servidor e abre o arquivo), downloads restantes, chaves de
// licença (com Copiar) e instruções da loja. Regras em src/lib/digitalProducts.ts; textos em src/i18n/digitalProducts.ts.
import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, ExternalLink, FileDown, KeyRound, Loader2 } from "lucide-react";
import { useMyDownloads, useStartDownload, type MyDownload } from "@/hooks/useDigitalProducts";
import { useMessages } from "@/i18n";
import { digitalMessages } from "@/i18n/digitalProducts";
import { canDownload, daysLeft, downloadsLeft, formatBytes, grantState, type DigitalError, type GrantFile } from "@/lib/digitalProducts";
import { localized } from "@/lib/paymentMethods";
import { cn } from "@/lib/utils";
import { btnSmall, cardCls, EmptyState, ItemThumb } from "./ui";

const STATE_CLS = {
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  expired: "bg-amber-50 text-amber-800 ring-amber-200",
  revoked: "bg-slate-100 text-slate-700 ring-slate-200",
} as const;
const code = (id: string) => id.slice(0, 8).toUpperCase();

export default function DownloadsView() {
  const { t } = useMessages(digitalMessages);
  const { data: rows = [], isLoading, error } = useMyDownloads();

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-[15px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>;
  if (error) return <p className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-4 text-[15px] text-destructive">{t("load_error")}</p>;
  if (!rows.length) return <EmptyState Icon={FileDown} title={t("title")} text={t("empty")} />;

  return (
    <ul className="space-y-4">
      {rows.map((g) => <li key={g.id}><DownloadCard g={g} /></li>)}
    </ul>
  );
}

function DownloadCard({ g }: { g: MyDownload }) {
  const { t, locale } = useMessages(digitalMessages);
  const start = useStartDownload();
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const state = grantState(g);
  const left = daysLeft(g.expires_at);
  const dateFmt = (v: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(v));
  const instructions = localized(g.instructions_i18n, locale, g.instructions_i18n?.["pt-BR"] ?? Object.values(g.instructions_i18n ?? {})[0] ?? "");

  const run = async (f: GrantFile) => {
    // A janela abre já (os navegadores do celular bloqueiam janelas abertas depois de uma espera).
    const win = f.link ? window.open("", "_blank") : null;
    if (win) win.opener = null;
    setBusyFile(f.id);
    try {
      const url = await start.mutateAsync({ grantId: g.id, fileId: f.id });
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      win?.close();
      const c = (e as Error).message as DigitalError;
      toast.error(t(`err_${c}` as "err_unknown"));
    } finally {
      setBusyFile(null);
    }
  };

  const expiryText = !g.expires_at ? t("no_expiry")
    : state === "active" ? [left === 0 ? t("expires_today") : t("expires", { date: dateFmt(g.expires_at) }), left && left <= 7 ? (left === 1 ? t("days_left_one") : t("days_left", { n: left })) : null].filter(Boolean).join(" · ")
      : t("expires", { date: dateFmt(g.expires_at) });

  return (
    <article className={cn(cardCls, "space-y-4 p-5 sm:p-6")}>
      <div className="flex items-start gap-4">
        <ItemThumb src={g.product?.image} alt={g.product?.name ?? ""} Icon={FileDown} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold leading-tight tracking-[-0.02em]">{g.product?.name ?? t("product_gone")}</h3>
            <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset", STATE_CLS[state])}>{t(`st_${state}`)}</span>
          </div>
          <p className="mt-1 text-[15px] text-brand-ink-soft">
            {[t("order", { code: code(g.order_id) }), t("bought", { date: dateFmt(g.created_at) }), g.quantity > 1 ? t("qty", { n: g.quantity }) : null].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-0.5 text-[14px] text-muted-foreground">{expiryText}</p>
        </div>
      </div>

      {state !== "active" && (
        <p className="rounded-[14px] bg-brand-alt p-3 text-[14px] text-brand-ink-soft">{state === "expired" ? t("expired_d") : t("revoked_d")}</p>
      )}

      {g.files.length > 0 && (
        <ul className="divide-y divide-border rounded-[16px] border border-border">
          {g.files.map((f) => {
            const rest = downloadsLeft(g.download_limit, f.used);
            const ok = canDownload(g, f);
            return (
              <li key={f.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{f.name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {[f.link ? t("link_file") : formatBytes(f.size_bytes, locale), g.download_limit == null ? t("unlimited") : rest === 0 ? t("left_none") : t("left", { n: rest ?? 0, total: g.download_limit })].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button type="button" className={cn(btnSmall, "shrink-0")} disabled={!ok || busyFile !== null} onClick={() => void run(f)}>
                  {busyFile === f.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : f.link ? <ExternalLink className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                      : <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
                  {f.link ? t("open_link") : t("download")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {g.license_keys && state === "active" && <LicenseKeys keys={g.keys} quantity={g.quantity} />}

      {instructions && state === "active" && (
        <div className="space-y-1">
          <p className="text-[14px] font-semibold">{t("instructions")}</p>
          <p className="whitespace-pre-line text-[15px] text-brand-ink-soft">{instructions}</p>
        </div>
      )}
    </article>
  );
}

function LicenseKeys({ keys, quantity }: { keys: string[]; quantity: number }) {
  const { t } = useMessages(digitalMessages);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (k: string) => {
    try {
      await navigator.clipboard.writeText(k);
      setCopied(k);
      toast.success(t("copied"));
      window.setTimeout(() => setCopied((c) => (c === k ? null : c)), 2000);
    } catch {
      /* sem permissão de área de transferência: a chave continua visível para copiar à mão */
    }
  };
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-[14px] font-semibold"><KeyRound className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{quantity > 1 ? t("keys") : t("keys_one")}</p>
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-2 rounded-[14px] border border-border bg-brand-alt/60 p-2 pl-3">
          <code className="min-w-0 flex-1 break-all font-mono text-[14px]">{k}</code>
          <button type="button" className={cn(btnSmall, "min-h-10 px-3")} onClick={() => void copy(k)} aria-label={`${t("copy")} ${k}`}>
            {copied === k ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}{t("copy")}
          </button>
        </div>
      ))}
      {keys.length < quantity && <p className="text-[14px] text-muted-foreground">{t("key_pending")}</p>}
    </div>
  );
}
