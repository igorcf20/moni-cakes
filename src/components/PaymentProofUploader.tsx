import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMessages } from "@/i18n";
import { paymentsMessages } from "@/i18n/payments";

interface Props {
  orderId: string;
  guestEmail?: string | null;
  alreadySubmitted?: boolean;
  onUploaded?: () => void;
}

const PaymentProofUploader = ({ orderId, guestEmail, alreadySubmitted, onUploaded }: Props) => {
  const { t } = useMessages(paymentsMessages);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(!!alreadySubmitted);

  const handleSubmit = async () => {
    if (!file) { toast.error(t("proofSelectFile")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("proofTooLarge")); return; }
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) {
      toast.error(t("proofSessionExpired"));
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${uid}/${orderId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke("submit-payment-proof", {
        body: { orderId, path, note, guestEmail },
      });
      if (error || !(data as any)?.ok) throw error || new Error("submit-payment-proof failed");
      toast.success(t("proofSent"));
      setDone(true);
      onUploaded?.();
    } catch (e: any) {
      console.error(e);
      toast.error(t("proofError"));
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">{t("proofReceived")}</p>
          <p className="text-xs text-emerald-700">{t("proofReceivedText")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">{t("proofTitle")}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("proofLead")}
      </p>
      <div className="space-y-1.5">
        <Label className="text-xs">{t("proofFile")}</Label>
        <Input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={uploading}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t("proofNote")}</Label>
        <Textarea
          rows={2}
          placeholder={t("proofNotePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={uploading}
        />
      </div>
      <Button onClick={handleSubmit} disabled={uploading || !file} className="w-full">
        {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("proofSending")}</> : <><Upload className="h-4 w-4 mr-2" />{t("proofSend")}</>}
      </Button>
    </div>
  );
};

export default PaymentProofUploader;