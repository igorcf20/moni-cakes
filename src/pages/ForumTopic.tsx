// /forum/topico/<id>: um tópico do fórum (recurso forum) com as respostas em ordem, editar o próprio texto dentro
// do prazo das regras, denunciar uma mensagem e responder (só com conta; tópico fechado não recebe respostas).
// Mensagens em texto simples (sem HTML). SEO com DiscussionForumPosting em JSON-LD.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Eye, Flag, Loader2, Lock, MessageSquare, MessagesSquare, Pencil, Pin } from "lucide-react";
import { ListingShell } from "@/components/catalog/CatalogLayout";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import { AuthorName, ForumAvatar, type ForumT } from "@/components/forum/ForumParts";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useStoreName } from "@/hooks/useBrand";
import { countForumView, useForumEdit, useForumReply, useForumReport, useForumRules, useForumTopic } from "@/hooks/useForum";
import { useMessages } from "@/i18n";
import { forumMessages } from "@/i18n/forum";
import {
  BODY_MAX, categoryPath, editMinutesLeft, FORUM_PATH, forumErrorOf, relativeTime, TITLE_MAX, topicErrors, topicPath, type ForumPost, type ForumTopic as Topic,
} from "@/lib/forum";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

const jsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
const button = "inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ghost = "inline-flex min-h-10 items-center gap-1.5 rounded-[12px] px-3 text-[14px] font-semibold text-brand-ink-soft transition-colors duration-150 hover:bg-brand-alt hover:text-foreground";

export default function ForumTopic() {
  const { id } = useParams();
  const { t, locale } = useMessages(forumMessages);
  const storeName = useStoreName();
  const { data: topic, isLoading, error } = useForumTopic(id);
  useEffect(() => { if (topic?.id && !topic.pending) countForumView(topic.id); }, [topic?.id, topic?.pending]);
  const errCode = error ? forumErrorOf((error as Error).message) : null;

  if (isLoading) {
    return <ListingShell><div className="mx-auto max-w-3xl space-y-4 py-6" aria-busy="true"><div className="skeleton h-12 w-3/4 rounded-xl" /><div className="skeleton h-40 rounded-[20px]" /><div className="skeleton h-28 rounded-[20px]" /></div></ListingShell>;
  }
  if (!topic) {
    const auth = errCode === "auth_required";
    return (
      <ListingShell>
        <Helmet><title>{`${auth ? t("auth_required_title") : t("not_found")} | ${storeName}`}</title><meta name="robots" content="noindex" /></Helmet>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
          <MessagesSquare className="h-10 w-10 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
          <h1 className="text-[32px] font-bold tracking-[-0.03em]">{auth ? t("auth_required_title") : t("not_found")}</h1>
          <p className="text-brand-ink-soft">{auth ? t("auth_required") : t("not_found_d")}</p>
          {auth
            ? <Link to={`/auth?redirect=${encodeURIComponent(topicPath(id ?? ""))}`} className={cn(button, "mt-3")}>{t("login_btn")}</Link>
            : <Link to={FORUM_PATH} className="mt-3 inline-flex items-center gap-1.5 font-semibold text-brand-orange-text hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("back")}</Link>}
        </div>
      </ListingShell>
    );
  }

  const url = `${siteUrl()}${topicPath(topic.id)}`;
  const author = (name: string | null, staff: boolean) => ({ "@type": staff ? "Organization" : "Person", name: staff ? storeName : name || t("anon") });
  const ld = {
    "@context": "https://schema.org", "@type": "DiscussionForumPosting", headline: topic.title, text: topic.body, url,
    datePublished: topic.created_at, author: author(topic.author_name, topic.is_staff),
    interactionStatistic: [{ "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: topic.reply_count }],
    comment: topic.posts.filter((p) => !p.pending).slice(0, 50).map((p) => ({ "@type": "Comment", text: p.body, datePublished: p.created_at, author: author(p.author_name, p.is_staff) })),
  };
  const visible = topic.posts.filter((p) => !p.pending).length;

  return (
    <ListingShell>
      <Helmet>
        <title>{`${topic.title} | ${storeName}`}</title>
        <meta name="description" content={topic.body.replace(/\s+/g, " ").slice(0, 160)} />
        <link rel="canonical" href={url} />
        {topic.pending && <meta name="robots" content="noindex" />}
        <script type="application/ld+json">{jsonLd(ld)}</script>
      </Helmet>
      <div className="mx-auto max-w-3xl">
        <CatalogBreadcrumb items={[{ label: t("home"), href: "/" }, { label: t("forum"), href: FORUM_PATH }, { label: topic.category_name, href: categoryPath(topic.category_slug) }, { label: topic.title }]} />
        <p className="mt-6 flex flex-wrap items-center gap-2">
          <Link to={categoryPath(topic.category_slug)} className="rounded-full bg-brand-orange-soft px-3 py-1 text-[13px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-primary hover:text-primary-foreground">{topic.category_name}</Link>
          {topic.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-brand-orange-text ring-1 ring-brand-card-border"><Pin className="h-3.5 w-3.5" aria-hidden="true" />{t("pinned")}</span>}
          {topic.locked && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[13px] font-semibold text-muted-foreground"><Lock className="h-3.5 w-3.5" aria-hidden="true" />{t("locked")}</span>}
        </p>
        <TopicHead topic={topic} t={t} locale={locale} />
        {topic.pending && <p className="mt-4 rounded-[14px] bg-amber-50 p-3 text-[14px] text-amber-900">{t("pending_topic_note")}</p>}

        <section aria-labelledby="forum-replies" className="mt-10">
          <h2 id="forum-replies" className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.02em]">
            <MessageSquare className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden="true" />
            {visible === 1 ? t("replies_one") : visible ? t("replies_n", { n: visible }) : t("replies_label")}
          </h2>
          {topic.posts.length === 0 ? <p className="mt-3 text-brand-ink-soft">{t("replies_none")}</p> : (
            <ol className="mt-5 space-y-4">
              {topic.posts.map((p, i) => <PostCard key={p.id} post={p} topic={topic} t={t} locale={locale} index={i} />)}
            </ol>
          )}
          <ReplyBox topic={topic} t={t} />
        </section>
        <Link to={categoryPath(topic.category_slug)} className="mt-10 inline-flex items-center gap-1.5 font-semibold text-brand-orange-text hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("back_section", { name: topic.category_name })}</Link>
      </div>
    </ListingShell>
  );
}

/** Título e primeira mensagem do tópico, com editar (dono, dentro do prazo) e denunciar. */
function TopicHead({ topic, t, locale }: { topic: Topic; t: ForumT; locale: string }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [body, setBody] = useState(topic.body);
  const edit = useForumEdit();
  const errs = topicErrors({ title, body }, false);
  const save = async () => {
    if (errs.length) { toast.error(t(errs.includes("title") ? "err_title" : "err_body")); return; }
    try {
      await edit.mutateAsync({ topicId: topic.id, postId: null, title, body });
      setEditing(false);
      toast.success(t("saved"));
    } catch (x) {
      toast.error(t(`err_${forumErrorOf((x as Error)?.message)}`));
    }
  };
  return (
    <article className="mt-4">
      {editing ? (
        <input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} aria-label={t("nt_subject")}
          className="w-full rounded-[14px] border border-brand-card-border bg-white px-4 py-3 text-[24px] font-bold tracking-[-0.02em] outline-none focus:border-primary" />
      ) : (
        <h1 className="text-[32px] font-[780] leading-[1.1] tracking-[-0.035em] sm:text-[42px]">{topic.title}</h1>
      )}
      <div className="mt-5 rounded-[20px] border border-brand-card-border bg-white p-5 sm:p-6">
        <Byline name={topic.author_name} staff={topic.is_staff} created={topic.created_at} edited={topic.edited_at} t={t} locale={locale}
          extra={<span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" aria-hidden="true" />{t("views_n", { n: topic.views })}</span>} />
        {editing ? (
          <EditBody body={body} setBody={setBody} onSave={() => void save()} onCancel={() => { setEditing(false); setTitle(topic.title); setBody(topic.body); }} pending={edit.isPending} t={t} />
        ) : (
          <p className="mt-4 whitespace-pre-line break-words text-[16px] leading-relaxed">{topic.body}</p>
        )}
        {!editing && <Actions canEdit={topic.can_edit} left={editMinutesLeft(topic.created_at, topic.edit_minutes)} mine={topic.mine}
          onEdit={() => setEditing(true)} topicId={topic.id} postId={null} t={t} />}
      </div>
    </article>
  );
}

function Byline({ name, staff, created, edited, t, locale, extra }: { name: string | null; staff: boolean; created: string; edited: string | null; t: ForumT; locale: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <ForumAvatar name={name} staff={staff} />
      <div className="min-w-0 text-[14px]">
        <AuthorName name={name} staff={staff} t={t} />
        <p className="flex flex-wrap items-center gap-x-2 text-brand-ink-soft">
          <time dateTime={created} title={new Date(created).toLocaleString(locale)}>{relativeTime(created, locale)}</time>
          {edited && <span>{t("edited")}</span>}
          {extra}
        </p>
      </div>
    </div>
  );
}

function EditBody({ body, setBody, onSave, onCancel, pending, t }: { body: string; setBody: (v: string) => void; onSave: () => void; onCancel: () => void; pending: boolean; t: ForumT }) {
  return (
    <div className="mt-4 space-y-3">
      <Textarea rows={5} maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} aria-label={t("nt_body")} className="rounded-[14px] bg-white text-[16px] md:text-[15px]" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={ghost}>{t("cancel")}</button>
        <button type="button" onClick={onSave} disabled={pending} className={button}>{pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("save")}</button>
      </div>
    </div>
  );
}

/** Editar (dono, dentro do prazo) e denunciar (outros clientes com conta), com o motivo escrito na própria página. */
function Actions({ canEdit, left, mine, onEdit, topicId, postId, t }: { canEdit: boolean; left: number; mine: boolean; onEdit: () => void; topicId: string; postId: string | null; t: ForumT }) {
  const { user } = useAuth();
  const report = useForumReport();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  if (!user) return null;
  const send = async () => {
    if (reason.trim().length < 2) { toast.error(t("err_invalid")); return; }
    try {
      await report.mutateAsync({ topicId, postId, reason });
      setReporting(false);
      setReason("");
      toast.success(t("reported"));
    } catch (x) {
      toast.error(t(`err_${forumErrorOf((x as Error)?.message)}`));
    }
  };
  return (
    <div className="mt-4 border-t border-brand-card-border pt-3">
      <div className="flex flex-wrap items-center gap-1">
        {canEdit && <button type="button" onClick={onEdit} className={ghost}><Pencil className="h-4 w-4" aria-hidden="true" />{t("edit")}</button>}
        {canEdit && left > 0 && <span className="text-[13px] text-brand-ink-soft">{t("edit_left", { n: left })}</span>}
        {!mine && <button type="button" onClick={() => setReporting((v) => !v)} aria-expanded={reporting} className={cn(ghost, "ml-auto")}><Flag className="h-4 w-4" aria-hidden="true" />{t("report")}</button>}
      </div>
      <AnimatePresence initial={false}>
        {reporting && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="mt-3 space-y-2 rounded-[14px] bg-brand-alt p-3">
              <label htmlFor={`report-${postId ?? topicId}`} className="text-[14px] font-semibold">{t("report_title")}</label>
              <Textarea id={`report-${postId ?? topicId}`} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("report_ph")} className="rounded-[12px] bg-white text-[16px] md:text-[15px]" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setReporting(false)} className={ghost}>{t("cancel")}</button>
                <button type="button" onClick={() => void send()} disabled={report.isPending} className={cn(button, "min-h-10 px-4")}>{t("report_send")}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PostCard({ post, topic, t, locale, index }: { post: ForumPost; topic: Topic; t: ForumT; locale: string; index: number }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(post.body);
  const edit = useForumEdit();
  const save = async () => {
    if (body.trim().length < 2) { toast.error(t("err_body")); return; }
    try {
      await edit.mutateAsync({ topicId: topic.id, postId: post.id, title: null, body });
      setEditing(false);
      toast.success(t("saved"));
    } catch (x) {
      toast.error(t(`err_${forumErrorOf((x as Error)?.message)}`));
    }
  };
  return (
    <motion.li id={`resposta-${post.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
      className={cn("scroll-mt-28 rounded-[20px] border bg-white p-5", post.is_staff ? "border-primary/30 bg-brand-orange-soft/30" : "border-brand-card-border", post.pending && "border-dashed")}>
      <Byline name={post.author_name} staff={post.is_staff} created={post.created_at} edited={post.edited_at} t={t} locale={locale}
        extra={post.pending ? <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[12px] font-semibold text-amber-800">{t("pending")}</span> : null} />
      {editing
        ? <EditBody body={body} setBody={setBody} onSave={() => void save()} onCancel={() => { setEditing(false); setBody(post.body); }} pending={edit.isPending} t={t} />
        : <p className="mt-3 whitespace-pre-line break-words text-[16px] leading-relaxed">{post.body}</p>}
      {!editing && !post.pending && <Actions canEdit={post.can_edit} left={editMinutesLeft(post.created_at, topic.edit_minutes)} mine={post.mine}
        onEdit={() => setEditing(true)} topicId={topic.id} postId={post.id} t={t} />}
      {!editing && post.pending && post.can_edit && (
        <div className="mt-3"><button type="button" onClick={() => setEditing(true)} className={ghost}><Pencil className="h-4 w-4" aria-hidden="true" />{t("edit")}</button></div>
      )}
    </motion.li>
  );
}

function ReplyBox({ topic, t }: { topic: Topic; t: ForumT }) {
  const { user } = useAuth();
  const { data: rules } = useForumRules();
  const reply = useForumReply();
  const [body, setBody] = useState("");
  if (topic.pending) return null;
  if (topic.locked) return <p className="mt-6 flex items-center gap-2 rounded-[18px] bg-muted p-4 text-[15px] text-muted-foreground"><Lock className="h-4 w-4" aria-hidden="true" />{t("locked_note")}</p>;
  if (!user) {
    return (
      <p className="mt-6 flex flex-wrap items-center gap-3 rounded-[18px] bg-brand-alt p-4 text-[15px]">
        {t("reply_login")}
        <Link to={`/auth?redirect=${encodeURIComponent(topicPath(topic.id))}`} className="font-semibold text-brand-orange-text hover:underline">{t("login_btn")}</Link>
      </p>
    );
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 2) { toast.error(t("err_body")); return; }
    try {
      const r = await reply.mutateAsync({ topicId: topic.id, body });
      setBody("");
      toast.success(r.status === "pending" ? t("reply_done_pending") : t("reply_done"));
    } catch (x) {
      toast.error(t(`err_${forumErrorOf((x as Error)?.message)}`));
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-3 rounded-[20px] border border-brand-card-border bg-white p-5">
      <label htmlFor="forum-reply" className="text-[17px] font-semibold">{t("reply_title")}</label>
      <Textarea id="forum-reply" rows={5} maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("reply_ph")} className="rounded-[14px] bg-white text-[16px] md:text-[15px]" />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-brand-ink-soft">{rules?.moderate_posts ? t("reply_pending_note") : t("reply_note")}</p>
        <button type="submit" disabled={reply.isPending} className={button}>{reply.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("reply_send")}</button>
      </div>
    </form>
  );
}
