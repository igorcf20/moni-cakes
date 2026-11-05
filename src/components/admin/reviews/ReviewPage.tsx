// Página de uma avaliação de produto no Admin (?tab=reviews&ver=avaliacao&id=<id> ou id=nova): criar, editar,
// publicar ou ocultar, responder em nome da loja e apagar. Avaliação enviada pelo cliente: origem e data ficam as dele.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminSubpage from "../AdminSubpage";
import StorageImageUploader from "../StorageImageUploader";
import { useMessages } from "@/i18n";
import { adminReviewsMessages } from "@/i18n/adminReviews";
import { useAdminFormat } from "@/hooks/useAdminList";
import {
  REVIEW_SOURCES, useAdminProductReviews, useReviewMutations, useReviewProducts, type AdminReview, type ReviewDraft,
} from "@/hooks/useAdminReviews";
import { DeleteWithConfirm, StarInput, sourceLabel } from "./ReviewBits";

const today = () => new Date().toISOString().slice(0, 10);

const emptyDraft = (): ReviewDraft => ({
  product_id: "", customer_name: "", rating: 5, title: "", comment: "", image_url: "",
  source: "whatsapp", approved: true, admin_reply: "", created_at: today(),
});

const toDraft = (r: AdminReview): ReviewDraft => ({
  product_id: r.product_id,
  customer_name: r.customer_name ?? "",
  rating: r.rating,
  title: r.title ?? "",
  comment: r.comment ?? "",
  image_url: r.image_url ?? "",
  source: r.source,
  approved: !!r.approved,
  admin_reply: r.admin_reply ?? "",
  created_at: r.created_at.slice(0, 10),
});

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-4 rounded-[18px] border bg-card p-4 sm:p-5">
    <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h4>
    {children}
  </section>
);

export default function ReviewPage({ id, onBack, onSaved }: { id: string; onBack: () => void; onSaved: (id: string) => void }) {
  const { t } = useMessages(adminReviewsMessages);
  const { dateTime, date } = useAdminFormat();
  const isNew = id === "nova";
  const { data: reviews = [], isLoading } = useAdminProductReviews();
  const { data: products = [] } = useReviewProducts();
  const { save, remove } = useReviewMutations();
  const review = useMemo(() => reviews.find((r) => r.id === id) ?? null, [reviews, id]);
  const [draft, setDraft] = useState<ReviewDraft>(emptyDraft);
  const set = <K extends keyof ReviewDraft>(k: K, v: ReviewDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    if (review) setDraft(toDraft(review));
    else if (isNew) setDraft(emptyDraft());
  }, [review, isNew]);

  if (isLoading) {
    return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("loading")}</p>;
  }
  if (!isNew && !review) {
    return (
      <AdminSubpage title={t("not_found")} backLabel={t("back")} onBack={onBack}>
        <span />
      </AdminSubpage>
    );
  }

  const fromCustomer = !!review && !review.created_by_admin;
  const name = review?.display_name || t("anonymous");

  const submit = () => {
    if (!draft.product_id) return toast.error(t("err_product"));
    if (!fromCustomer && !draft.customer_name.trim()) return toast.error(t("err_name"));
    if (!draft.title.trim()) return toast.error(t("err_title"));
    save.mutate(
      { id: isNew ? null : id, draft, customerReview: fromCustomer },
      {
        onSuccess: (savedId) => { toast.success(t("saved")); if (isNew) onSaved(savedId); },
        onError: (e: any) => toast.error(e?.message || t("save_error")),
      },
    );
  };

  const saveButton = (
    <Button onClick={submit} disabled={save.isPending}>
      {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
      {save.isPending ? t("saving") : t("save")}
    </Button>
  );

  return (
    <AdminSubpage
      title={isNew ? t("page_new") : t("page_edit", { name })}
      subtitle={review?.product_name ?? undefined}
      backLabel={t("back")}
      onBack={onBack}
      actions={saveButton}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Section title={t("sec_review")}>
            {fromCustomer && <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{t("customer_text_note")}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rv-product">{t("product")}</Label>
                <Select value={draft.product_id} onValueChange={(v) => set("product_id", v)} disabled={fromCustomer}>
                  <SelectTrigger id="rv-product"><SelectValue placeholder={t("choose_product")} /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rv-name">{t("customer_name")}</Label>
                <Input id="rv-name" value={draft.customer_name} onChange={(e) => set("customer_name", e.target.value)} maxLength={80} placeholder={fromCustomer ? review?.display_name ?? "" : ""} />
                <p className="text-xs text-muted-foreground">{t("customer_name_hint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("rating")}</Label>
                <StarInput value={draft.rating} onChange={(n) => set("rating", n)} label={t("rating")} t={t} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rv-title">{t("title")}</Label>
                <Input id="rv-title" value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={120} placeholder={t("title_ph")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rv-comment">{t("comment")}</Label>
                <Textarea id="rv-comment" rows={5} value={draft.comment} onChange={(e) => set("comment", e.target.value)} maxLength={3000} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("photo")}</Label>
                <StorageImageUploader value={draft.image_url} onChange={(url) => set("image_url", url)} bucket="product-images" folder="reviews" label="" previewAspect="aspect-square" hint="JPG, PNG, WEBP" />
              </div>
            </div>
          </Section>

          <Section title={t("sec_reply")}>
            <div className="space-y-1.5">
              <Label htmlFor="rv-reply">{t("reply")}</Label>
              <Textarea id="rv-reply" rows={3} value={draft.admin_reply} onChange={(e) => set("admin_reply", e.target.value)} maxLength={2000} placeholder={t("reply_ph")} />
              <p className="text-xs text-muted-foreground">
                {review?.admin_reply_at && draft.admin_reply === (review.admin_reply ?? "") ? t("reply_at", { date: dateTime(review.admin_reply_at) }) : t("reply_hint")}
              </p>
            </div>
          </Section>
        </div>

        <div className="space-y-5">
          <Section title={t("sec_publish")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="rv-approved">{t("published")}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("published_hint")}</p>
              </div>
              <Switch id="rv-approved" checked={draft.approved} onCheckedChange={(v) => set("approved", v)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rv-source">{t("source")}</Label>
              {fromCustomer ? (
                <p className="text-sm text-muted-foreground">{t("source_site_locked")}</p>
              ) : (
                <>
                  <Select value={draft.source} onValueChange={(v) => set("source", v as ReviewDraft["source"])}>
                    <SelectTrigger id="rv-source"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REVIEW_SOURCES.filter((s) => s !== "site").map((s) => <SelectItem key={s} value={s}>{sourceLabel(t, s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("source_hint")}</p>
                </>
              )}
            </div>
            {!fromCustomer && (
              <div className="space-y-1.5">
                <Label htmlFor="rv-date">{t("date")}</Label>
                <Input id="rv-date" type="date" value={draft.created_at} max={today()} onChange={(e) => set("created_at", e.target.value)} />
                <p className="text-xs text-muted-foreground">{t("date_hint")}</p>
              </div>
            )}
          </Section>

          {review && (
            <Section title={t("sec_about")}>
              <ul className="space-y-2 text-sm">
                <li>{review.created_by_admin ? t("about_admin") : t("about_customer")}</li>
                {review.order_id && <li>{t("about_order", { order: review.order_id.slice(0, 8).toUpperCase() })}</li>}
                {!review.created_by_admin && (
                  <li className={review.verified ? "flex items-center gap-1.5 text-emerald-700" : "text-muted-foreground"}>
                    {review.verified && <BadgeCheck className="h-4 w-4" strokeWidth={1.8} />}
                    {review.verified ? t("about_verified") : t("about_not_verified")}
                  </li>
                )}
                <li className="text-muted-foreground">{t("about_created", { date: date(review.created_at) })}</li>
                {review.moderation_date && <li className="text-muted-foreground">{t("about_moderated", { date: dateTime(review.moderation_date) })}</li>}
              </ul>
            </Section>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        {review ? (
          <DeleteWithConfirm
            t={t}
            busy={remove.isPending}
            onConfirm={() => remove.mutate(review.id, {
              onSuccess: () => { toast.success(t("deleted")); onBack(); },
              onError: () => toast.error(t("delete_error")),
            })}
          />
        ) : <span />}
        {saveButton}
      </div>
    </AdminSubpage>
  );
}
