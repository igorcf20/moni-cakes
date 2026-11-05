// Peças do fórum (recurso forum) usadas em /forum e /forum/topico/<id>: avatar com iniciais (ou o selo da loja),
// linha de um tópico na lista e o formulário de tópico novo (pela RPC forum_create_topic).
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Eye, Loader2, Lock, MessageSquare, Pin, Store } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useStoreName } from "@/hooks/useBrand";
import { useCreateTopic, useForumRules } from "@/hooks/useForum";
import { useMessages } from "@/i18n";
import { forumMessages } from "@/i18n/forum";
import {
  BODY_MAX, forumErrorOf, initials, relativeTime, TITLE_MAX, topicErrors, topicPath, type ForumCategory, type ForumTopicRow,
} from "@/lib/forum";
import { cn } from "@/lib/utils";

export type ForumT = ReturnType<typeof useMessages<typeof forumMessages["pt-BR"]>>["t"];

/** Círculo com as iniciais; a loja aparece com o ícone e a cor da marca. */
export function ForumAvatar({ name, staff, size = "md" }: { name: string | null; staff: boolean; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-8 w-8 text-[12px]" : "h-11 w-11 text-[15px]";
  if (staff) {
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-full bg-[image:var(--gradient-primary)] text-primary-foreground", box)} aria-hidden="true">
        <Store className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} strokeWidth={1.8} />
      </span>
    );
  }
  return <span className={cn("grid shrink-0 place-items-center rounded-full bg-brand-orange-soft font-semibold text-brand-orange-text", box)} aria-hidden="true">{initials(name)}</span>;
}

/** Nome de quem escreveu: a loja com o selo "Equipe da loja", o cliente pelo primeiro nome. */
export function AuthorName({ name, staff, t }: { name: string | null; staff: boolean; t: ForumT }) {
  const storeName = useStoreName();
  if (!staff) return <span className="font-semibold">{name || t("anon")}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-semibold">{storeName}</span>
      <span className="rounded-md bg-brand-orange-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-brand-orange-text">{t("staff")}</span>
    </span>
  );
}

export function TopicRow({ topic, t, locale, index, showSection }: { topic: ForumTopicRow; t: ForumT; locale: string; index: number; showSection: boolean }) {
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.03 }}>
      <Link to={topicPath(topic.id)}
        className={cn("group flex gap-4 rounded-[18px] border border-brand-card-border bg-white p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_10px_30px_-18px_rgba(23,23,23,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5",
          topic.pending && "border-dashed")}>
        <ForumAvatar name={topic.author_name} staff={topic.is_staff} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {topic.pinned && <span className="inline-flex items-center gap-1 rounded-md bg-brand-orange-soft px-1.5 py-0.5 text-[12px] font-semibold text-brand-orange-text"><Pin className="h-3 w-3" aria-hidden="true" />{t("pinned")}</span>}
            {topic.locked && <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[12px] font-semibold text-muted-foreground"><Lock className="h-3 w-3" aria-hidden="true" />{t("locked")}</span>}
            {topic.pending && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[12px] font-semibold text-amber-800">{t("pending")}</span>}
            <span className="text-[17px] font-semibold leading-snug tracking-[-0.01em] transition-colors duration-150 group-hover:text-brand-orange-text">{topic.title}</span>
          </span>
          {topic.excerpt && <span className="mt-1 line-clamp-1 text-[14px] text-brand-ink-soft">{topic.excerpt}</span>}
          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-brand-ink-soft">
            <AuthorName name={topic.author_name} staff={topic.is_staff} t={t} />
            <span aria-hidden="true">·</span>
            <span>{relativeTime(topic.created_at, locale)}</span>
            {showSection && <><span aria-hidden="true">·</span><span className="rounded-full bg-brand-alt px-2 py-0.5 font-medium text-foreground">{topic.category_name}</span></>}
          </span>
        </span>
        <span className="hidden shrink-0 flex-col items-end justify-between gap-2 text-right text-[13px] text-brand-ink-soft sm:flex">
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1" title={t("replies_label")}><MessageSquare className="h-4 w-4" aria-hidden="true" /><span className="font-semibold tabular-nums text-foreground">{topic.reply_count}</span><span className="sr-only">{t("replies_label")}</span></span>
            <span className="inline-flex items-center gap-1" title={t("views_label")}><Eye className="h-4 w-4" aria-hidden="true" /><span className="tabular-nums">{topic.views}</span><span className="sr-only">{t("views_label")}</span></span>
          </span>
          {topic.reply_count > 0 && <span>{t("last_by", { name: topic.last_post_staff ? t("staff") : topic.last_post_name || t("anon"), when: relativeTime(topic.last_post_at, locale) })}</span>}
        </span>
      </Link>
    </motion.li>
  );
}

/** Formulário de tópico novo. Abre já na seção da página quando houver. */
export function NewTopicForm({ categories, initial, t, onClose }: { categories: ForumCategory[]; initial: string | null; t: ForumT; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: rules } = useForumRules();
  const create = useCreateTopic();
  const [categoryId, setCategoryId] = useState(initial ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const errs = topicErrors({ category_id: categoryId, title, body });
  const show = (k: "category" | "title" | "body") => tried && errs.includes(k);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (errs.length) return;
    try {
      const r = await create.mutateAsync({ categoryId, title, body });
      toast.success(r.status === "pending" ? t("nt_done_pending") : t("nt_done"));
      navigate(topicPath(r.id));
    } catch (x) {
      toast.error(t(`err_${forumErrorOf((x as Error)?.message)}`));
    }
  };

  const field = "w-full rounded-[14px] border border-brand-card-border bg-white px-4 text-[16px] outline-none transition-colors duration-150 focus:border-primary focus-visible:ring-2 focus-visible:ring-ring md:text-[15px]";
  return (
    <motion.form initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      onSubmit={(e) => void submit(e)} noValidate aria-labelledby="forum-new-title"
      className="rounded-[20px] border border-brand-card-border bg-white p-5 shadow-[0_18px_40px_-28px_rgba(23,23,23,0.35)] sm:p-6">
      <h2 id="forum-new-title" className="text-[22px] font-bold tracking-[-0.02em]">{t("nt_title")}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,240px)_1fr]">
        <div className="space-y-1.5">
          <label htmlFor="forum-new-section" className="text-[14px] font-semibold">{t("nt_section")}</label>
          <select id="forum-new-section" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-invalid={show("category")}
            className={cn(field, "h-12", show("category") && "border-destructive")}>
            <option value="">{t("nt_section_ph")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {show("category") && <p className="text-[13px] text-destructive">{t("err_category")}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="forum-new-subject" className="text-[14px] font-semibold">{t("nt_subject")}</label>
          <input id="forum-new-subject" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder={t("nt_subject_ph")}
            aria-invalid={show("title")} className={cn(field, "h-12", show("title") && "border-destructive")} />
          {show("title") ? <p className="text-[13px] text-destructive">{t("err_title")}</p>
            : <p className="text-[13px] text-brand-ink-soft">{t("count", { n: title.length, max: TITLE_MAX })}</p>}
        </div>
      </div>
      <div className="mt-4 space-y-1.5">
        <label htmlFor="forum-new-body" className="text-[14px] font-semibold">{t("nt_body")}</label>
        <Textarea id="forum-new-body" rows={6} maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("nt_body_ph")}
          aria-invalid={show("body")} className={cn("rounded-[14px] bg-white text-[16px] md:text-[15px]", show("body") && "border-destructive")} />
        {show("body") && <p className="text-[13px] text-destructive">{t("err_body")}</p>}
      </div>
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-brand-ink-soft">{rules?.moderate_topics ? t("nt_pending_note") : t("nt_note")}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="inline-flex min-h-12 items-center rounded-[14px] px-5 text-[15px] font-semibold text-brand-ink-soft transition-colors duration-150 hover:bg-brand-alt hover:text-foreground">{t("cancel")}</button>
          <button type="submit" disabled={create.isPending}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("nt_publish")}
          </button>
        </div>
      </div>
    </motion.form>
  );
}
