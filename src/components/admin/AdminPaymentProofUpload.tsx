import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  orderId: string;
};

const AdminPaymentProofUpload = ({ orderId }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleUpload = async () => {
    if (!file) {
      toast.error("Selecione um ficheiro");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${orderId}/admin-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase
        .from("orders")
        .update({
          payment_proof_url: path,
          payment_proof_uploaded_at: new Date().toISOString(),
          payment_proof_note: note ? `[Admin] ${note}` : "[Inserido pelo administrador]",
          payment_status: "paid",
        } as any)
        .eq("id", orderId);
      if (updErr) throw updErr;
      toast.success("Comprovativo anexado com sucesso");
      setFile(null);
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro ao anexar comprovativo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3 mt-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <FileText className="h-4 w-4" /> Anexar comprovativo manualmente
      </div>
      <p className="text-xs text-muted-foreground">
        Use esta opção quando confirmar o pagamento (MBWay, transferência ou referência) e o
        cliente não tiver enviado o comprovativo pelo painel.
      </p>
      <div>
        <Label className="text-xs">Ficheiro (PDF, JPG, PNG)</Label>
        <Input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs">Nota (opcional)</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex.: Transferência recebida em 12/03"
          className="mt-1"
        />
      </div>
      <Button size="sm" onClick={handleUpload} disabled={!file || uploading} className="w-full">
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> A enviar…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" /> Anexar e marcar como pago
          </>
        )}
      </Button>
    </div>
  );
};

export default AdminPaymentProofUpload;