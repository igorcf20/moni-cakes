import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cookie, Download, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { openConsentPreferences } from "@/lib/consent";
import { cn } from "@/lib/utils";
import { btnDanger, btnSecondary, cardCls, focusRing, h3Cls, iconTile, inputCls, labelCls } from "./ui";

// Palavra que a função delete-my-account espera (o cliente escreve a palavra do seu idioma).
const SERVER_CONFIRM = "EXCLUIR";

/** Direitos sobre os dados pessoais: exportar (portabilidade) e excluir a conta. */
const DangerZone = () => {
  const { t } = useMessages(accountMessages);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const word = t("privWord");
  const confirmed = confirmText.trim().toUpperCase() === word.toUpperCase();

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      // Pelo cliente do backend (mesma origem do site no VPS, com apikey e o token da sessão), nunca por um domínio fixo.
      const { data, error } = await supabase.functions.invoke("export-my-data", { method: "POST" });
      if (error) throw error;
      const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      const dl = URL.createObjectURL(blob);
      a.href = dl;
      a.download = `meus-dados-${user.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dl);
      toast.success(t("privExported"));
    } catch (e) {
      console.error("export-my-data failed", e);
      toast.error(t("privExportError"));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmed) {
      toast.error(t("privTypeToConfirm", { word }));
      return;
    }
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-my-account", { body: { confirm: SERVER_CONFIRM } });
      if (error) throw error;
      const preserved = Number((data as any)?.orders_preserved ?? 0);
      toast.success(preserved > 1 ? t("privDeletedOrders_other", { count: preserved }) : preserved === 1 ? t("privDeletedOrders_one") : t("privDeleted"));
      await signOut();
      navigate("/", { replace: true });
    } catch (e) {
      console.error("delete-my-account failed", e);
      toast.error(t("privDeleteError"));
      setDeleting(false);
    }
  };

  return (
    <section className={cn(cardCls, "space-y-5 p-5 sm:p-6")} aria-labelledby="privacy-title">
      <div className="flex items-start gap-3">
        <span className={iconTile}><ShieldCheck className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 id="privacy-title" className={h3Cls}>{t("privTitle")}</h3>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {t("privText")}{" "}
            <Link to="/politica-privacidade" className={cn("rounded font-semibold text-brand-orange-text underline-offset-2 hover:underline", focusRing)}>{t("privPolicy")}</Link>
          </p>
        </div>
      </div>

      {/* Portabilidade */}
      <div className="flex flex-col justify-between gap-3 rounded-[16px] border border-brand-card-border bg-background p-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-semibold"><Download className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{t("privExportTitle")}</p>
          <p className="mt-0.5 text-[14px] text-muted-foreground">{t("privExportText")}</p>
        </div>
        <button type="button" className={cn(btnSecondary, "min-h-11 shrink-0 px-4 text-[14px]")} onClick={handleExport} disabled={exporting} aria-busy={exporting || undefined}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
          {t("privExport")}
        </button>
      </div>

      {/* Consentimento de cookies (abre as preferências do aviso, src/components/CookieConsent.tsx) */}
      <div className="flex flex-col justify-between gap-3 rounded-[16px] border border-brand-card-border bg-background p-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-semibold"><Cookie className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{t("privCookiesTitle")}</p>
          <p className="mt-0.5 text-[14px] text-muted-foreground">{t("privCookiesText")}</p>
        </div>
        <button type="button" className={cn(btnSecondary, "min-h-11 shrink-0 px-4 text-[14px]")} onClick={openConsentPreferences}>
          <Cookie className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          {t("privCookies")}
        </button>
      </div>

      {/* Exclusão */}
      <div className="flex flex-col justify-between gap-3 rounded-[16px] border border-destructive/25 bg-destructive/[0.03] p-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-destructive"><Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("privDeleteTitle")}</p>
          <p className="mt-0.5 text-[14px] text-muted-foreground">{t("privDeleteText")}</p>
        </div>
        <AlertDialog onOpenChange={(o) => !o && setConfirmText("")}>
          <AlertDialogTrigger asChild>
            <button type="button" className={cn(btnDanger, "min-h-11 shrink-0 px-4 text-[14px]")}>
              <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("privDelete")}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-h-[92dvh] overflow-y-auto rounded-[20px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[22px] font-bold tracking-[-0.02em]">{t("privDialogTitle")}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-[15px] text-brand-ink-soft">
                  <p>{t("privDialogIntro")}</p>
                  <ul className="list-disc space-y-1 pl-5 text-[14px]">
                    <li>{t("privDialogItem1")}</li>
                    <li>{t("privDialogItem2")}</li>
                    <li>{t("privDialogItem3")}</li>
                    <li>{t("privDialogItem4")}</li>
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-delete" className={labelCls}>{t("privTypeToConfirm", { word })}</Label>
              <Input id="confirm-delete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={word} autoComplete="off" className={cn(inputCls, "font-mono uppercase")} />
            </div>
            <AlertDialogFooter className="gap-2 sm:gap-2">
              <AlertDialogCancel className={cn(btnSecondary, "mt-0")} disabled={deleting}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleDelete(); }}
                disabled={deleting || !confirmed}
                className={btnDanger}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
                {t("privConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
};

export default DangerZone;
