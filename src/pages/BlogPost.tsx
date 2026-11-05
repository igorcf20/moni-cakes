// /blog/<slug>: um artigo do blog (recurso blog). Capa, texto (SiteHtml, limpo com DOMPurify), assuntos, produtos
// ligados (cartões com preço do país), anterior e seguinte no mesmo idioma e comentários (clientes com conta, pela RPC
// add_blog_comment; aparecem depois de aprovados quando a regra pede). SEO com BlogPosting em JSON-LD.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Clock, Loader2, MessageSquare, Newspaper } from "lucide-react";
import { ListingShell } from "@/components/catalog/CatalogLayout";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import { LayerArt, MediaImage } from "@/components/MediaImage";
import SiteHtml from "@/components/SiteHtml";
import { ProductCard3D, ProductCardSkeleton, type CardProduct } from "@/components/product/ProductCard3D";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useStoreName } from "@/hooks/useBrand";
import { countBlogView, useAddBlogComment, useBlogComments, useBlogPost, useBlogPosts, useBlogSettings } from "@/hooks/useBlog";
import { useProductCards } from "@/hooks/useProductCards";
import { useQuickAdd } from "@/hooks/useQuickAdd";
import { useWishlist } from "@/hooks/useWishlist";
import { useMessages } from "@/i18n";
import { blogMessages } from "@/i18n/blog";
import { blogErrorOf, blogExcerpt, blogForLocale, BLOG_PATH, neighbours, readingMinutes, type BlogPost as Post } from "@/lib/blog";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useMessages<typeof blogMessages["pt-BR"]>>["t"];
const jsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

export default function BlogPost() {
  const { slug } = useParams();
  const { t, locale } = useMessages(blogMessages);
  const storeName = useStoreName();
  const { data: post, isLoading } = useBlogPost(slug);
  const { data: all = [] } = useBlogPosts();
  useEffect(() => { if (post?.id) countBlogView(post.id); }, [post?.id]);
  const nb = useMemo(() => (post ? neighbours(all.filter((p) => blogForLocale(p, locale)), post.id) : { prev: null, next: null }), [all, post, locale]);
  const date = (d: string | null) => (d ? new Date(d).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "");

  if (isLoading) {
    return <ListingShell><div className="mx-auto max-w-3xl space-y-4 py-6" aria-busy="true"><div className="skeleton h-12 w-3/4 rounded-xl" /><div className="skeleton aspect-[16/9] rounded-[24px]" /><div className="skeleton h-40 rounded-xl" /></div></ListingShell>;
  }
  if (!post) {
    return (
      <ListingShell>
        <Helmet><title>{`${t("not_found")} | ${storeName}`}</title><meta name="robots" content="noindex" /></Helmet>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
          <Newspaper className="h-10 w-10 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
          <h1 className="text-[32px] font-bold tracking-[-0.03em]">{t("not_found")}</h1>
          <p className="text-brand-ink-soft">{t("not_found_d")}</p>
          <Link to={BLOG_PATH} className="mt-3 inline-flex items-center gap-1.5 font-semibold text-brand-orange-text hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("back")}</Link>
        </div>
      </ListingShell>
    );
  }

  const url = `${siteUrl()}${BLOG_PATH}/${post.slug}`;
  const description = post.seo_description || blogExcerpt(post, 160);
  const ld = {
    "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description, url,
    datePublished: post.published_at, dateModified: post.updated_at, ...(post.cover_url ? { image: post.cover_url } : {}),
    ...(post.author_name ? { author: { "@type": "Person", name: post.author_name } } : {}),
    publisher: { "@type": "Organization", name: storeName }, ...(post.tags.length ? { keywords: post.tags.join(", ") } : {}),
  };

  return (
    <ListingShell>
      <Helmet>
        <title>{`${post.seo_title || post.title} | ${storeName}`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.seo_title || post.title} />
        <meta property="og:description" content={description} />
        {post.cover_url && <meta property="og:image" content={post.cover_url} />}
        <script type="application/ld+json">{jsonLd(ld)}</script>
      </Helmet>
      <article className="mx-auto max-w-3xl">
        <CatalogBreadcrumb items={[{ label: t("home"), href: "/" }, { label: t("blog"), href: BLOG_PATH }, { label: post.title }]} />
        {post.tags.length > 0 && (
          <p className="mt-6 flex flex-wrap gap-2">
            {post.tags.map((x) => <Link key={x} to={`${BLOG_PATH}?assunto=${encodeURIComponent(x)}`} className="rounded-full bg-brand-orange-soft px-3 py-1 text-[13px] font-semibold capitalize text-brand-orange-text transition-colors duration-150 hover:bg-primary hover:text-primary-foreground">{x}</Link>)}
          </p>
        )}
        <h1 className="mt-4 text-[36px] font-[780] leading-[1.08] tracking-[-0.04em] sm:text-[48px] lg:text-[56px]">{post.title}</h1>
        {post.excerpt && <p className="mt-4 text-[18px] leading-relaxed text-brand-ink-soft md:text-[20px]">{post.excerpt}</p>}
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-brand-ink-soft">
          {post.author_name && <span className="font-semibold text-foreground">{t("by", { name: post.author_name })}</span>}
          <span>{date(post.published_at)}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{t("min_read", { n: readingMinutes(post.body) })}</span>
        </p>
        {post.cover_url && (
          <MediaImage src={post.cover_url} alt={post.cover_alt ?? ""} eager className="mt-8 aspect-[16/9] rounded-[24px] border border-brand-card-border" fallback={<LayerArt Icon={Newspaper} size="lg" />} />
        )}
        <SiteHtml html={post.body ?? ""} className="mt-8" />
      </article>

      {post.product_ids.length > 0 && <RelatedProducts ids={post.product_ids} t={t} />}

      <div className="mx-auto max-w-3xl">
        {(nb.prev || nb.next) && (
          <nav aria-label={t("blog")} className="mt-12 grid gap-3 border-t border-brand-card-border pt-8 sm:grid-cols-2">
            {nb.prev ? <Neighbour p={nb.prev} label={t("prev")} dir="prev" /> : <span />}
            {nb.next && <Neighbour p={nb.next} label={t("next")} dir="next" />}
          </nav>
        )}
        <Comments post={post} t={t} date={date} />
        <Link to={BLOG_PATH} className="mt-10 inline-flex items-center gap-1.5 font-semibold text-brand-orange-text hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("back")}</Link>
      </div>
    </ListingShell>
  );
}

function Neighbour({ p, label, dir }: { p: Post; label: string; dir: "prev" | "next" }) {
  return (
    <Link to={`${BLOG_PATH}/${p.slug}`} className={cn("group flex flex-col gap-1 rounded-[18px] border border-brand-card-border bg-white p-4 transition-colors duration-150 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", dir === "next" && "sm:items-end sm:text-right")}>
      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-orange-text">
        {dir === "prev" && <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />}{label}{dir === "next" && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
      </span>
      <span className="font-semibold leading-snug">{p.title}</span>
    </Link>
  );
}

function RelatedProducts({ ids, t }: { ids: string[]; t: T }) {
  const { user } = useAuth();
  const { cards, isLoading } = useProductCards(ids, "blog-cards");
  const { isInWishlist, toggleWishlist } = useWishlist(user?.id);
  const quickAdd = useQuickAdd();
  const add = async (p: CardProduct) => { await quickAdd(p.id); };
  if (!isLoading && cards.length === 0) return null;
  return (
    <section aria-labelledby="blog-related" className="mx-auto mt-14 max-w-3xl">
      <h2 id="blog-related" className="text-[28px] font-bold tracking-[-0.03em]">{t("related")}</h2>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {isLoading ? Array.from({ length: Math.min(ids.length, 3) }, (_, i) => <ProductCardSkeleton key={i} />)
          : cards.map((p) => <ProductCard3D key={p.id} p={p} favorite={isInWishlist(p.id)} onFavorite={toggleWishlist} onAdd={add} />)}
      </div>
    </section>
  );
}

function Comments({ post, t, date }: { post: Post; t: T; date: (d: string | null) => string }) {
  const { user } = useAuth();
  const { data: settings } = useBlogSettings();
  const { data: comments = [] } = useBlogComments(post.id);
  const add = useAddBlogComment();
  const [body, setBody] = useState("");
  const open = (settings?.comments ?? true) && post.allow_comments;
  if (!open && comments.length === 0) return null;
  const visible = comments.filter((c) => !c.pending).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 2) { toast.error(t("err_invalid")); return; }
    try {
      const r = await add.mutateAsync({ postId: post.id, body });
      setBody("");
      toast.success(r.status === "pending" ? t("comment_sent_pending") : t("comment_sent"));
    } catch (x) {
      toast.error(t(`err_${blogErrorOf((x as Error)?.message)}`));
    }
  };

  return (
    <section aria-labelledby="blog-comments" className="mt-12 border-t border-brand-card-border pt-8">
      <h2 id="blog-comments" className="flex items-center gap-2 text-[24px] font-bold tracking-[-0.02em]">
        <MessageSquare className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden="true" />
        {visible === 1 ? t("comments_one") : visible ? t("comments_n", { n: visible }) : t("comments")}
      </h2>
      {comments.length === 0 ? <p className="mt-3 text-brand-ink-soft">{t("comments_empty")}</p> : (
        <ul className="mt-5 space-y-4">
          {comments.map((c) => (
            <li key={c.id} className={cn("rounded-[18px] border border-brand-card-border bg-white p-4", c.pending && "border-dashed")}>
              <p className="flex flex-wrap items-center gap-2 text-[14px]">
                <span className="font-semibold">{c.author_name || t("comment_anon")}</span>
                <span className="text-brand-ink-soft">{date(c.created_at)}</span>
                {c.pending && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[12px] font-semibold text-amber-800">{t("comment_pending")}</span>}
              </p>
              <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed">{c.body}</p>
              {c.admin_reply && (
                <div className="mt-3 rounded-[14px] bg-brand-alt p-3 text-[14px]">
                  <p className="text-[12px] font-semibold text-brand-orange-text">{t("store_reply")}</p>
                  <p className="whitespace-pre-line">{c.admin_reply}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!open ? <p className="mt-5 text-[14px] text-brand-ink-soft">{t("comments_closed")}</p> : !user ? (
        <p className="mt-6 flex flex-wrap items-center gap-3 rounded-[18px] bg-brand-alt p-4 text-[15px]">
          {t("comment_login")}
          <Link to={`/auth?redirect=${encodeURIComponent(`${BLOG_PATH}/${post.slug}`)}`} className="font-semibold text-brand-orange-text hover:underline">{t("comment_login_btn")}</Link>
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-3">
          <label htmlFor="blog-comment" className="text-[15px] font-semibold">{t("comment_label")}</label>
          <Textarea id="blog-comment" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("comment_ph")} className="rounded-[14px] bg-white text-[16px] md:text-[15px]" />
          <div className="flex justify-end">
            <button type="submit" disabled={add.isPending}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {add.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("comment_send")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
