// Página de um pedido de devolução no Admin (?tab=returns&ver=devolucao&id=<id>): o que o cliente pediu, itens,
// novo estado, resposta ao cliente (ele lê na conta), notas internas (só pela função admin_return_notes) e apagar.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, Loader2, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminSubpage from "../AdminSubpage";
import { InlineConfirm } from "../shell/AdminPageParts";
import { adminHref } from "../shell/adminSections";
import { useMessages } from "@/i18n";
import { adminReturnsMessages } from "@/i18n/adminReturns";
import { returnsMessages } from "@/i18n/returns";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useAdminReturnNotes, useAdminReturns, useDeleteReturn, useUpdateReturn } from "@/hooks/useReturns";
import { RETURN_STATUSES, type ReturnStatus } from "@/lib/returns";
import { cn } from "@/lib/utils";

const TONE: Record<ReturnStatus, string> = {
  requested: "border-amber-300 bg-amber-50 text-amber-800",
  approved: "border-sky-300 bg-sky-50 text-sky-800",
  received: "border-violet-300 bg-violet-50 text-violet-800",
  completed: "border-emerald-300 bg-emerald-50 text-emerald-800",
  rejected: "border-rose-300 bg-rose-50 text-rose-800",
};

export function ReturnBadge({ status }: { status: ReturnStatus }) {
  const { t } = useMessages(returnsMessages);
  return <Badge variant="outline" className={cn(TONE[status])}>{t(`status_${status}`)}</Badge>;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3 rounded-[18px] border bg-card p-4 sm:p-5">
    <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h4>
    {children}
  </section>
);

export default function ReturnPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useMessages(adminReturnsMessages);
  const { t: tr } = useMessages(returnsMessages);
  const { date, dateTime, money } = useAdminFormat();
  const { data: rows = [], isLoading } = useAdminReturns();
  const { data: savedNotes = "", isLoading: notesLoading } = useAdminReturnNotes(id);
  const update = useUpdateReturn();
  const remove = useDeleteReturn();
  const r = useMemo(() => rows.find((x) => x.id === id) ?? null, [rows, id]);

  const [status, setStatus] = useState<ReturnStatus>("requested");
  const [reply, setReply] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => { if (r) { setStatus(r.status); setReply(r.store_reply ?? ""); } }, [r]);
  useEffect(() => { setNotes(savedNotes); }, [savedNotes]);

  if (isLoading || notesLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!r) {
    return (
      <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}>
        <span />
      </AdminSubpage>
    );
  }

  const code = r.order_id.slice(0, 8).toUpperCase();
  const dirty = status !== r.status || reply !== (r.store_reply ?? "") || notes !== savedNotes;
  const save = () => update.mutate({ id: r.id, status, store_reply: reply, admin_notes: notes }, {
    onSuccess: () => toast.success(t("saved")),
    onError: () => toast.error(t("save_error")),
  });

  return (
    <AdminSubpage
      title={t("page_title", { code })}
      subtitle={t("page_sub", { date: dateTime(r.created_at), name: r.customer_name || r.order?.guest_email || t("guest") })}
      backLabel={t("back")}
      onBack={onBack}
      actions={<>
        <ReturnBadge status={r.status} />
        <Button asChild variant="outline" size="sm"><Link to={adminHref.order(r.order_id)}>{t("open_order")}<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
        <Button asChild variant="outline" size="sm"><Link to={adminHref.customer(r.user_id)}>{t("open_customer")}</Link></Button>
      </>}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Section title={t("sec_request")}>
            <p className="font-semibold">{t("wants", { action: tr(`action_${r.action}`) })}</p>
            <p className="text-sm text-muted-foreground">{t("reason", { reason: tr(`reason_${r.reason}`) })}</p>
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <p className="text-xs font-semibold text-muted-foreground">{t("comment")}</p>
              <p className="mt-1 whitespace-pre-line">{r.comment || t("no_comment")}</p>
            </div>
            {r.resolved_at && <p className="text-xs text-muted-foreground">{t("resolved_at", { date: date(r.resolved_at) })}</p>}
          </Section>
          <Section title={t("sec_items")}>
            <ul className="divide-y rounded-[14px] border">
              {r.items.map((it) => (
                <li key={it.order_item_id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  {it.product_id
                    ? <Link to={adminHref.product(it.product_id)} className="font-medium hover:underline">{it.name}</Link>
                    : <span className="font-medium">{it.name}</span>}
                  <span className="tabular-nums text-muted-foreground">x {it.quantity}</span>
                </li>
              ))}
            </ul>
            {r.order && <p className="text-xs text-muted-foreground">{t("order_short", { code })} · {date(r.order.created_at)} · {money(r.order.total)}</p>}
          </Section>
        </div>

        <Section title={t("sec_reply")}>
          <div className="space-y-1.5">
            <Label htmlFor="rt-status">{t("status")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ReturnStatus)}>
              <SelectTrigger id="rt-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RETURN_STATUSES.map((s) => <SelectItem key={s} value={s}>{tr(`status_${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-reply">{t("store_reply")}</Label>
            <Textarea id="rt-reply" rows={5} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("store_reply_hint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-notes">{t("admin_notes")}</Label>
            <Textarea id="rt-notes" rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("admin_notes_hint")}</p>
          </div>
          {(status === "approved" || status === "completed") && r.action === "refund" && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("refund_tip")}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <InlineConfirm
              label={t("delete")}
              icon={Trash2}
              variant="ghost"
              className="text-destructive hover:text-destructive"
              title={t("delete_q")}
              description={t("delete_text")}
              confirmLabel={t("delete")}
              busy={remove.isPending}
              onConfirm={async () => {
                try { await remove.mutateAsync(r.id); toast.success(t("deleted")); onBack(); } catch { toast.error(t("save_error")); }
              }}
            />
            <Button onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
              {update.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </Section>
      </div>
    </AdminSubpage>
  );
}
