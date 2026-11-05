import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConfirmStrip } from "@/components/admin/shell/AdminPageParts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Trash2, FileImage, FileText, Clock, AlertCircle, FileDown, Info } from "lucide-react";
import { toast } from "sonner";

type OriginalRef = { name: string; path: string; type?: string; size?: number };

type Design = {
  id: string;
  cart_item_key: string | null;
  order_id?: string;
  plano_index: number;
  plano_name: string | null;
  file_path: string;
  preview_path: string | null;
  width_px: number | null;
  height_px: number | null;
  dpi: number | null;
  size_bytes: number | null;
  copies: number | null;
  pdf_path: string | null;
  originals: OriginalRef[] | null;
  delete_after: string | null;
  deleted_at: string | null;
  upload_complete?: boolean | null;
};

const fmtBytes = (b?: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
};

const daysUntil = (iso?: string | null) => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

type ItemRef = {
  id: string;
  design_data?: any;
  products?: { name?: string | null } | null;
};

const OrderDesignsList = ({ orderId, items = [] }: { orderId: string; items?: ItemRef[] }) => {
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState<Design | null>(null);
  const { data: designs = [], isLoading } = useQuery<Design[]>({
    queryKey: ["order-designs", orderId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_designs")
        .select("*")
        .eq("order_id", orderId)
        .order("plano_index", { ascending: true });
      if (error) throw error;
      // Dedupe by (cart_item_key, plano_index). Different items in the same
      // order start at plano_index=0, so deduping globally would hide them.
      const byKey = new Map<string, any>();
      for (const d of data || []) {
        if (d.deleted_at) continue;
        const k = `${d.cart_item_key || "__legacy__"}::${d.plano_index}`;
        const existing = byKey.get(k);
        if (!existing) byKey.set(k, d);
        else {
          const tNew = new Date(d.created_at || 0).getTime();
          const tOld = new Date(existing.created_at || 0).getTime();
          if (tNew >= tOld) byKey.set(k, d);
        }
      }
      return Array.from(byKey.values())
        .sort((a, b) => {
          const ka = a.cart_item_key || "";
          const kb = b.cart_item_key || "";
          if (ka !== kb) return ka.localeCompare(kb);
          return a.plano_index - b.plano_index;
        })
        .map((d: any) => ({
          ...d,
          originals: Array.isArray(d.originals) ? d.originals : [],
        }));
    },
  });

  const downloadOriginal = async (o: OriginalRef) => {
    const { data, error } = await supabase.storage
      .from("dtf-uploads")
      .createSignedUrl(o.path, 60 * 5, { download: o.name });
    if (error || !data?.signedUrl) return toast.error("Erro ao gerar link");
    window.open(data.signedUrl, "_blank");
  };

  const previewSrc = async (d: Design) => {
    if (!d.preview_path) return null;
    const { data } = await supabase.storage.from("dtf-uploads").createSignedUrl(d.preview_path, 60 * 60);
    return data?.signedUrl || null;
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("delete-order-design", {
        body: { design_id: id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-designs", orderId] });
      toast.success("Ficheiro eliminado");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao eliminar"),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">A carregar ficheiros...</p>;
  if (designs.length === 0)
    return <p className="text-xs text-muted-foreground italic">Sem ficheiros de impressão gerados.</p>;

  // Map cart_item_key → product name from order_items.
  const nameByKey = new Map<string, string>();
  for (const it of items) {
    const k = it?.design_data?.cartItemKey;
    if (k) nameByKey.set(k, it.products?.name || "Item");
  }

  // Group designs by cart_item_key.
  const groups = new Map<string, Design[]>();
  for (const d of designs) {
    const k = d.cart_item_key || "__legacy__";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }

  // Aggregate originals across all designs, deduped by path (fallback name).
  const seenOrig = new Set<string>();
  const allOriginals: OriginalRef[] = [];
  for (const d of designs) {
    for (const o of d.originals || []) {
      const k = o.path || o.name;
      if (k && !seenOrig.has(k)) {
        seenOrig.add(k);
        allOriginals.push(o);
      }
    }
  }

  // Build a meaningful filename from the order. Resolved lazily on download.
  const buildClientSlug = async () => {
    try {
      const { data } = await (supabase as any)
        .from("orders")
        .select("id, user_id, guest_name, shipping_address")
        .eq("id", orderId)
        .maybeSingle();
      let profileName = "";
      if (data?.user_id) {
        const { data: profile } = await (supabase as any)
          .from("user_profiles")
          .select("full_name")
          .eq("user_id", data.user_id)
          .maybeSingle();
        profileName = (profile?.full_name as string) || "";
      }
      const name: string =
        (data?.guest_name as string) ||
        profileName ||
        (data?.shipping_address?.recipient_name as string) ||
        (data?.shipping_address?.name as string) ||
        "cliente";
      return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "cliente";
    } catch {
      return "cliente";
    }
  };

  const slugPlano = (s: string | null | undefined) =>
    (s || "plano")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "plano";

  const downloadPlanoPdf = async (d: Design, itemSlug?: string) => {
    if (!d.pdf_path) return;
    const cliente = await buildClientSlug();
    const short = orderId.slice(0, 8).toUpperCase();
    const idxStr = String((d.plano_index || 0) + 1).padStart(2, "0");
    const itemPart = itemSlug ? `_item-${itemSlug}` : "";
    const filename = `${cliente}_pedido-${short}${itemPart}_plano-${idxStr}-${slugPlano(d.plano_name)}.pdf`;
    const { data, error } = await supabase.storage
      .from("dtf-uploads")
      .createSignedUrl(d.pdf_path, 60 * 5, { download: filename });
    if (error || !data?.signedUrl) return toast.error("Erro ao gerar link");
    window.open(data.signedUrl, "_blank");
  };

  const groupEntries = Array.from(groups.entries());
  const anyPdf = designs.some((d) => !!d.pdf_path);
  const anyIncomplete = designs.some((d) => d.upload_complete === false);

  return (
    <div className="space-y-5">
      {anyIncomplete && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
          <p className="flex items-start gap-1.5 font-semibold">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Pedido incompleto — não processar ainda
          </p>
          <p className="opacity-90">
            O cliente fechou a página de confirmação antes do envio dos ficheiros terminar.
            Aguarda que ele reabra a confirmação para concluir o envio, ou elimina os registos órfãos abaixo antes de avançar com a produção.
          </p>
        </div>
      )}
      {!anyPdf && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3 mt-0.5 shrink-0" />
          PDF de impressão ainda não disponível (a ser gerado pelo cliente). As pré-visualizações abaixo servem só para identificação.
        </p>
      )}

      {groupEntries.map(([key, gDesigns], gi) => {
        const productName = nameByKey.get(key) || (key === "__legacy__" ? "Item (legado)" : "Item");
        const itemSlug = slugPlano(productName);
        const withPdf = gDesigns.filter((d) => !!d.pdf_path);
        return (
          <div key={key} className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Item {gi + 1} — {productName}
              </p>
              <span className="text-[10px] text-muted-foreground">
                {gDesigns.length} plano{gDesigns.length === 1 ? "" : "s"}
              </span>
            </div>

            {withPdf.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {withPdf.map((d) => {
                  const incomplete = d.upload_complete === false;
                  return (
                    <Button
                      key={d.id}
                      size="sm"
                      variant={incomplete ? "outline" : "default"}
                      className="gap-1.5"
                      disabled={incomplete}
                      onClick={() => downloadPlanoPdf(d, itemSlug)}
                      title={incomplete ? "Upload incompleto — ficheiro indisponível" : `PDF de impressão (produção) — Plano ${d.plano_index + 1} · ${d.plano_name || ""}`}
                    >
                      <FileDown className="h-3.5 w-3.5" /> PDF impressão · plano {d.plano_index + 1}
                      {d.plano_name ? <span className="opacity-70">· {d.plano_name}</span> : null}
                    </Button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {gDesigns.map((d, ri) => (
                <DesignCard
                  key={d.id}
                  d={d}
                  rolo={ri + 1}
                  totalRolos={gDesigns.length}
                  onDelete={() => {
                    setConfirmDel(d);
                  }}
                  getPreview={() => previewSrc(d)}
                  fmtBytes={fmtBytes}
                />
              ))}
            </div>
          </div>
        );
      })}

      {anyPdf && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          Cada plano tem o seu PDF independente. Usa-os para imprimir — preservam a resolução real das artes.
        </p>
      )}

      {allOriginals.length > 0 && (
        <div className="rounded-lg border bg-background p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Originais do cliente ({allOriginals.length})
          </p>
          <ul className="space-y-1">
            {allOriginals.map((o, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate" title={o.name}>{o.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{fmtBytes(o.size)}</span>
                <Button
                  size="sm" variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => downloadOriginal(o)}
                  title="Baixar ficheiro original"
                >
                  <Download className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmStrip
        open={!!confirmDel}
        title={confirmDel?.upload_complete === false ? "Eliminar registo órfão?" : "Eliminar ficheiro de impressão?"}
        description={confirmDel?.upload_complete === false
          ? "Este registo está incompleto (upload não confirmado). Ao eliminar, remove o registo do pedido."
          : "Esta ação remove o PDF, a pré-visualização e os originais do cliente do armazenamento. Não é reversível."}
        confirmLabel="Eliminar"
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => { if (confirmDel) del.mutate(confirmDel.id); setConfirmDel(null); }}
      />
    </div>
  );
};

const DesignCard = ({
  d,
  rolo,
  totalRolos,
  onDelete,
  getPreview,
  fmtBytes,
}: {
  d: Design;
  rolo: number;
  totalRolos: number;
  onDelete: () => void;
  getPreview: () => Promise<string | null>;
  fmtBytes: (b?: number | null) => string;
}) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    getPreview().then((u) => !cancel && setSrc(u));
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);

  const expDays = daysUntil(d.delete_after);
  const isDeleted = !!d.deleted_at;
  const copies = Math.max(1, d.copies || 1);
  const incomplete = d.upload_complete === false;

  return (
    <div className="rounded-lg border bg-background overflow-hidden flex flex-col">
      <div className="aspect-video bg-muted/50 flex items-center justify-center overflow-hidden">
        {incomplete ? (
          <div className="flex flex-col items-center justify-center gap-1 p-3 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-[10px] text-destructive font-medium">Upload incompleto</p>
          </div>
        ) : src ? (
          <img src={src} alt={d.plano_name || "plano"} className="w-full h-full object-contain" />
        ) : (
          <FileImage className="h-8 w-8 text-muted-foreground/40" />
        )}
      </div>
      <div className="p-3 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold truncate">
            Rolo {rolo}/{totalRolos} · Página {d.plano_index + 1}
            {d.plano_name ? <span className="text-muted-foreground"> · {d.plano_name}</span> : null}
          </p>
          <Badge
            variant="outline"
            className={
              copies > 1
                ? "text-[11px] font-bold shrink-0 border-primary bg-primary text-primary-foreground animate-pulse"
                : "text-[10px] shrink-0 border-primary/40 bg-primary/10 text-primary"
            }
          >
            {copies > 1 ? `× ${copies} cópias` : "1 cópia"}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {d.width_px && d.height_px ? `${d.width_px}×${d.height_px}px` : ""} · {d.dpi || "—"} dpi · {fmtBytes(d.size_bytes)}
        </p>

        {incomplete ? (
          <p className="flex items-start gap-1.5 text-[10px] text-destructive">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            Este plano foi registado mas o ficheiro não chegou ao servidor. Peça ao cliente para reabrir a página de confirmação do pedido, ou elimine este registo órfão.
          </p>
        ) : isDeleted ? (
          <p className="flex items-center gap-1.5 text-[10px] text-destructive">
            <AlertCircle className="h-3 w-3" /> Ficheiros removidos em {new Date(d.deleted_at!).toLocaleDateString("pt-PT")}
          </p>
        ) : expDays != null ? (
          <p className={`flex items-center gap-1.5 text-[10px] ${expDays <= 1 ? "text-destructive" : "text-amber-600"}`}>
            <Clock className="h-3 w-3" /> Expira em {expDays} dia{expDays === 1 ? "" : "s"}
          </p>
        ) : null}

        <div className="flex gap-2 pt-1">
          <div className="flex-1 text-[10px] uppercase tracking-wider text-muted-foreground self-center">
          {incomplete ? "Registo órfão" : "Pré-visualização (apenas consulta)"}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={isDeleted}
            title={incomplete ? "Eliminar registo órfão" : "Eliminar ficheiros"}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OrderDesignsList;