// Página de uma avaliação da loja no Admin (?tab=reviews&aba=loja&ver=loja&id=<id> ou id=nova): as que os clientes
// enviam em /deixar-avaliacao (home_section_items, kind 'testimonial'). Criar, editar, aprovar, recusar e apagar.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AdminSubpage from "../AdminSubpage";
import { FilterChips } from "../AdminListKit";
import { useMessages } from "@/i18n";
import { adminReviewsMessages } from "@/i18n/adminReviews";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useAdminStoreReviews, useStoreReviewMutations, type StoreReview, type StoreReviewDraft } from "@/hooks/useAdminReviews";
import { DeleteWithConfirm, StarInput } from "./ReviewBits";

const emptyDraft = (): StoreReviewDraft => ({ author_name: "", author_role: "", author_location: "", rating: 5, body: "", status: "approved" });

export default function StoreReviewPage({ id, onBack, onSaved }: { id: string; onBack: () => void; onSaved: (id: string) => void }) {
  const { t } = useMessages(adminReviewsMessages);
  const { date } = useAdminFormat();
  const isNew = id === "nova";
  const { data: items = [], isLoading } = useAdminStoreReviews();
  const { save, remove } = useStoreReviewMutations();
  const item = useMemo(() => items.find((r) => r.id === id) ?? null, [items, id]);
  const [draft, setDraft] = useState<StoreReviewDraft>(emptyDraft);
  const set = <K extends keyof StoreReviewDraft>(k: K, v: StoreReviewDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    if (item) setDraft({ author_name: item.author_name ?? "", author_role: item.author_role ?? "", author_location: item.author_location ?? "", rating: item.rating ?? 5, body: item.body ?? "", status: item.status });
    else if (isNew) setDraft(emptyDraft());
  }, [item, isNew]);

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  if (!isNew && !item) return <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}><span /></AdminSubpage>;

  const submit = () => {
    if (!draft.author_name?.trim()) return toast.error(t("err_name"));
    save.mutate({ id: isNew ? null : id, draft }, {
      onSuccess: (savedId) => { toast.success(t("saved")); if (isNew) onSaved(savedId); },
      onError: (e: any) => toast.error(e?.message || t("save_error")),
    });
  };
  const saveButton = (
    <Button onClick={submit} disabled={save.isPending}>
      {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
      {save.isPending ? t("saving") : t("save")}
    </Button>
  );
  const statuses: { value: StoreReview["status"]; label: string }[] = [
    { value: "approved", label: t("approved") }, { value: "pending", label: t("pending") }, { value: "rejected", label: t("rejected") },
  ];

  return (
    <AdminSubpage
      title={isNew ? t("page_new_store") : t("page_edit_store", { name: item?.author_name || t("anonymous") })}
      subtitle={item ? t("about_created", { date: date(item.created_at) }) : undefined}
      backLabel={t("back")}
      onBack={onBack}
      actions={saveButton}
    >
      <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />{t("store_not_shown")}
      </p>
      <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="st-name">{t("customer_name")}</Label>
            <Input id="st-name" value={draft.author_name ?? ""} onChange={(e) => set("author_name", e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("rating")}</Label>
            <StarInput value={draft.rating ?? 5} onChange={(n) => set("rating", n)} label={t("rating")} t={t} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-role">{t("author_role")}</Label>
            <Input id="st-role" value={draft.author_role ?? ""} onChange={(e) => set("author_role", e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-loc">{t("author_location")}</Label>
            <Input id="st-loc" value={draft.author_location ?? ""} onChange={(e) => set("author_location", e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="st-body">{t("store_text")}</Label>
            <Textarea id="st-body" rows={5} value={draft.body ?? ""} onChange={(e) => set("body", e.target.value)} maxLength={3000} />
          </div>
          {item?.submitter_email && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("author_email")}</Label>
              <p className="text-sm">{item.submitter_email}</p>
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("store_status")}</Label>
            <FilterChips options={statuses} value={draft.status} onChange={(v) => set("status", v)} label={t("store_status")} />
            <p className="text-xs text-muted-foreground">{t("store_status_hint")}</p>
          </div>
        </div>
      </section>
      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        {item ? (
          <DeleteWithConfirm t={t} busy={remove.isPending} onConfirm={() => remove.mutate(item.id, {
            onSuccess: () => { toast.success(t("deleted")); onBack(); },
            onError: () => toast.error(t("delete_error")),
          })} />
        ) : <span />}
        {saveButton}
      </div>
    </AdminSubpage>
  );
}
