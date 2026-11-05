import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Receipt, ExternalLink, Download, Loader2 } from "lucide-react";
import { formatDateTime } from "@/utils/currency";
import { toast } from "sonner";

type Props = {
  path?: string | null;
  uploadedAt?: string | null;
  note?: string | null;
};

const AdminPaymentProof = ({ path, uploadedAt, note }: Props) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setSignedUrl(null);
      return;
    }
    setLoading(true);
    supabase.storage
      .from("payment-proofs")
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Signed URL error", error);
          toast.error("Não foi possível abrir o comprovativo");
        } else {
          setSignedUrl(data?.signedUrl || null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
        Cliente ainda não enviou comprovativo de pagamento.
      </div>
    );
  }

  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(path);
  const isPdf = /\.pdf$/i.test(path);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Receipt className="h-4 w-4" /> Comprovativo de Pagamento
          <Badge variant="outline" className="text-[10px]">Recebido</Badge>
        </div>
        {uploadedAt && (
          <span className="text-xs text-muted-foreground">
            Enviado em {formatDateTime(uploadedAt)}
          </span>
        )}
      </div>

      {note && (
        <p className="text-xs italic text-muted-foreground bg-background border border-border/50 rounded p-2">
          Nota do cliente: {note}
        </p>
      )}

      <div className="rounded-md border bg-background overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> A carregar comprovativo…
          </div>
        ) : signedUrl ? (
          isImage ? (
            <a href={signedUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={signedUrl}
                alt="Comprovativo"
                className="w-full max-h-[480px] object-contain bg-muted"
              />
            </a>
          ) : isPdf ? (
            <iframe
              src={signedUrl}
              title="Comprovativo PDF"
              className="w-full h-[480px]"
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Ficheiro disponível para download.
            </div>
          )
        ) : (
          <div className="p-4 text-sm text-destructive">
            Não foi possível carregar o ficheiro.
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          disabled={!signedUrl}
          onClick={() => signedUrl && window.open(signedUrl, "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Abrir em nova aba
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!signedUrl}
          onClick={() => {
            if (!signedUrl) return;
            const a = document.createElement("a");
            a.href = signedUrl;
            a.download = path.split("/").pop() || "comprovativo";
            a.click();
          }}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Descarregar
        </Button>
      </div>
    </div>
  );
};

export default AdminPaymentProof;