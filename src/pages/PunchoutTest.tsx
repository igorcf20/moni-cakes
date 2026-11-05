// /punchout/teste: fim de uma sessão PunchOut de teste (aberta em Admin > PunchOut > Testar). Mostra os itens com os
// preços da empresa calculados no servidor e a mensagem que o sistema de compras receberia (cXML ou campos OCI).
// Nada é enviado nem gravado como pedido. Os dados vêm só do estado da navegação (nada fica guardado no aparelho).
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet";
import { motion } from "framer-motion";
import { Check, CheckCircle2, Copy, FlaskConical } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useStoreName } from "@/hooks/useBrand";
import type { PunchoutReturn } from "@/hooks/usePunchout";
import { useMessages } from "@/i18n";
import { punchoutMessages } from "@/i18n/punchout";

export default function PunchoutTest() {
  const { t, locale } = useMessages(punchoutMessages);
  const storeName = useStoreName();
  const state = useLocation().state as { result?: PunchoutReturn; buyer?: string } | null;
  const result = state?.result ?? null;
  const [copied, setCopied] = useState(false);
  const summary = result?.summary ?? null;
  const money = (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency: summary?.currency || "BRL" }).format(v);
  const preview = result?.preview == null ? "" : typeof result.preview === "string"
    ? result.preview : Object.entries(result.preview).map(([k, v]) => `${k} = ${v}`).join("\n");
  const copy = async () => {
    try { await navigator.clipboard.writeText(preview); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* sem área de transferência */ }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Helmet>
        <title>{`${t("test_title")} | ${storeName}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header />
      <main className="shell flex-1 py-10 md:py-14">
        {!result || !summary ? (
          <section className="mx-auto max-w-lg rounded-[24px] border border-brand-card-border bg-white p-8 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-orange-soft text-brand-orange-text"><FlaskConical className="h-8 w-8" strokeWidth={1.7} aria-hidden="true" /></span>
            <p className="mt-5 text-[16px] text-brand-ink-soft">{t("test_none")}</p>
            <Link to="/admin?tab=punchout" className="mt-6 inline-block text-[15px] font-semibold text-brand-orange-text hover:underline">{t("test_admin")}</Link>
          </section>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="mx-auto max-w-4xl space-y-6">
            <header className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em] sm:text-[36px]">{t("test_title")}</h1>
                <p className="mt-2 text-[16px] text-brand-ink-soft">{t("test_lead", { buyer: state?.buyer ?? "" })}</p>
              </div>
            </header>

            <section className="overflow-hidden rounded-[20px] border border-brand-card-border bg-white" aria-labelledby="po-test-items">
              <h2 id="po-test-items" className="border-b border-brand-card-border px-5 py-4 text-[18px] font-semibold">{t("test_items")}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[15px]">
                  <thead className="bg-brand-alt text-[13px] text-brand-ink-soft">
                    <tr>
                      <th scope="col" className="px-5 py-2.5 font-medium">{t("test_items")}</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">{t("test_sku")}</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("test_qty")}</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("test_unit")}</th>
                      <th scope="col" className="px-5 py-2.5 text-right font-medium">{t("test_line")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.lines.map((l, i) => (
                      <tr key={i} className="border-t border-brand-card-border">
                        <td className="px-5 py-3 font-medium">{l.name}</td>
                        <td className="px-3 py-3 font-mono text-[13px] text-brand-ink-soft">{l.sku}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{l.quantity}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(l.unit)}</td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums">{money(l.unit * l.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="space-y-2 border-t border-brand-card-border px-5 py-4 text-[15px]">
                <div className="flex justify-between"><dt className="text-brand-ink-soft">{t("test_subtotal")}</dt><dd className="tabular-nums">{money(summary.subtotal)}</dd></div>
                {summary.tax > 0 && <div className="flex justify-between"><dt className="text-brand-ink-soft">{t("test_tax")}</dt><dd className="tabular-nums">{money(summary.tax)}</dd></div>}
                <div className="flex justify-between text-[18px] font-bold"><dt>{t("test_total")}</dt><dd className="tabular-nums">{money(summary.total)}</dd></div>
              </dl>
            </section>

            <section className="rounded-[20px] border border-brand-card-border bg-white" aria-labelledby="po-test-msg">
              <div className="flex items-center justify-between gap-3 border-b border-brand-card-border px-5 py-3">
                <h2 id="po-test-msg" className="text-[16px] font-semibold">{result.protocol === "oci" ? t("test_oci") : t("test_cxml")}</h2>
                <button type="button" onClick={() => void copy()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-brand-orange-soft">
                  {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? t("test_copied") : t("test_copy")}
                </button>
              </div>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all bg-brand-alt/60 px-5 py-4 font-mono text-[12.5px] leading-relaxed">{preview}</pre>
            </section>

            <Link to="/admin?tab=punchout" className="inline-flex min-h-12 items-center rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover">{t("test_admin")}</Link>
          </motion.div>
        )}
      </main>
      <Footer />
    </div>
  );
}
