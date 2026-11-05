// /pedido-de-orcamento: pedido de orçamento B2B (recurso quotes). Itens vindos do produto (?produto=<id>&qtd=&cor=
// <variation_id>&tam=<tamanho>), do carrinho (?carrinho=1) ou da busca na própria página; quantidade, cor, tamanho,
// preço desejado e observação por item; dados da empresa. Envia por request_quote; a resposta aparece na conta, aba
// Orçamentos. Exige conta.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, FileText, Loader2, Package, Search, ShoppingCart, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ListingShell } from "@/components/catalog/CatalogLayout";
import { btnPrimary, btnSecondary, cardCls, Field, ItemThumb, inputCls } from "@/components/dashboard/ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useStoreName } from "@/hooks/useBrand";
import { useQuoteMoney, useQuoteSettings, useRequestQuote } from "@/hooks/useQuotes";
import { useMessages } from "@/i18n";
import { quotesMessages } from "@/i18n/quotes";
import { useCountry } from "@/lib/countries";
import { QUOTE_PATH, quoteDraftErrors, quoteErrorOf, quotePayloadItems, type QuoteDraftItem } from "@/lib/quotes";
import { cn } from "@/lib/utils";

const sb = supabase as any;
type Option = { id: string; name: string };
type ProductOptions = { variations: Option[]; sizes: string[] };
const selectCls = "h-12 w-full rounded-[14px] border border-border bg-white px-3 text-[16px] md:text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
let keySeq = 0;
const newKey = () => `q${++keySeq}`;

async function loadProduct(id: string) {
  const [{ data: p }, { data: v }, { data: s }] = await Promise.all([
    sb.from("products").select("id, name, image, price, is_active").eq("id", id).maybeSingle(),
    sb.from("product_variations").select("id, name").eq("product_id", id).order("name"),
    sb.from("product_sizes").select("size_label").eq("product_id", id),
  ]);
  if (!p || p.is_active === false) return null;
  return { product: p, options: { variations: (v ?? []) as Option[], sizes: [...new Set(((s ?? []) as any[]).map((x) => String(x.size_label)))] } };
}

export default function QuoteRequest() {
  const { t } = useMessages(quotesMessages);
  const store = useStoreName();
  const { user } = useAuth();
  const steps = [
    { Icon: Package, title: t("s1"), text: t("s1_d") },
    { Icon: FileText, title: t("s2"), text: t("s2_d") },
    { Icon: ShoppingCart, title: t("s3"), text: t("s3_d") },
  ];
  const [sent, setSent] = useState(false);
  const redirect = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : QUOTE_PATH;

  return (
    <ListingShell>
      <Helmet><title>{`${t("title")} | ${store}`}</title></Helmet>
      <section className="mx-auto max-w-3xl text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text">{t("eyebrow")}</p>
        <h1 className="mt-2 text-[38px] font-[780] leading-[1.04] tracking-[-0.04em] sm:text-[52px]">{t("title")}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-[17px] leading-relaxed text-brand-ink-soft">{t("lead")}</p>
      </section>

      <ol className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-3">
        {steps.map(({ Icon, title, text }, i) => (
          <li key={i} className={cn(cardCls, "p-5")}>
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-brand-orange-soft text-primary"><Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
            <p className="mt-3 text-[13px] font-semibold text-brand-orange-text">{i + 1}</p>
            <p className="font-bold">{title}</p>
            <p className="mt-1 text-[14px] text-brand-ink-soft">{text}</p>
          </li>
        ))}
      </ol>

      <div className="mx-auto mt-8 max-w-3xl">
        {!user ? (
          <Notice Icon={ClipboardList} title={t("login")} text={t("login_d")}>
            <Link to={`/auth?redirect=${encodeURIComponent(redirect)}`} className={btnPrimary}>{t("login_btn")}</Link>
          </Notice>
        ) : sent ? (
          <Notice Icon={CheckCircle2} title={t("sent_title")} text={t("sent_d")}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link to="/dashboard?tab=orcamentos" className={btnPrimary}>{t("open_quotes")}</Link>
              <button type="button" className={btnSecondary} onClick={() => setSent(false)}>{t("new_request")}</button>
            </div>
          </Notice>
        ) : (
          <RequestForm userId={user.id} onSent={() => setSent(true)} />
        )}
      </div>
    </ListingShell>
  );
}

function Notice({ Icon, title, text, children }: { Icon: typeof ClipboardList; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className={cn(cardCls, "flex flex-col items-center gap-3 p-6 text-center")}>
      <Icon className="h-8 w-8 text-brand-orange-text" strokeWidth={1.7} aria-hidden="true" />
      <p className="text-[20px] font-bold tracking-[-0.02em]">{title}</p>
      <p className="max-w-md text-[15px] text-brand-ink-soft">{text}</p>
      {children}
    </div>
  );
}

function RequestForm({ userId, onSent }: { userId: string; onSent: () => void }) {
  const { t } = useMessages(quotesMessages);
  const money = useQuoteMoney();
  const country = useCountry();
  const [params] = useSearchParams();
  const { data: settings } = useQuoteSettings();
  const { cartItems } = useCart(userId);
  const request = useRequestQuote();
  const [items, setItems] = useState<QuoteDraftItem[]>([]);
  const [options, setOptions] = useState<Record<string, ProductOptions>>({});
  const [f, setF] = useState({ company: "", contact: "", phone: "", tax_id: "", message: "" });
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seeded = useRef(false);
  const minQ = settings?.min_quantity ?? 1;

  // Dados do perfil para começar.
  useEffect(() => {
    let off = false;
    void sb.from("user_profiles").select("full_name, phone, tax_id").eq("user_id", userId).maybeSingle().then(({ data }: any) => {
      if (off || !data) return;
      setF((p) => ({ ...p, contact: p.contact || data.full_name || "", phone: p.phone || data.phone || "", tax_id: p.tax_id || data.tax_id || "" }));
    });
    return () => { off = true; };
  }, [userId]);

  const add = async (productId: string, init: Partial<QuoteDraftItem> = {}) => {
    const loaded = await loadProduct(productId);
    if (!loaded) return;
    setOptions((o) => ({ ...o, [productId]: loaded.options }));
    const variation = init.variation_id ? loaded.options.variations.find((v) => v.id === init.variation_id) : null;
    setItems((list) => [...list, {
      key: newKey(), product_id: loaded.product.id, name: loaded.product.name, image: loaded.product.image ?? null,
      list_price: Number(loaded.product.price) || 0, variation_id: variation?.id ?? null, variation_name: variation?.name ?? null,
      size_label: init.size_label && loaded.options.sizes.includes(init.size_label) ? init.size_label : null,
      quantity: init.quantity && init.quantity > 0 ? Math.min(100000, Math.round(init.quantity)) : Math.max(1, minQ),
      target_price: "", note: "",
    }]);
  };

  // Itens iniciais: do produto ou do carrinho (uma vez).
  useEffect(() => {
    if (seeded.current) return;
    const pid = params.get("produto");
    if (pid) {
      seeded.current = true;
      void add(pid, { quantity: Number(params.get("qtd")) || undefined, variation_id: params.get("cor"), size_label: params.get("tam") });
    } else if (params.get("carrinho") && cartItems.length) {
      seeded.current = true;
      void (async () => {
        for (const c of cartItems as any[]) {
          if (c.design_data?.customization || c.design_data?.quote) continue;
          await add(String(c.product_id), { quantity: Number(c.quantity), variation_id: c.variation_id ?? null, size_label: c.size_label ?? null });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, cartItems.length]);

  const errs = quoteDraftErrors({ contact: f.contact, items }, minQ);
  const units = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const patch = (key: string, p: Partial<QuoteDraftItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    setErr(null);
    if (errs.length) return;
    try {
      await request.mutateAsync({ items: quotePayloadItems(items), company: f.company, contact: f.contact, phone: f.phone, tax_id: f.tax_id, country: country.code, message: f.message });
      setItems([]);
      setTried(false);
      onSent();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (x) {
      const code = quoteErrorOf((x as Error).message);
      setErr(t(`err_${code}`, { n: minQ }));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
      <section className={cn(cardCls, "space-y-4 p-5 sm:p-6")} aria-labelledby="qr-items">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="qr-items" className="text-[22px] font-bold tracking-[-0.02em]">{t("items_title")}</h2>
          <p className="text-[14px] text-brand-ink-soft">{t("units_total", { n: units })}{minQ > 1 ? ` · ${t("min_note", { n: minQ })}` : ""}</p>
        </div>
        {items.length === 0 ? (
          <p className="rounded-[14px] border border-dashed p-5 text-center text-[14px] text-brand-ink-soft">{t("items_empty")}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => {
              const opt = options[i.product_id] ?? { variations: [], sizes: [] };
              return (
                <li key={i.key} className="rounded-[16px] border border-brand-card-border p-4">
                  <div className="flex items-start gap-3">
                    <ItemThumb src={i.image} alt="" Icon={Package} className="h-16 w-16" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{i.name}</p>
                      <p className="text-[13px] text-brand-ink-soft">{t("list_price", { v: money(i.list_price) })}</p>
                    </div>
                    <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] text-brand-ink-soft transition-colors duration-150 hover:bg-brand-alt hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t("remove", { name: i.name })}>
                      <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label={t("qty")} htmlFor={`qr-q-${i.key}`} required>
                      <Input id={`qr-q-${i.key}`} inputMode="numeric" value={String(i.quantity || "")} className={inputCls}
                        onChange={(e) => patch(i.key, { quantity: Number(e.target.value.replace(/\D/g, "").slice(0, 6)) || 0 })} />
                    </Field>
                    <Field label={t("target")} htmlFor={`qr-t-${i.key}`} hint={t("optional")}>
                      <Input id={`qr-t-${i.key}`} inputMode="decimal" value={i.target_price} className={inputCls}
                        onChange={(e) => patch(i.key, { target_price: e.target.value.replace(/[^\d.,]/g, "").slice(0, 12) })} />
                    </Field>
                    {opt.variations.length > 0 && (
                      <Field label={t("color")} htmlFor={`qr-c-${i.key}`}>
                        <select id={`qr-c-${i.key}`} className={selectCls} value={i.variation_id ?? ""}
                          onChange={(e) => { const v = opt.variations.find((x) => x.id === e.target.value); patch(i.key, { variation_id: v?.id ?? null, variation_name: v?.name ?? null }); }}>
                          <option value="">{t("any")}</option>
                          {opt.variations.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </Field>
                    )}
                    {opt.sizes.length > 0 && (
                      <Field label={t("size")} htmlFor={`qr-s-${i.key}`}>
                        <select id={`qr-s-${i.key}`} className={selectCls} value={i.size_label ?? ""} onChange={(e) => patch(i.key, { size_label: e.target.value || null })}>
                          <option value="">{t("any")}</option>
                          {opt.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </Field>
                    )}
                    <div className="sm:col-span-2">
                      <Field label={t("item_note")} htmlFor={`qr-n-${i.key}`} hint={t("optional")}>
                        <Input id={`qr-n-${i.key}`} value={i.note} maxLength={500} className={inputCls} placeholder={t("item_note_ph")} onChange={(e) => patch(i.key, { note: e.target.value })} />
                      </Field>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <ProductSearch onPick={(id) => void add(id)} />
        {tried && errs.includes("items") && <p role="alert" className="text-[13px] text-destructive">{t("err_items")}</p>}
        {tried && errs.includes("quantity") && <p role="alert" className="text-[13px] text-destructive">{t("err_quantity")}</p>}
        {tried && errs.includes("target") && <p role="alert" className="text-[13px] text-destructive">{t("err_target")}</p>}
        {tried && errs.includes("min_quantity") && <p role="alert" className="text-[13px] text-destructive">{t("err_min_quantity", { n: minQ })}</p>}
      </section>

      <section className={cn(cardCls, "space-y-4 p-5 sm:p-6")} aria-labelledby="qr-contact">
        <h2 id="qr-contact" className="text-[22px] font-bold tracking-[-0.02em]">{t("contact_title")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("f_company")} htmlFor="qr-company" hint={t("optional")}><Input id="qr-company" value={f.company} onChange={set("company")} maxLength={160} className={inputCls} autoComplete="organization" /></Field>
          <Field label={t("f_contact")} htmlFor="qr-contact-name" required error={tried && errs.includes("contact") ? t("err_contact") : undefined}>
            <Input id="qr-contact-name" value={f.contact} onChange={set("contact")} maxLength={120} className={inputCls} autoComplete="name" />
          </Field>
          <Field label={t("f_phone")} htmlFor="qr-phone" hint={t("optional")}><Input id="qr-phone" type="tel" value={f.phone} onChange={set("phone")} maxLength={40} className={inputCls} autoComplete="tel" /></Field>
          <Field label={t("f_tax")} htmlFor="qr-tax" hint={t("optional")}><Input id="qr-tax" value={f.tax_id} onChange={set("tax_id")} maxLength={40} className={inputCls} /></Field>
        </div>
        <Field label={t("f_message")} htmlFor="qr-msg" hint={t("optional")}>
          <Textarea id="qr-msg" rows={4} value={f.message} onChange={set("message")} maxLength={3000} className="rounded-[14px] bg-white text-[16px] md:text-[15px]" placeholder={t("f_message_ph")} />
        </Field>
        {err && <p role="alert" className="rounded-[12px] bg-destructive/5 p-3 text-[14px] text-destructive">{err}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Link to="/" className={btnSecondary}>{t("cancel")}</Link>
          <button type="submit" className={btnPrimary} disabled={request.isPending}>{request.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("submit")}</button>
        </div>
      </section>
    </form>
  );
}

function ProductSearch({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useMessages(quotesMessages);
  const money = useQuoteMoney();
  const [q, setQ] = useState("");
  const term = q.trim();
  const { data = [], isFetching } = useQuery({
    queryKey: ["quote-product-search", term],
    enabled: term.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const safe = term.replace(/[%_,()]/g, " ");
      const { data } = await sb.from("products").select("id, name, image, price").eq("is_active", true).ilike("name", `%${safe}%`).order("name").limit(8);
      return (data ?? []) as { id: string; name: string; image: string | null; price: number }[];
    },
  });
  const results = useMemo(() => (term.length >= 2 ? data : []), [data, term]);
  return (
    <div className="space-y-2 border-t border-brand-card-border pt-4">
      <Field label={t("add_product")} htmlFor="qr-search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="qr-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search_ph")} className={cn(inputCls, "pl-10")} autoComplete="off" />
        </div>
      </Field>
      {term.length >= 2 && (
        isFetching && !results.length ? <p className="text-[13px] text-brand-ink-soft">{t("searching")}</p>
          : !results.length ? <p className="text-[13px] text-brand-ink-soft">{t("search_none")}</p>
          : (
            <ul className="divide-y rounded-[14px] border border-brand-card-border">
              {results.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => { onPick(p.id); setQ(""); }}
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-brand-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <ItemThumb src={p.image} alt="" Icon={Package} className="h-10 w-10" />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{p.name}</span>
                    <span className="text-[14px] tabular-nums text-brand-ink-soft">{money(Number(p.price) || 0)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
      )}
    </div>
  );
}
