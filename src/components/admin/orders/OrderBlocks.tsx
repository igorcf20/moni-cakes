// =====================================================================================
// Blocos da página do pedido no Admin (src/pages/admin/AdminOrderPage.tsx):
//   AdminOrderComplianceBlock  aceitações do cliente, pedido de cancelamento e reembolso
//   AdminOrderFiscalDocBlock   PDF da nota fiscal ou fatura enviado para a conta do cliente
//   AdminOrderInvoiceBlock     fatura certificada FIZ (só Portugal)
// Textos em src/i18n/adminOrderBlocks.ts; confirmações de ações sem volta ficam na própria página.
// A Viva e a FIZ só trabalham em euros, por isso os valores delas são mostrados em EUR.
// =====================================================================================
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMessages } from "@/i18n";
import { adminOrderBlocksMessages } from "@/i18n/adminOrderBlocks";
import { useAdminFormat } from "@/hooks/useAdminList";
import { formatMoney } from "@/lib/money";
import { Ban, Check, Loader2, Receipt, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ConfirmStrip } from "@/components/admin/shell/AdminPageParts";

// ---------------------------------------------------------------------------
// Compliance / cancellation / refund actions block (admin)
// ---------------------------------------------------------------------------
interface ComplianceProps {
  order: any;
  onRefresh: () => void;
}

export const AdminOrderComplianceBlock = ({ order, onRefresh }: ComplianceProps) => {
  const { t, locale } = useMessages(adminOrderBlocksMessages);
  const { dateTime } = useAdminFormat();
  const eur = (v: number) => formatMoney(v, "EUR", locale);
  const [busy, setBusy] = useState(false);
  const [refundNote, setRefundNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const isVivaPaid = order.payment_method === "viva" && order.payment_status === "paid";
  const [refuseNote, setRefuseNote] = useState("");
  const [confirmViva, setConfirmViva] = useState(false);

  const cStatus = order.cancellation_status as string | null;
  const cReason = order.cancellation_reason as string | null;
  const cAt = order.cancellation_requested_at as string | null;
  const termsAt = order.terms_accepted_at as string | null;
  const hasCustom = !!order.has_customizable_items;
  const refundedAt = order.refunded_at as string | null;
  const alreadyRefunded = order.payment_status === "refunded" || !!refundedAt;

  const runAdmin = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onRefresh();
    } catch (err: any) {
      toast.error(err?.message || t("error_generic"));
    } finally {
      setBusy(false);
    }
  };

  const approveCancellation = () =>
    runAdmin(async () => {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled", cancellation_status: "approved" } as any)
        .eq("id", order.id);
      if (error) throw error;
      await supabase.from("order_status_history").insert({
        order_id: order.id,
        status: "cancelled",
        notes: t("history_cancel_approved"),
      } as any);
      try {
        const { notifyOrderStatusChange } = await import("@/lib/notifyOrderEmail");
        notifyOrderStatusChange(order.id, "cancelled", { reason: cReason || undefined }).catch(() => {});
      } catch (_) {}
      toast.success(t("cancel_approved_toast"));
    });

  const refuseCancellation = () =>
    runAdmin(async () => {
      const { error } = await supabase
        .from("orders")
        .update({
          cancellation_status: "refused",
          cancellation_reason: [cReason, refuseNote].filter(Boolean).join(" | "),
        } as any)
        .eq("id", order.id);
      if (error) throw error;
      await supabase.from("order_status_history").insert({
        order_id: order.id,
        status: order.status,
        notes: [t("history_cancel_refused"), refuseNote].filter(Boolean).join(": "),
      } as any);
      try {
        const { notifyCancellationRefused } = await import("@/lib/notifyOrderEmail");
        notifyCancellationRefused(order.id, refuseNote || cReason || undefined).catch(() => {});
      } catch (_) {}
      toast.success(t("cancel_refused_toast"));
    });

  // Real refund through the Viva API (full or partial). The function records it and, when the whole
  // amount is returned, marks the order refunded (stock and coupon are released by the database).
  const refundViaViva = () =>
    runAdmin(async () => {
      const value = refundAmount.trim() ? Number(refundAmount.replace(",", ".")) : undefined;
      if (value !== undefined && !(value > 0)) throw new Error(t("refund_invalid"));
      const { data, error } = await supabase.functions.invoke("viva-refund", { body: { orderId: order.id, amount: value, note: refundNote || undefined } });
      if (error) {
        const body = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(body?.error || error.message);
      }
      if ((data as any)?.full) {
        try {
          const { notifyOrderStatusChange } = await import("@/lib/notifyOrderEmail");
          notifyOrderStatusChange(order.id, "refunded", { reason: refundNote || undefined }).catch(() => {});
        } catch (_) {}
      }
      toast.success((data as any)?.full ? t("refund_full_toast") : t("refund_partial_toast", { value: eur(Number((data as any)?.remaining ?? 0)) }));
      setRefundAmount("");
    });

  const markRefunded = () =>
    runAdmin(async () => {
      const { error } = await supabase
        .from("orders")
        .update({
          payment_status: "refunded",
          refunded_at: new Date().toISOString(),
          refund_note: refundNote || null,
        } as any)
        .eq("id", order.id);
      if (error) throw error;
      await supabase.from("order_status_history").insert({
        order_id: order.id,
        status: order.status,
        notes: [t("history_refunded"), refundNote].filter(Boolean).join(": "),
      } as any);
      try {
        const { notifyOrderStatusChange } = await import("@/lib/notifyOrderEmail");
        notifyOrderStatusChange(order.id, "refunded", { reason: refundNote || undefined }).catch(() => {});
      } catch (_) {}
      toast.success(t("refund_recorded"));
    });

  return (
    <div className="space-y-3">
      {hasCustom && (
        <div>
          <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" /> {t("acceptances")}
          </h4>
          <div className="text-xs bg-background p-3 rounded-lg border border-border/50 space-y-1">
            <p>
              <span className="text-muted-foreground">{t("terms")}</span>{" "}
              {termsAt ? (
                <span className="font-medium">{t("terms_at", { date: dateTime(termsAt) })}</span>
              ) : (
                <span className="text-destructive">{t("terms_missing")}</span>
              )}
            </p>
            <p>
              <span className="text-muted-foreground">{t("low_res")}</span>{" "}
              <span className="font-medium">{order.low_res_accepted ? t("yes") : t("no")}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{t("resize")}</span>{" "}
              <span className="font-medium">{order.proportional_resize_accepted ? t("yes") : t("no")}</span>
            </p>
          </div>
        </div>
      )}

      {cStatus === "requested" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Ban className="h-4 w-4" /> {t("cancel_requested")}
            </p>
            {cAt && <p className="text-[11px] text-muted-foreground">{t("cancel_requested_at", { date: dateTime(cAt) })}</p>}
            {cReason && <p className="text-xs mt-1"><span className="text-muted-foreground">{t("reason")}</span> {cReason}</p>}
          </div>
          <Textarea
            placeholder={t("refuse_note_placeholder")}
            value={refuseNote}
            onChange={(e) => setRefuseNote(e.target.value)}
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={approveCancellation} disabled={busy}>
              <Check className="h-3.5 w-3.5 mr-1.5" /> {t("approve")}
            </Button>
            <Button size="sm" variant="outline" onClick={refuseCancellation} disabled={busy}>
              <Ban className="h-3.5 w-3.5 mr-1.5" /> {t("refuse")}
            </Button>
          </div>
        </div>
      )}

      {cStatus === "refused" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
          {t("cancel_refused_box")}
        </div>
      )}
      {cStatus === "approved" && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
          {t("cancel_approved_box")}
        </div>
      )}

      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm">
          <RotateCcw className="h-4 w-4 text-primary" /> {t("refund")}
        </h4>
        {alreadyRefunded ? (
          <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs space-y-1">
            <p className="font-semibold">
              {refundedAt ? t("refund_done_at", { date: dateTime(refundedAt) }) : t("refund_done")}
            </p>
            {order.refund_note && <p className="text-muted-foreground">{t("refund_note_label", { note: order.refund_note })}</p>}
          </div>
        ) : (
          <div className="rounded-lg border border-border/40 bg-background p-3 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              {t("refund_help")}
            </p>
            <Textarea
              placeholder={t("refund_note_placeholder")}
              value={refundNote}
              onChange={(e) => setRefundNote(e.target.value)}
              rows={2}
            />
            {isVivaPaid && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                <Input
                  className="h-8 w-32 text-sm"
                  inputMode="decimal"
                  placeholder={t("refund_total_placeholder", { value: eur(Number(order.total)) })}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  aria-label={t("refund_amount_aria")}
                />
                <Button size="sm" onClick={() => setConfirmViva(true)} disabled={busy}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> {t("refund_viva")}
                </Button>
                <span className="text-[11px] text-muted-foreground">{t("refund_viva_hint")}</span>
                <ConfirmStrip
                  open={confirmViva}
                  title={refundAmount.trim() ? t("refund_viva_confirm", { value: eur(Number(refundAmount.replace(",", ".")) || 0) }) : t("refund_viva_confirm_total")}
                  description={t("refund_irreversible")}
                  confirmLabel={t("refund_confirm")}
                  busy={busy}
                  onCancel={() => setConfirmViva(false)}
                  onConfirm={() => { setConfirmViva(false); void refundViaViva(); }}
                />
              </div>
            )}
            <Button size="sm" variant="outline" onClick={markRefunded} disabled={busy}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> {isVivaPaid ? t("refund_only_record") : t("refund_mark")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Documento fiscal em PDF (qualquer país: NF-e, fatura...), enviado pelo Admin e mostrado ao cliente na aba
// Faturas da conta. Ficheiro no bucket privado "invoices" (<order_id>/<nome>.pdf); número e data em
// order_invoices (migration 20261005150000_customer_invoices.sql).
// ---------------------------------------------------------------------------
export const AdminOrderFiscalDocBlock = ({ order }: { order: any }) => {
  const { t } = useMessages(adminOrderBlocksMessages);
  const { dateTime } = useAdminFormat();
  const [busy, setBusy] = useState(false);
  const [number, setNumber] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { data: invoice, refetch } = useQuery({
    queryKey: ["order-fiscal-doc", order.id],
    queryFn: async () => {
      const { data } = await supabase.from("order_invoices" as any).select("*").eq("order_id", order.id).maybeSingle();
      return data as any;
    },
  });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
      toast.error(t("doc_bad_file"));
      return;
    }
    setBusy(true);
    try {
      const safe = file.name.replace(/\.pdf$/i, "").normalize("NFD").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "documento";
      const path = `${order.id}/${safe}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from("order_invoices" as any).upsert(
        {
          order_id: order.id,
          provider: invoice?.provider ?? "manual",
          number: number.trim() || invoice?.number || null,
          issued_at: invoice?.issued_at ?? new Date().toISOString(),
          document_path: path,
        },
        { onConflict: "order_id" },
      );
      if (error) throw error;
      if (invoice?.document_path) await supabase.storage.from("invoices").remove([invoice.document_path]);
      toast.success(t("doc_sent"));
      setNumber("");
    } catch (err: any) {
      toast.error(err?.message || t("doc_send_error"));
    } finally {
      setBusy(false);
      refetch();
    }
  };

  const remove = async () => {
    if (!invoice?.document_path) return;
    setConfirmRemove(false);
    setBusy(true);
    try {
      await supabase.storage.from("invoices").remove([invoice.document_path]);
      const { error } = invoice.provider === "manual"
        ? await supabase.from("order_invoices" as any).delete().eq("order_id", order.id)
        : await supabase.from("order_invoices" as any).update({ document_path: null }).eq("order_id", order.id);
      if (error) throw error;
      toast.success(t("doc_removed"));
    } catch (err: any) {
      toast.error(err?.message || t("doc_remove_error"));
    } finally {
      setBusy(false);
      refetch();
    }
  };

  const open = async () => {
    const { data } = await supabase.storage.from("invoices").createSignedUrl(invoice.document_path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div>
      <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm">
        <Receipt className="h-4 w-4 text-primary" /> {t("doc_title")}
      </h4>
      <div className="rounded-lg border border-border/40 bg-background p-3 space-y-2 text-xs">
        {invoice?.document_path ? (
          <p className="font-semibold">
            {invoice.number ? t("doc_available_n", { number: invoice.number }) : t("doc_available")}
            {invoice.issued_at ? ` ${t("doc_issued_at", { date: dateTime(invoice.issued_at) })}` : ""}
          </p>
        ) : (
          <p className="text-muted-foreground">
            {t("doc_help")}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`doc-number-${order.id}`} className="text-xs">{t("doc_number")}</Label>
            <Input id={`doc-number-${order.id}`} value={number} onChange={(e) => setNumber(e.target.value)} placeholder={invoice?.number || t("doc_number_placeholder")} className="h-8 w-40 text-xs" />
          </div>
          <Button size="sm" variant="outline" disabled={busy} asChild>
            <label className="cursor-pointer">
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {invoice?.document_path ? t("doc_replace") : t("doc_send")}
              <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </Button>
          {invoice?.document_path && (
            <>
              <Button size="sm" variant="ghost" onClick={open} disabled={busy}>{t("doc_view")}</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmRemove(true)} disabled={busy}>{t("doc_remove")}</Button>
            </>
          )}
        </div>
        <ConfirmStrip
          open={confirmRemove}
          title={t("doc_remove_confirm")}
          description={t("doc_remove_hint")}
          confirmLabel={t("doc_remove")}
          busy={busy}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => void remove()}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// FIZ invoice block (admin). Drafts are safe; issuing is fiscal and irreversible.
// ---------------------------------------------------------------------------
export const AdminOrderInvoiceBlock = ({ order }: { order: any }) => {
  const { t, locale } = useMessages(adminOrderBlocksMessages);
  const { dateTime } = useAdminFormat();
  const eur = (v: number) => formatMoney(v, "EUR", locale);
  const [busy, setBusy] = useState(false);
  const { data: invoice, refetch } = useQuery({
    queryKey: ["order-invoice", order.id],
    queryFn: async () => {
      const { data } = await supabase.from("order_invoices" as any).select("*").eq("order_id", order.id).maybeSingle();
      // PDF enviado à mão (bloco acima) não é fatura FIZ.
      return (data as any)?.provider === "manual" ? null : (data as any);
    },
  });

  const call = async (action: "draft" | "issue" | "pdf") => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("fiz-invoice", { body: { action, orderId: order.id } });
      if (error) {
        const body = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(body?.error || error.message);
      }
      if (action === "pdf") window.open((data as any).url, "_blank", "noopener");
      else toast.success(action === "issue" ? t("fiz_issued_toast") : t("fiz_draft_toast"));
    } catch (err: any) {
      toast.error(err?.message || t("fiz_error"));
    } finally {
      setBusy(false);
      refetch();
    }
  };

  const [confirmIssue, setConfirmIssue] = useState(false);

  const mismatch = invoice?.remote_total != null && Math.abs(Number(invoice.remote_total) - Number(order.total)) > 0.01;

  return (
    <div>
      <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm">
        <Receipt className="h-4 w-4 text-primary" /> {t("fiz_title")}
      </h4>
      <div className="rounded-lg border border-border/40 bg-background p-3 space-y-2 text-xs">
        {invoice?.number ? (
          <p className="font-semibold">{invoice.issued_at ? t("fiz_issued_at", { number: invoice.number, date: dateTime(invoice.issued_at) }) : t("fiz_issued", { number: invoice.number })}</p>
        ) : invoice?.invoice_id ? (
          <p>{t("fiz_draft")}</p>
        ) : (
          <p className="text-muted-foreground">{t("fiz_none")}</p>
        )}
        {mismatch && (
          <p className="text-amber-700">{t("fiz_mismatch", { remote: eur(Number(invoice.remote_total)), total: eur(Number(order.total)) })}</p>
        )}
        {invoice?.error && <p className="text-destructive">{t("fiz_last_error", { error: invoice.error })}</p>}
        <div className="flex flex-wrap gap-2">
          {!invoice?.invoice_id && (
            <Button size="sm" variant="outline" onClick={() => call("draft")} disabled={busy}>{t("fiz_create_draft")}</Button>
          )}
          {invoice?.invoice_id && (
            <Button size="sm" variant="outline" onClick={() => call("pdf")} disabled={busy}>{t("doc_view")}</Button>
          )}
          {!invoice?.number && order.payment_status === "paid" && (
            <Button size="sm" onClick={() => setConfirmIssue(true)} disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} {t("fiz_issue")}
            </Button>
          )}
        </div>
        <ConfirmStrip
          open={confirmIssue}
          tone="warning"
          title={t("fiz_issue_confirm")}
          description={t("fiz_issue_hint")}
          confirmLabel={t("fiz_issue")}
          busy={busy}
          onCancel={() => setConfirmIssue(false)}
          onConfirm={() => { setConfirmIssue(false); void call("issue"); }}
        />
      </div>
    </div>
  );
};
