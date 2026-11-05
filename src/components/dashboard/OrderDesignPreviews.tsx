import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileImage, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";

type Design = {
  id: string;
  plano_index: number;
  plano_name: string | null;
  preview_path: string | null;
  copies: number | null;
  width_px: number | null;
  height_px: number | null;
  dpi: number | null;
};

// Bucket onde ficam as pré-visualizações dos arquivos do pedido (nome técnico herdado, não aparece ao cliente).
const PREVIEW_BUCKET = "dtf-uploads";

const Preview = ({ d }: { d: Design }) => {
  const { t } = useMessages(accountMessages);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    if (!d.preview_path) return;
    supabase.storage
      .from(PREVIEW_BUCKET)
      .createSignedUrl(d.preview_path, 60 * 60)
      .then(({ data }) => {
        if (!cancel) setSrc(data?.signedUrl || null);
      });
    return () => {
      cancel = true;
    };
  }, [d.preview_path]);

  const copies = Math.max(1, d.copies || 1);
  const title = d.plano_name || t("designsFile", { n: d.plano_index + 1 });

  return (
    <figure className="overflow-hidden rounded-[14px] border border-brand-card-border bg-white">
      <div className="flex aspect-square items-center justify-center bg-brand-alt">
        {src ? (
          <img src={src} alt={title} loading="lazy" className="h-full w-full object-contain" />
        ) : (
          <FileImage className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.7} aria-hidden="true" />
        )}
      </div>
      <figcaption className="space-y-0.5 p-2.5 text-[12px]">
        <p className="truncate font-semibold text-foreground">{title}</p>
        <p className="text-muted-foreground">
          {copies === 1 ? t("designsCopies_one") : t("designsCopies_other", { count: copies })}
          {d.dpi ? ` · ${d.dpi} dpi` : ""}
        </p>
      </figcaption>
    </figure>
  );
};

/** Pré-visualizações (baixa resolução) dos arquivos enviados com o pedido. */
export const OrderDesignPreviews = ({ orderId }: { orderId: string }) => {
  const { t } = useMessages(accountMessages);
  const { data: designs = [], isLoading } = useQuery<Design[]>({
    queryKey: ["order-designs-public", orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_designs")
        .select("id, plano_index, plano_name, preview_path, copies, width_px, height_px, dpi")
        .eq("order_id", orderId)
        .order("plano_index", { ascending: true });
      if (error) throw error;
      return (data || []) as Design[];
    },
  });

  if (isLoading || !designs.length) return null;

  return (
    <section className="space-y-2">
      <h4 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("designsTitle")}</h4>
      <p className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        {t("designsHint")}
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {designs.map((d) => (
          <Preview key={d.id} d={d} />
        ))}
      </div>
    </section>
  );
};

export default OrderDesignPreviews;
