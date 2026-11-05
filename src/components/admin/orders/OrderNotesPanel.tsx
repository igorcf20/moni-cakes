// Painel Notas e mensagens da página do pedido no Admin (order_notes): histórico com data e autor.
// Cada nota é interna (só a equipe) ou visível ao cliente (aparece em Meus pedidos, OrderMessages).
// O campo antigo orders.notes continua no painel Atualizar pedido.
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdminPanel } from "../shell/AdminPageParts";
import { useInlineConfirm } from "../shell/useInlineConfirm";
import { useMessages } from "@/i18n";
import { orderNotesMessages } from "@/i18n/orderNotes";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useOrderNoteMutations, useOrderNotes } from "@/hooks/useOrderNotes";

export default function OrderNotesPanel({ orderId, hasAccount }: { orderId: string; hasAccount: boolean }) {
  const { t } = useMessages(orderNotesMessages);
  const { dateTime } = useAdminFormat();
  const { data: notes = [], isLoading, error } = useOrderNotes(orderId);
  const { add, setVisible, remove } = useOrderNoteMutations(orderId);
  const { ask, confirmSlot } = useInlineConfirm();
  const [body, setBody] = useState("");
  const [visible, setVis] = useState(false);

  const submit = () => {
    if (!body.trim()) return;
    add.mutate({ body, visible: visible && hasAccount }, {
      onSuccess: () => { setBody(""); setVis(false); toast.success(t("added")); },
      onError: () => toast.error(t("error")),
    });
  };
  const del = async (id: string) => {
    if (!(await ask(t("remove_q"), { description: t("remove_text"), confirmLabel: t("remove"), tone: "danger" }))) return;
    remove.mutate(id, { onSuccess: () => toast.success(t("removed")), onError: () => toast.error(t("error")) });
  };

  return (
    <AdminPanel title={t("title")} icon={MessageSquareText}>
      <p className="mb-3 text-sm text-muted-foreground">{t("hint")}</p>
      <div className="space-y-3 rounded-[14px] border p-3">
        <Textarea aria-label={t("new_ph")} placeholder={t("new_ph")} rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} className="text-base md:text-sm" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {hasAccount ? (
            <div className="flex items-center gap-2">
              <Switch id={`note-vis-${orderId}`} checked={visible} onCheckedChange={setVis} />
              <div>
                <Label htmlFor={`note-vis-${orderId}`} className="text-sm">{t("visible_label")}</Label>
                <p className="text-xs text-muted-foreground">{visible ? t("visible_on") : t("visible_off")}</p>
              </div>
            </div>
          ) : <p className="text-xs text-muted-foreground">{t("guest_note")}</p>}
          <Button size="sm" onClick={submit} disabled={!body.trim() || add.isPending}>
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {add.isPending ? t("adding") : t("add")}
          </Button>
        </div>
      </div>
      {confirmSlot}
      {isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>
      ) : error ? (
        <p className="mt-3 text-sm text-destructive">{t("load_error")}</p>
      ) : notes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {notes.map((n) => (
            <li key={n.id} className={n.visible_to_customer ? "rounded-[14px] border border-primary/30 bg-primary/5 p-3" : "rounded-[14px] border bg-muted/40 p-3"}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className={n.visible_to_customer ? "border-primary/40 text-brand-orange-text" : ""}>
                  {n.visible_to_customer ? t("badge_customer") : t("badge_internal")}
                </Badge>
                <span>{dateTime(n.created_at)}</span>
                {n.author_name && <span>{t("by", { name: n.author_name })}</span>}
              </div>
              <p className="mt-2 whitespace-pre-line break-words text-sm text-foreground">{n.body}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {hasAccount && (
                  <Button variant="ghost" size="sm" className="h-9" disabled={setVisible.isPending} onClick={() => setVisible.mutate({ id: n.id, visible: !n.visible_to_customer }, { onError: () => toast.error(t("error")) })}>
                    {n.visible_to_customer ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    {n.visible_to_customer ? t("hide") : t("show")}
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-9 text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => del(n.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />{t("remove")}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </AdminPanel>
  );
}
