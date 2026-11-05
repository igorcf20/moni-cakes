// /newsletter/cancelar?t=<chave>: página do link "cancelar inscrição" dos e-mails da newsletter. Mostra o e-mail
// mascarado e pede confirmação (um clique). Funciona sem conta e com o recurso desligado (direito do inscrito).
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { CheckCircle2, Loader2, MailX, TriangleAlert } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useStoreName } from "@/hooks/useBrand";
import { useUnsubscribe } from "@/hooks/useNewsletter";
import { useMessages } from "@/i18n";
import { newsletterMessages } from "@/i18n/newsletter";
import { newsletterErrorOf } from "@/lib/newsletter";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function NewsletterUnsubscribe() {
  const { t } = useMessages(newsletterMessages);
  const storeName = useStoreName();
  const [params] = useSearchParams();
  const raw = params.get("t") ?? "";
  const token = UUID_RE.test(raw) ? raw : null;
  const { peek, confirm } = useUnsubscribe(token);
  const data = confirm.data ?? peek.data;
  const invalid = !token || (peek.isError && newsletterErrorOf((peek.error as Error)?.message) === "not_found");

  let icon = <MailX className="h-8 w-8" strokeWidth={1.7} aria-hidden="true" />;
  let title = t("title");
  let body: React.ReactNode = null;
  if (invalid) {
    icon = <TriangleAlert className="h-8 w-8" strokeWidth={1.7} aria-hidden="true" />;
    title = t("invalid_title");
    body = <p>{t("invalid")}</p>;
  } else if (peek.isLoading) {
    body = <p className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>;
  } else if (peek.isError) {
    body = <p className="text-destructive">{t("error")}</p>;
  } else if (data && (confirm.isSuccess || !data.was_subscribed)) {
    icon = <CheckCircle2 className="h-8 w-8" strokeWidth={1.7} aria-hidden="true" />;
    title = t("done_title");
    body = <p>{confirm.isSuccess ? t("done", { email: data.email }) : t("already", { email: data.email })}</p>;
  } else if (data) {
    body = (
      <>
        <p>{t("ask", { email: data.email })}</p>
        {confirm.isError && <p className="mt-3 text-destructive" role="alert">{t("error")}</p>}
        <button type="button" onClick={() => confirm.mutate()} disabled={confirm.isPending}
          className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
          {confirm.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {confirm.isPending ? t("working") : t("confirm")}
        </button>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Helmet>
        <title>{`${title} | ${storeName}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header />
      <main className="shell flex flex-1 items-center justify-center py-16">
        <section className="w-full max-w-lg rounded-[24px] border border-brand-card-border bg-white p-8 text-center sm:p-10">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-orange-soft text-brand-orange-text">{icon}</span>
          <h1 className="mt-5 text-[30px] font-bold leading-tight tracking-[-0.03em]">{title}</h1>
          <div className="mt-3 text-[16px] leading-relaxed text-brand-ink-soft">{body}</div>
          <Link to="/" className="mt-6 inline-block text-[15px] font-semibold text-brand-orange-text hover:underline">{t("back")}</Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
