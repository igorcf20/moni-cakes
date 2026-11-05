// Confirmação do pedido PRINT3D (/pedido/:orderId/sucesso). A lógica é a mesma de antes: lê o pedido, verifica o
// pagamento Viva ao voltar do gateway, envia os arquivos da personalização guardados neste aparelho
// (register-order-design, confirm-order-design, verify-order-files) e mostra as instruções de pagamento.
// Só mudam os textos (i18n em src/i18n/checkout.ts) e o visual. Sem dados de pagamento inventados: um campo que a
// loja não configurou não aparece.
import { checkoutFieldsMessages } from "@/i18n/checkoutFields";
import { giftCardsMessages } from "@/i18n/giftCards";
import { rewardPointsMessages } from "@/i18n/rewardPoints";
import { giftCodeTail } from "@/lib/giftCards";
import { STORE_DEFAULTS } from "@/config/store";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, MotionConfig } from "framer-motion";
import { Helmet } from "react-helmet";
import { toast } from "sonner";
import {
  AlertCircle, ArrowRight, Box, Check, CheckCircle2, Clock, Copy, CreditCard, Landmark, Loader2, MapPin, PackageSearch,
  ChefHat, QrCode, RefreshCw, ShoppingBag, Smartphone, Store, Truck, UploadCloud, Wallet, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { LayerArt } from "@/components/MediaImage";
import PaymentProofUploader from "@/components/PaymentProofUploader";
import VivaCardEmbed from "@/components/checkout/VivaCardEmbed";
import { useCurrency } from "@/hooks/use-currency";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useMessages, type Locale } from "@/i18n";
import { checkoutMessages } from "@/i18n/checkout";
import { addressCountryCode } from "@/lib/addressFormats";
import { countryName, useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { isOnlineGateway, localized } from "@/lib/paymentMethods";
import { formatPrice } from "@/utils/currency";
import { getPending, delPending } from "@/utils/pendingDesigns";

interface OrderData {
  id: string;
  total: number;
  status: string;
  shipping_address: any;
  shipping_cost: number;
  coupon_code?: string;
  discount_amount?: number;
  payment_discount?: number | null;
  subtotal_net?: number | null;
  vat_total?: number | null;
  notes?: string | null;
  delivery_method_id?: string | null;
  payment_method: string;
  created_at: string;
  guest_email?: string | null;
  payment_proof_url?: string | null;
  payment_status?: string | null;
  order_items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    price: number;
    design_data?: any;
    products?: {
      name: string;
      image: string;
    };
  }>;
}

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const btnPrimary = cn(
  "group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98]",
  focusRing,
);
const btnSecondary = cn(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-6 text-[15px] font-semibold text-foreground transition-colors duration-150 hover:border-primary hover:text-brand-orange-text",
  focusRing,
);
const card = "rounded-[20px] border border-brand-card-border bg-white shadow-[var(--shadow-card)]";

/** Linhas de um endereço gravado no pedido (mesmos campos em todos os países). */
function addressLines(a: any, locale: Locale, fallbackCountry: string): string[] {
  if (!a) return [];
  const l1 = [a.street, a.number].filter(Boolean).join(", ") + (a.complement ? ` - ${a.complement}` : "");
  const l2 = [[a.parish, a.city].filter(Boolean).join(", "), a.district || a.state].filter(Boolean).join(" - ");
  const code = addressCountryCode(a.country_code ?? a.country, fallbackCountry);
  const l3 = [a.postal_code || a.zip_code, countryName(code, locale)].filter(Boolean).join(" · ");
  return [l1, l2, l3].filter((s) => s.trim());
}

function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{title}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </MotionConfig>
  );
}

const OrderSuccess = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, locale } = useMessages(checkoutMessages);
  const { t: tcf } = useMessages(checkoutFieldsMessages);
  const { t: tg } = useMessages(giftCardsMessages);
  const { t: tp } = useMessages(rewardPointsMessages);
  // Os efeitos abaixo usam sempre os textos do idioma atual sem voltar a correr quando o idioma muda.
  const tRef = useRef(t);
  tRef.current = t;
  const country = useCountry();
  const { data: storeInfo } = useStoreInfo();
  const storeName = storeInfo?.name || STORE_DEFAULTS.name;
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentConfig, setPaymentConfig] = useState<any>(null);
  const [uploadState, setUploadState] = useState<"checking" | "uploading" | "ok" | "failed">("checking");
  /**
   * Cart-item keys whose blobs are NOT present locally on this device.
   * Happens when the customer paid on a different device/browser than where
   * they configured the design, closed the tab mid-upload, or cleared IDB.
   * We register a server-side placeholder so the admin sees the item as
   * pending (`upload_complete=false`), and we surface a warning here.
   */
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [uploadBytes, setUploadBytes] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [uploadAttempt, setUploadAttempt] = useState(0);
  const attachedRef = useRef<string | null>(null);
  const notifiedOrderRef = useRef<string | null>(null);
  const { currentCurrency, convert } = useCurrency();
  const money = (n: number) => formatPrice(convert(n), currentCurrency);

  // Prazo e tipo do método de entrega do pedido (só para mostrar os próximos passos).
  const { data: deliveryMethod } = useQuery({
    queryKey: ["order-delivery-method", order?.delivery_method_id],
    enabled: !!order?.delivery_method_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_methods" as any)
        .select("type, name, config")
        .eq("id", order!.delivery_method_id!)
        .maybeSingle();
      return (data as unknown as { type: string; name: string; config: Record<string, any> } | null) ?? null;
    },
  });

  // Upload one file with bounded retries + backoff. On mobile networks a
  // single dropped PUT used to silently mark the whole pipeline as failed,
  // leaving "registo órfão" rows behind. Now we retry each PUT up to 5x, and
  // when the browser reports itself offline we wait for `online` before
  // counting the tentative as a real failure.
  const waitForOnline = () =>
    new Promise<void>((resolve) => {
      if (typeof navigator === "undefined" || navigator.onLine !== false) {
        resolve();
        return;
      }
      const onOnline = () => { window.removeEventListener("online", onOnline); resolve(); };
      window.addEventListener("online", onOnline);
      // Safety net so we don't hang forever if `online` never fires.
      setTimeout(() => { window.removeEventListener("online", onOnline); resolve(); }, 60_000);
    });
  const putWithRetry = async (
    url: string,
    contentType: string,
    body: Blob,
    attempts = 5,
  ): Promise<Response> => {
    let lastErr: any = null;
    const backoff = [1000, 3000, 7000, 15000, 30000];
    for (let i = 0; i < attempts; i++) {
      await waitForOnline();
      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 90_000);
        let res: Response;
        try {
          res = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": contentType, "x-upsert": "true" },
            body,
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timeoutId);
        }
        if (res.ok) return res;
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (e) {
        lastErr = e;
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, backoff[i] || 3000));
      }
    }
    throw lastErr || new Error("upload failed");
  };

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) return;

      try {
        const { data, error } = await supabase
          .from("orders")
          .select(`
            *,
            order_items (
              id,
              product_id,
              quantity,
              price,
              design_data,
              products:product_id (
                name,
                image
              )
            )
          `)
          .eq("id", orderId)
          .maybeSingle();

        if (error || !data) {
          console.error("Error fetching order:", error);
          toast.error(tRef.current("okLoadError"));
          navigate("/");
          return;
        }

        setOrder(data as OrderData);

        // Fetch payment config via security-definer RPC (table is admin-only)
        const { data: methods } = await supabase.rpc("get_active_payment_methods" as any);
        const config = (methods as any[] | null)?.find((m) => m.type === data.payment_method);
        if (config) setPaymentConfig(config);
      } catch (err) {
        console.error("Error:", err);
        toast.error(tRef.current("okLoadError"));
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, navigate]);

  // Auto-verify Viva Wallet payment when the user returns from the gateway.
  useEffect(() => {
    if (!order) return;
    if (order.payment_method !== "viva") return;
    if (uploadState !== "ok") return;
    if ((order as any).payment_status === "paid") return;
    let cancelled = false;
    let tries = 0;
    const params = new URLSearchParams(location.search);
    const transactionId = params.get("t") || undefined;
    const orderCode = params.get("s") || undefined;
    const poll = async () => {
      if (cancelled) return;
      try {
        const { data } = await supabase.functions.invoke("viva-verify-payment", {
          body: { orderId: order.id, transactionId, orderCode },
        });
        if (data?.status === "paid") {
          setOrder((o) => o ? ({ ...o, status: "paid", payment_status: "paid" }) : o);
          toast.success(tRef.current("okPaidToast"));
          return;
        }
      } catch (e) { console.error(e); }
      tries += 1;
      if (tries < 8) setTimeout(poll, 3000);
    };
    poll();
    return () => { cancelled = true; };
  }, [order?.id, location.search, uploadState]);

  // Upload pending configurator-rendered files via the register-order-design
  // edge function. The function returns signed upload URLs (per layout, preview
  // and each original) and writes the order_designs row with the service role,
  // and uses the server-side service role so clients never need write access
  // to order_designs.
  useEffect(() => {
    if (!order) return;
    // Guard against React Strict Mode double-mount and re-renders from
    // unrelated state (e.g. Viva polling) re-triggering the upload pipeline.
    const guardKey = `${order.id}:${uploadAttempt}`;
    if (attachedRef.current === guardKey) return;
    attachedRef.current = guardKey;
    setUploadState("checking");
    let cancelled = false;
    (async () => {
      let anyFailed = false;
      const designKeys = Array.from(new Set((order.order_items || [])
        .map((item) => item.design_data?.cartItemKey)
        .filter((key): key is string => typeof key === "string" && key.length > 0)));
      if (designKeys.length === 0) {
        if (!cancelled) setUploadState("ok");
        return;
      }

      // Reopening the confirmation page on the same or another device must
      // first check server state. Completed files may no longer exist in IDB.
      try {
        const { data: remoteState, error: remoteError } = await supabase.functions.invoke("verify-order-files", {
          body: { order_id: order.id },
        });
        if (remoteError) throw remoteError;
        if ((remoteState as { ok?: boolean } | null)?.ok) {
          if (notifiedOrderRef.current !== order.id) {
            try {
              const { notifyOrderCreated } = await import("@/lib/notifyOrderEmail");
              await notifyOrderCreated(order.id);
              notifiedOrderRef.current = order.id;
            } catch (emailError) {
              console.error("order email notification failed", emailError);
            }
          }
          if (!cancelled) setUploadState("ok");
          return;
        }
      } catch (e) {
        console.error("verify existing design files failed", e);
      }

      // Keep local blobs for recovery, but never treat missing blobs as success.
      const keyChecks = await Promise.all(designKeys.map(async (key) => ({
        key,
        present: !!(await getPending(key)),
      })));
      const presentKeys = keyChecks.filter((k) => k.present).map((k) => k.key);
      const absentKeys = keyChecks.filter((k) => !k.present).map((k) => k.key);
      // Register placeholder rows for keys with no local blobs. Best-effort.
      // upsert with ignoreDuplicates means existing rows are left untouched.
      if (absentKeys.length > 0) {
        const placeholderResults = await Promise.all(absentKeys.map(async (key) => {
          try {
            const { error } = await supabase.functions.invoke("register-order-design", {
              body: { order_id: order.id, cart_item_key: key, planos: [], missing: true },
            });
            return !error;
          } catch (e) {
            console.error("register placeholder failed", key, e);
            return false;
          }
        }));
        if (placeholderResults.some((ok) => !ok)) anyFailed = true;
        if (!cancelled) setMissingKeys(absentKeys);
      }
      if (presentKeys.length === 0) {
        if (!cancelled) setUploadState("failed");
        return;
      }
      if (cancelled) return;
      setUploadState("uploading");
      setUploadProgress({ done: 0, total: 0 });
      // Step 1: register EVERY item's planos with the server FIRST, in parallel.
      // This guarantees every order_designs row exists (even if the user navigates
      // away or the network drops mid-upload). Heavy file uploads come next.
      type Prepared = {
        key: string;
        pending: Awaited<ReturnType<typeof getPending>>;
        data: any;
      };
      const prepared: Prepared[] = [];
      await Promise.all(presentKeys.map(async (key) => {
        const pending = await getPending(key);
        if (!pending) { anyFailed = true; return; }
        try {
          const planosMeta = pending.planos.map((p) => ({
            plano_index: p.index,
            plano_name: p.name,
            width_px: p.widthPx || null,
            height_px: p.heightPx || null,
            dpi: p.dpi || null,
            layout_size: p.png.size,
            preview_size: p.preview.size,
            copies: Math.max(1, (p as any).copies || 1),
            pdf_size: (p as any).pdf ? (p as any).pdf.size : undefined,
            originals: (pending.originals || []).map((o) => ({
              name: o.name, type: o.type, size: o.size,
            })),
          }));
          const { data, error } = await supabase.functions.invoke("register-order-design", {
            body: {
              order_id: order.id,
              cart_item_key: key,
              planos: planosMeta,
              order_pdf: pending.orderPdf ? { size: pending.orderPdf.size } : undefined,
            },
          });
          if (error || !(data as any)?.ok) {
            console.error("register-order-design failed", error, data);
            anyFailed = true;
            return;
          }
          prepared.push({ key, pending, data });
        } catch (e) {
          console.error("register failed", e);
          anyFailed = true;
        }
      }));
      if (cancelled) return;
      if (prepared.length !== presentKeys.length) anyFailed = true;
      // Compute total task count for progress UI.
      let totalTasks = 0;
      for (const { pending, data } of prepared) {
        const out = (data as any).planos as Array<any>;
        const globalOrigs = ((data as any).originals || []) as Array<any>;
        const pdfSigned = (data as any).pdf;
        for (const p of pending.planos) {
          const entry = out.find((x) => x.plano_index === p.index);
          if (!entry) continue;
          totalTasks += 2; // png + preview
          if ((p as any).pdf && entry.pdf?.upload_url) totalTasks += 1;
        }
        totalTasks += globalOrigs.length;
        if (pdfSigned && pending.orderPdf) totalTasks += 1;
      }
      setUploadProgress({ done: 0, total: totalTasks });
      // Bytes total (much more accurate for a slow uplink pushing a 22MB PNG).
      const matchesOriginal = (manifest: any, original: any) =>
        manifest.name === original.name &&
        Number(manifest.size ?? 0) === Number(original.size ?? 0) &&
        String(manifest.type || "") === String(original.type || "");
      let bytesTotal = 0;
      for (const { pending, data } of prepared) {
        const out = (data as any).planos as Array<any>;
        const globalOrigs = ((data as any).originals || []) as Array<any>;
        const pdfSigned = (data as any).pdf;
        for (const p of pending.planos) {
          const entry = out.find((x) => x.plano_index === p.index);
          if (!entry) continue;
          bytesTotal += (p.png as Blob).size + (p.preview as Blob).size;
          if ((p as any).pdf && entry.pdf?.upload_url) bytesTotal += ((p as any).pdf as Blob).size;
        }
        for (const o of pending.originals || []) {
          if (globalOrigs.some((g: any) => matchesOriginal(g, o))) bytesTotal += o.blob.size;
        }
        if (pdfSigned && pending.orderPdf) bytesTotal += pending.orderPdf.size;
      }
      setUploadBytes({ done: 0, total: bytesTotal });
      setUploadStartedAt(Date.now());
      const bump = () => setUploadProgress((s) => ({ ...s, done: Math.min(s.total, s.done + 1) }));
      const addBytes = (n: number) =>
        setUploadBytes((s) => ({ ...s, done: Math.min(s.total, s.done + n) }));
      // Step 2: upload all files (across all items) in parallel.
      for (const { key, pending, data } of prepared) {
        try {
          const out = (data as any).planos as Array<any>;
          const globalOrigs = ((data as any).originals || []) as Array<{ name: string; path: string; type?: string; size?: number; upload_url: string; token: string }>;
          const pdfSigned = (data as any).pdf as { upload_url: string } | null;
          // Build the list of uploads, then run them with bounded concurrency
          // (2 on mobile, 4 on desktop) so a 22 MB PNG doesn't fight with
          // other PUTs over a single mobile uplink.
          type Task = { kind: string; size: number; run: () => Promise<Response> };
          const queue: Task[] = [];
          for (const p of pending.planos) {
            const entry = out.find((x) => x.plano_index === p.index);
            if (!entry) continue;
            queue.push({
              kind: `plano-${p.index}-png`,
              size: (p.png as Blob).size,
              run: () => putWithRetry(entry.layout.upload_url, "image/png", p.png),
            });
            queue.push({
              kind: `plano-${p.index}-preview`,
              size: (p.preview as Blob).size,
              run: () => putWithRetry(entry.preview.upload_url, "image/jpeg", p.preview),
            });
            const planoPdf = (p as any).pdf as Blob | undefined;
            if (planoPdf && entry.pdf?.upload_url) {
              queue.push({
                kind: `plano-${p.index}-pdf`,
                size: planoPdf.size,
                run: () => putWithRetry(entry.pdf.upload_url, "application/pdf", planoPdf),
              });
            }
          }
          for (const o of pending.originals || []) {
            const dest = globalOrigs.find((g) => matchesOriginal(g, o));
            if (!dest) continue;
            queue.push({
              kind: `orig-${o.name}`,
              size: o.blob.size,
              run: () => putWithRetry(dest.upload_url, o.type || "application/octet-stream", o.blob),
            });
          }
          if (pdfSigned && pending.orderPdf) {
            queue.push({
              kind: "order-pdf",
              size: pending.orderPdf.size,
              run: () => putWithRetry(pdfSigned.upload_url, "application/pdf", pending.orderPdf!),
            });
          }
          const isMobile =
            typeof window !== "undefined" &&
            (window.matchMedia?.("(max-width: 768px)").matches ||
              /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || ""));
          const concurrency = isMobile ? 2 : 4;
          const results: PromiseSettledResult<Response>[] = new Array(queue.length);
          let cursor = 0;
          const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
            while (cursor < queue.length) {
              const i = cursor++;
              try {
                const r = await queue[i].run();
                results[i] = { status: "fulfilled", value: r };
                addBytes(queue[i].size);
              } catch (e: any) {
                results[i] = { status: "rejected", reason: e };
              } finally {
                bump();
              }
            }
          });
          await Promise.all(workers);
          const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !(r.value as Response).ok));
          if (failed.length) {
            failed.forEach((f, i) => {
              if (f.status === "fulfilled") {
                const r = f.value as Response;
                console.error(`[upload] ${i} status=${r.status} url=${r.url}`);
              } else {
                console.error(`[upload] ${i} rejected`, (f as PromiseRejectedResult).reason);
              }
            });
          }
          if (failed.length) {
            console.error("upload errors", failed);
            anyFailed = true;
            // Keep the pending payload so the user can retry on reload.
            continue;
          }
          // Confirm with the server that all files actually landed in storage
          // before clearing the local pending payload. This prevents orphan
          // rows in order_designs pointing to non-existent storage objects.
          try {
            const { data: conf } = await supabase.functions.invoke("confirm-order-design", {
              body: { order_id: order.id, cart_item_key: key },
            });
            if (!(conf as any)?.ok) {
              console.warn("confirm-order-design not ok", conf);
              anyFailed = true;
            }
          } catch (cErr) {
            console.error("confirm-order-design failed", cErr);
            anyFailed = true;
          }
        } catch (e) {
          console.error("design attach failed", e);
          anyFailed = true;
        }
      }
      if (!anyFailed) {
        try {
          const { data: verified, error: verifyError } = await supabase.functions.invoke("verify-order-files", {
            body: { order_id: order.id },
          });
          if (verifyError || !(verified as { ok?: boolean } | null)?.ok) {
            console.error("verify-order-files did not confirm the complete order", verifyError, verified);
            anyFailed = true;
          } else {
            for (const key of designKeys) await delPending(key);
            if (notifiedOrderRef.current !== order.id) {
              try {
                const { notifyOrderCreated } = await import("@/lib/notifyOrderEmail");
                await notifyOrderCreated(order.id);
                notifiedOrderRef.current = order.id;
              } catch (emailError) {
                console.error("order email notification failed", emailError);
              }
            }
          }
        } catch (verifyError) {
          console.error("verify-order-files failed", verifyError);
          anyFailed = true;
        }
      }
      if (!cancelled) setUploadState(anyFailed ? "failed" : "ok");
    })();
    return () => {
      cancelled = true;
      if (attachedRef.current === guardKey) attachedRef.current = null;
    };
  }, [order?.id, uploadAttempt]);

  // Warn the user if they try to close/navigate away while files are uploading.
  useEffect(() => {
    if (uploadState !== "uploading" && uploadState !== "checking") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploadState]);

  // Mobile browsers may suspend requests while backgrounded. Resume on the
  // same device automatically when connectivity returns instead of requiring
  // checkout or file selection to be repeated.
  useEffect(() => {
    if (uploadState !== "failed") return;
    const resumeWhenOnline = () => {
      if (!navigator.onLine) return;
      attachedRef.current = null;
      setUploadAttempt((attempt) => attempt + 1);
    };
    window.addEventListener("online", resumeWhenOnline);
    return () => window.removeEventListener("online", resumeWhenOnline);
  }, [uploadState]);

  // Live tick so the elapsed/ETA labels refresh even when no upload finishes.
  useEffect(() => {
    if (uploadState !== "uploading") return;
    const id = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [uploadState]);

  // Block internal navigation while uploading: asks for explicit confirmation
  // before letting the customer leave and lose the pending blobs.
  useEffect(() => {
    if (uploadState !== "uploading" && uploadState !== "checking") return;
    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      // Ignore modifier-clicks / new-tab / downloads.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (anchor.target && anchor.target !== "" && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#")) return;
      const confirmed = window.confirm(tRef.current("upLeave"));
      if (!confirmed) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", clickHandler, true);
    return () => document.removeEventListener("click", clickHandler, true);
  }, [uploadState]);

  const copyOrderId = () => {
    if (order) {
      void navigator.clipboard?.writeText(order.id);
      toast.success(t("okCopied"));
    }
  };

  if (loading) {
    return (
      <PageShell title={`${t("okLoading")} | ${storeName}`}>
        <div className="shell py-10 md:py-14" role="status" aria-label={t("okLoading")}>
          <div className="mx-auto max-w-[1120px] space-y-6">
            <div className="skeleton mx-auto h-[300px] max-w-3xl rounded-[24px]" />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="skeleton h-[320px] rounded-[20px]" />
              <div className="skeleton h-[320px] rounded-[20px]" />
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!order) {
    return null;
  }

  const shortId = order.id.slice(0, 8).toUpperCase();

  // While files are still uploading, hide the confirmation screen and
  // keep the user on a dedicated upload-progress view. Only when uploads
  // complete (ok) or definitively fail do we reveal the confirmation page.
  if (uploadState === "checking" || uploadState === "uploading") {
    const { done, total } = uploadProgress;
    const { done: bDone, total: bTotal } = uploadBytes;
    const pct = bTotal > 0
      ? Math.round((bDone / bTotal) * 100)
      : (total > 0 ? Math.round((done / total) * 100) : (uploadState === "checking" ? 5 : 10));
    const elapsedMs = uploadStartedAt ? Math.max(0, nowTick - uploadStartedAt) : 0;
    const speedBps = elapsedMs > 500 && bDone > 0 ? (bDone / elapsedMs) * 1000 : 0;
    const etaMs = speedBps > 0 && bTotal > bDone
      ? Math.round(((bTotal - bDone) / speedBps) * 1000 / 5000) * 5000
      : null;
    const fmtBytes = (b: number) => {
      if (b <= 0) return "0 KB";
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
      return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    };
    const fmtSpeed = (bps: number) => {
      if (bps <= 0) return "";
      if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} kB/s`;
      return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    };
    const fmtDur = (ms: number) => {
      const s = Math.max(0, Math.round(ms / 1000));
      const mm = Math.floor(s / 60).toString().padStart(2, "0");
      const ss = (s % 60).toString().padStart(2, "0");
      return `${mm}:${ss}`;
    };
    return (
      <PageShell title={`${t("upSeoTitle")} | ${storeName}`}>
        <div className="shell py-10 md:py-16">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mx-auto max-w-2xl rounded-[24px] border border-brand-card-border bg-white p-6 text-center shadow-[var(--shadow-card)] sm:p-10"
          >
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-accent text-primary">
              <UploadCloud className="h-9 w-9" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-[30px] font-extrabold leading-tight tracking-[-0.035em] sm:text-[36px]">{t("upTitle")}</h1>
            <p className="mt-3 text-[16px] leading-relaxed text-brand-ink-soft">{t("upText")}</p>
            <p className="mt-2 text-[16px] font-semibold text-destructive">{t("upKeepOpen")}</p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-destructive">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />{t("upBadge")}
            </span>
            <div className="mt-7 space-y-2" aria-live="polite">
              <div className="h-3 w-full overflow-hidden rounded-full bg-brand-alt" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("upTitle")}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
              {total > 0 ? (
                <div className="space-y-0.5 text-[13px] tabular-nums text-muted-foreground">
                  <p>
                    {t("upFiles", { done, total })}
                    {bTotal > 0 ? ` · ${t("upBytes", { done: fmtBytes(bDone), total: fmtBytes(bTotal) })}` : ""}
                    {speedBps > 0 ? ` · ${fmtSpeed(speedBps)}` : ""}
                  </p>
                  <p>
                    {t("upElapsed", { time: fmtDur(elapsedMs) })}
                    {etaMs != null && elapsedMs > 2000 ? ` · ${t("upEta", { time: fmtDur(etaMs) })}` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">{t("upPreparing")}</p>
              )}
            </div>
            <p className="mt-6 text-[14px] text-muted-foreground">{t("upAfter")}</p>
          </motion.div>
        </div>
      </PageShell>
    );
  }

  if (uploadState === "failed") {
    return (
      <PageShell title={`${t("upFailTitle")} | ${storeName}`}>
        <div className="shell py-10 md:py-16">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mx-auto max-w-xl rounded-[24px] border border-destructive/30 bg-white p-6 text-center shadow-[var(--shadow-card)] sm:p-10"
          >
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-7 w-7" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-[26px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[30px]">{t("upFailTitle")}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-brand-ink-soft">{t("upFailText")}</p>
            {missingKeys.length > 0 && (
              <p className="mt-4 rounded-[14px] border border-amber-300 bg-amber-50 p-3.5 text-left text-[14px] leading-relaxed text-amber-900">
                {t("upFailMissing")}
              </p>
            )}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={cn(btnPrimary, "w-full")}
                onClick={() => {
                  attachedRef.current = null;
                  setUploadAttempt((attempt) => attempt + 1);
                }}
              >
                <RefreshCw className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{t("upRetry")}
              </button>
              <button type="button" className={cn(btnSecondary, "w-full")} onClick={() => navigate("/dashboard?tab=pedidos")}>
                {t("okMyOrders")}
              </button>
            </div>
            <p className="mt-5 text-[13px] text-muted-foreground">{t("upOrderRef", { id: shortId })}</p>
          </motion.div>
        </div>
      </PageShell>
    );
  }

  // ── Confirmação ──────────────────────────────────────────
  const details = paymentConfig?.details ?? {};
  const isPaid = order.payment_status === "paid";
  const isPickup =
    deliveryMethod?.type === "pickup" || /LEVANTAMENTO NA LOJA/.test(order.notes ?? "") || order.shipping_address?.name === "Levantamento na Loja";
  const cfg = deliveryMethod?.config ?? {};
  const minDays = Number(cfg.flat_min_days || 0);
  const maxDays = Number(cfg.flat_max_days || 0);
  const placedAt = new Date(order.created_at).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" });

  // Totais: com subtotal_net (pedidos do servidor) o frete é o que falta para o total (já com o imposto do frete).
  const discountAmt = Number(order.discount_amount || 0);
  const payDiscountAmt = Number(order.payment_discount || 0);
  const vatAmt = Number(order.vat_total || 0) + Number((order as any).extras_vat || 0);
  // Campos extra do checkout (embrulho, cartão...): sem imposto aqui, o imposto entra na linha do imposto.
  const extrasAmt = Number((order as any).extras_amount || 0);
  // Pontos e vale-presente também saíram do total.
  const benefitsAmt = Number((order as any).gift_card_amount || 0) + Number((order as any).reward_points_amount || 0);
  const hasNet = order.subtotal_net != null;
  const subtotalShown = hasNet ? Number(order.subtotal_net) : order.total - (order.shipping_cost || 0) + discountAmt;
  const shippingShown = hasNet
    ? Math.max(0, Math.round((order.total + discountAmt + payDiscountAmt + benefitsAmt - subtotalShown - vatAmt - extrasAmt) * 100) / 100)
    : Number(order.shipping_cost || 0);
  const showVat = hasNet && vatAmt > 0;

  const amountRow = (
    <div className="flex items-center justify-between gap-4 rounded-[14px] bg-brand-alt px-4 py-3.5">
      <span className="text-[15px] font-medium">{t("okPayAmount")}</span>
      <span className="text-[22px] font-[780] tracking-[-0.02em] tabular-nums">{money(order.total)}</span>
    </div>
  );
  // Instruções no idioma do cliente (Admin > Pagamentos), senão o texto antigo, senão o padrão.
  const instrText = localized(paymentConfig?.instructions_i18n, locale, details.instrucoes || "");
  const instructions = (fallback: string) => (
    <p className="text-[14px] leading-relaxed text-brand-ink-soft">{instrText || fallback}</p>
  );
  const missing = <p className="rounded-[14px] border border-amber-300 bg-amber-50 p-3.5 text-[14px] text-amber-900">{t("okPayMissing")}</p>;
  const proof = details.requires_proof ? (
    <PaymentProofUploader orderId={order.id} guestEmail={order.guest_email} alreadySubmitted={!!order.payment_proof_url} />
  ) : null;

  let payment: ReactNode = null;
  if (order.payment_method === "pix") {
    payment = (
      <PayCard icon={QrCode} title={t("okPayPix")}>
        {details.chave_pix ? (
          <CopyRow label={details.tipo_chave ? t("payPixKeyType", { type: String(details.tipo_chave).toUpperCase() }) : t("payPixKey")} value={details.chave_pix} />
        ) : missing}
        {details.nome_titular && <InfoRow label={t("payHolder")} value={details.nome_titular} />}
        {amountRow}
        {instructions(t("okPixDefault"))}
        {proof}
      </PayCard>
    );
  } else if (order.payment_method === "transfer") {
    const fields: Array<[string, string]> = [
      [t("payBank"), details.banco],
      [t("payHolder"), details.nome_titular],
      [t("payAgency"), details.agencia],
      [t("payAccount"), details.conta],
      [t("payDocument"), details.nif || details.cnpj],
    ].filter(([, v]) => !!v) as Array<[string, string]>;
    payment = (
      <PayCard icon={Landmark} title={t("okPayTransfer")}>
        {fields.length > 0 || details.iban ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(([label, value]) => (
              <div key={label} className="rounded-[14px] border border-border px-4 py-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
                <p className="mt-0.5 break-words font-medium">{value}</p>
              </div>
            ))}
            {details.iban && <div className="sm:col-span-2"><CopyRow label={t("payIban")} value={details.iban} /></div>}
          </div>
        ) : missing}
        {amountRow}
        {instructions(t("okTransferDefault"))}
        {proof}
      </PayCard>
    );
  } else if (order.payment_method === "multibanco") {
    payment = (
      <PayCard icon={Landmark} title={t("okPayMultibanco")}>
        {details.entidade || details.referencia_modelo ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {details.entidade && <CopyRow label={t("payEntity")} value={details.entidade} />}
            {details.referencia_modelo && <CopyRow label={t("payReference")} value={details.referencia_modelo} />}
          </div>
        ) : missing}
        {amountRow}
        {instructions(t("okMultibancoDefault"))}
        {proof}
      </PayCard>
    );
  } else if (order.payment_method === "mbway") {
    payment = (
      <PayCard icon={Smartphone} title={t("okPayMbway")}>
        {details.telemovel ? <CopyRow label={t("payMbwayNumber")} value={details.telemovel} /> : missing}
        {amountRow}
        {instructions(t("okMbwayDefault"))}
        {proof}
      </PayCard>
    );
  } else if (order.payment_method === "bizum") {
    payment = (
      <PayCard icon={Smartphone} title={t("okPayBizum")}>
        {details.telefone ? <CopyRow label={t("payBizumNumber")} value={details.telefone} /> : missing}
        {details.nome_titular && <InfoRow label={t("payHolder")} value={details.nome_titular} />}
        {amountRow}
        {instructions(t("okBizumDefault"))}
        {proof}
      </PayCard>
    );
  } else if (isOnlineGateway(order.payment_method)) {
    const name = localized(paymentConfig?.name_i18n, locale, t(order.payment_method === "mercado_pago" ? "pm_mercado_pago" : order.payment_method === "paypal" ? "pm_paypal" : "pm_stripe"));
    payment = isPaid ? <PaidCard t={t} /> : (
      <PayCard icon={CreditCard} title={t("okPayOnline")}>
        <p className="text-[14px] leading-relaxed text-brand-ink-soft">{t("okPayOnlineText", { name: order.payment_method === "stripe" ? "Stripe" : name })}</p>
        {amountRow}
        <OnlinePayment
          orderId={order.id}
          name={name}
          ready={uploadState === "ok" && !(order as any).files_pending}
          returned={new URLSearchParams(location.search).get("pagamento")}
          onPaid={() => setOrder((o) => (o ? { ...o, status: "paid", payment_status: "paid" } : o))}
        />
      </PayCard>
    );
  } else if (order.payment_method === "on_delivery") {
    payment = (
      <PayCard icon={Wallet} title={t("okPayOnDelivery")}>
        <div>
          <p className="text-[14px] font-semibold">{t("okPayAccepted")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {details.accepts_cash && <span className="rounded-lg border border-border bg-white px-2.5 py-1 text-[13px] font-medium">{t("okPayCash")}</span>}
            {details.accepts_card && <span className="rounded-lg border border-border bg-white px-2.5 py-1 text-[13px] font-medium">{t("okPayCardAccepted")}</span>}
            {!details.accepts_cash && !details.accepts_card && <span className="rounded-lg border border-border bg-white px-2.5 py-1 text-[13px] font-medium">{t("okPayToAgree")}</span>}
          </div>
        </div>
        {amountRow}
        <div className="rounded-[14px] border border-dashed border-border p-3.5 text-[14px]">
          <p className="font-semibold">{t("okPayAttention")}</p>
          <p className="mt-0.5 text-brand-ink-soft">{instrText || t("okOnDeliveryDefault")}</p>
        </div>
      </PayCard>
    );
  } else if (order.payment_method === "viva") {
    // Viva payment only becomes available after file verification.
    payment = isPaid ? (
      <PaidCard t={t} />
    ) : (
      <VivaCardEmbed
        orderId={order.id}
        total={order.total}
        onPaid={() => setOrder((current) => current ? ({ ...current, status: "paid", payment_status: "paid" }) : current)}
      />
    );
  } else if (order.payment_method === "stripe") {
    payment = (
      <PayCard icon={CreditCard} title={t("okPayCard")}>
        <div className="flex items-start gap-3 rounded-[14px] border border-amber-300 bg-amber-50 p-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" strokeWidth={1.8} aria-hidden="true" />
          <div className="text-[14px] text-amber-900">
            <p className="font-semibold">{t("okCardPendingTitle")}</p>
            <p className="mt-0.5">{t("okCardPending")}</p>
          </div>
        </div>
        {amountRow}
        {details.instrucoes && instructions("")}
      </PayCard>
    );
  }
  if (isPaid && order.payment_method !== "viva") payment = <PaidCard t={t} />;

  const steps: Array<{ Icon: LucideIcon; title: string; text: string; done?: boolean; link?: ReactNode }> = [
    { Icon: isPaid ? CheckCircle2 : CreditCard, title: isPaid ? t("okPaidTitle") : t("okStepPayTitle"), text: isPaid ? t("okStepPaid") : t("okStepPay"), done: isPaid },
    { Icon: ChefHat, title: t("okStepMakeTitle"), text: t("okStepMake") },
    isPickup
      ? { Icon: Store, title: t("okStepPickupTitle"), text: t("okStepPickup") }
      : {
          Icon: Truck,
          title: t("okStepShipTitle"),
          text: minDays && maxDays ? `${t("okStepShip")} ${t("okStepShipDays", { min: minDays, max: maxDays })}` : t("okStepShip"),
        },
    {
      Icon: PackageSearch,
      title: t("okStepTrackTitle"),
      text: t("okStepTrack"),
      link: (
        <Link to="/rastrear" className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-brand-orange-text underline-offset-4 hover:underline">
          {t("okTrack")}<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </Link>
      ),
    },
  ];

  const address = order.shipping_address;
  const addrLines = isPickup
    ? [address?.street, address?.city].filter(Boolean) as string[]
    : addressLines(address, locale, country.code);

  return (
    <PageShell title={`${t("okSeoTitle")} | ${storeName}`}>
      <Helmet>
        <meta name="description" content={t("okSeoDescription")} />
      </Helmet>
      <div className="shell py-8 md:py-12">
        <div className="mx-auto max-w-[1120px] space-y-6">
          {/* Cabeçalho da confirmação */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-[24px] border border-brand-card-border bg-white px-6 py-10 text-center shadow-[var(--shadow-card)] sm:px-10 md:py-12"
            aria-labelledby="order-ok-title"
          >
            <SuccessMark />
            <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text">{t("okEyebrow")}</p>
            <h1 id="order-ok-title" className="mt-2 text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[52px]">{t("okTitle")}</h1>
            <p className="mx-auto mt-3 max-w-xl text-[16px] leading-relaxed text-brand-ink-soft md:text-[17px]">{isPaid ? t("okPaidText") : t("okText")}</p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-[16px] border border-border bg-brand-alt/50 py-2 pl-5 pr-2">
              <div className="text-left">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("okNumber")}</p>
                <p className="font-mono text-[20px] font-bold tracking-[0.04em]">#{shortId}</p>
              </div>
              <button type="button" onClick={copyOrderId} aria-label={t("okCopy")} title={t("okCopy")} className={cn("grid h-11 w-11 place-items-center rounded-[12px] text-brand-ink-soft transition-colors duration-150 hover:bg-white hover:text-brand-orange-text", focusRing)}>
                <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[14px] text-muted-foreground">
              <span>{t("okPlacedAt", { date: placedAt })}</span>
              <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold", isPaid ? "bg-emerald-50 text-emerald-700" : "bg-accent text-brand-orange-text")}>
                {isPaid ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" /> : <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />}
                {isPaid ? t("okStatusPaid") : t("okStatusPending")}
              </span>
            </div>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/dashboard?tab=pedidos" className={btnPrimary}>
                {t("okMyOrders")}<ArrowRight className="h-[18px] w-[18px] transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} aria-hidden="true" />
              </Link>
              <Link to="/produtos" className={btnSecondary}>
                <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t("okContinue")}
              </Link>
            </div>
          </motion.section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="min-w-0 space-y-6">
              {payment && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.08 }}>
                  {payment}
                </motion.div>
              )}

              {/* Próximos passos */}
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.12 }}
                className={cn(card, "p-5 sm:p-6")}
                aria-labelledby="order-next-title"
              >
                <h2 id="order-next-title" className="text-[22px] font-bold tracking-[-0.02em]">{t("okNextTitle")}</h2>
                <ol className="mt-5 space-y-0">
                  {steps.map((s, i) => (
                    <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < steps.length - 1 && <span className="absolute left-5 top-11 h-[calc(100%-2.75rem)] w-px bg-border" aria-hidden="true" />}
                      <span className={cn("relative grid h-10 w-10 shrink-0 place-items-center rounded-full", s.done ? "bg-emerald-50 text-emerald-700" : "bg-accent text-primary")}>
                        <s.Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 pt-1">
                        <p className="text-[16px] font-semibold">{s.title}</p>
                        <p className="mt-0.5 text-[14px] leading-relaxed text-brand-ink-soft">{s.text}</p>
                        {s.link}
                      </div>
                    </li>
                  ))}
                </ol>
              </motion.section>
            </div>

            <div className="min-w-0 space-y-6">
              {/* Resumo */}
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.1 }}
                className={cn(card, "p-5 sm:p-6")}
                aria-labelledby="order-items-title"
              >
                <h2 id="order-items-title" className="text-[20px] font-bold tracking-[-0.02em]">{t("okItemsTitle")}</h2>
                <ul className="mt-4 divide-y divide-border">
                  {order.order_items.map((item) => (
                    <li key={item.id} className="py-3 first:pt-0">
                      <OrderItemRow
                        image={item.design_data?.image || item.products?.image || ""}
                        name={item.products?.name || t("itemFallback")}
                        meta={[
                          typeof item.design_data?.variation === "string" && item.design_data.variation ? t("sumColor", { name: item.design_data.variation }) : "",
                          typeof item.design_data?.size === "string" && item.design_data.size ? t("sumSize", { name: item.design_data.size }) : "",
                        ].filter(Boolean).join(" · ")}
                        qty={t("okQty", { qty: item.quantity })}
                        price={money(item.price * item.quantity)}
                      />
                    </li>
                  ))}
                </ul>
                <dl className="mt-4 space-y-2.5 border-t border-border pt-4 text-[15px]">
                  <div className="flex justify-between gap-4 text-brand-ink-soft">
                    <dt>{showVat ? t("sumSubtotalNet") : t("okSubtotal")}</dt>
                    <dd className="tabular-nums">{money(subtotalShown)}</dd>
                  </div>
                  {showVat && (
                    <div className="flex justify-between gap-4 text-brand-ink-soft">
                      <dt>{t("okTax")}</dt>
                      <dd className="tabular-nums">{money(vatAmt)}</dd>
                    </div>
                  )}
                  {extrasAmt > 0 && (
                    <div className="flex justify-between gap-4 text-brand-ink-soft">
                      <dt>{tcf("summary")}</dt>
                      <dd className="tabular-nums">{money(showVat ? extrasAmt : extrasAmt + Number((order as any).extras_vat || 0))}</dd>
                    </div>
                  )}
                  {discountAmt > 0 && (
                    <div className="flex justify-between gap-4 font-medium text-emerald-700">
                      <dt>{order.coupon_code ? t("okDiscountCode", { code: order.coupon_code }) : t("okDiscount")}</dt>
                      <dd className="tabular-nums">-{money(discountAmt)}</dd>
                    </div>
                  )}
                  {payDiscountAmt > 0 && (
                    <div className="flex justify-between gap-4 font-medium text-emerald-700">
                      <dt>{t("sumPayDiscount")}</dt>
                      <dd className="tabular-nums">-{money(payDiscountAmt)}</dd>
                    </div>
                  )}
                  {Number((order as any).reward_points_amount || 0) > 0 && (
                    <div className="flex justify-between gap-4 font-medium text-emerald-700">
                      <dt>{tp("co_summary", { points: new Intl.NumberFormat(locale).format(Number((order as any).reward_points_used || 0)) })}</dt>
                      <dd className="tabular-nums">-{money(Number((order as any).reward_points_amount))}</dd>
                    </div>
                  )}
                  {Number((order as any).gift_card_amount || 0) > 0 && (
                    <div className="flex justify-between gap-4 font-medium text-emerald-700">
                      <dt>{tg("summary", { tail: giftCodeTail(String((order as any).gift_card_code || "")) })}</dt>
                      <dd className="tabular-nums">-{money(Number((order as any).gift_card_amount))}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 text-brand-ink-soft">
                    <dt>{t("okShipping")}</dt>
                    <dd className={cn("tabular-nums", shippingShown < 0.005 && "font-semibold text-emerald-700")}>{shippingShown < 0.005 ? t("okFree") : money(shippingShown)}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-end justify-between gap-4 border-t border-border pt-4">
                  <div>
                    <p className="text-[16px] font-semibold">{t("okTotal")}</p>
                    <p className="text-[13px] text-muted-foreground">{showVat ? t("sumTaxIncluded") : t("sumFinalPrice")}</p>
                  </div>
                  <p className="text-[28px] font-[780] leading-none tracking-[-0.03em] tabular-nums">{money(order.total)}</p>
                </div>
              </motion.section>

              {/* Endereço */}
              {address && addrLines.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.14 }}
                  className={cn(card, "p-5 sm:p-6")}
                  aria-labelledby="order-address-title"
                >
                  <h2 id="order-address-title" className="flex items-center gap-2 text-[20px] font-bold tracking-[-0.02em]">
                    {isPickup ? <Store className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden="true" /> : <MapPin className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden="true" />}
                    {isPickup ? t("okPickupTitle") : t("okAddressTitle")}
                  </h2>
                  {!isPickup && address.name && <p className="mt-3 font-semibold">{address.name}</p>}
                  <div className={cn("space-y-0.5 text-[15px] text-brand-ink-soft", isPickup || !address.name ? "mt-3" : "mt-1")}>
                    {addrLines.map((l) => <p key={l}>{l}</p>)}
                    {isPickup && cfg.opening_hours && <p>{t("pickupHours", { hours: cfg.opening_hours })}</p>}
                  </div>
                </motion.section>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

// ── Peças ───────────────────────────────────────────────────

/** Ícone de sucesso com animação curta (escala e um anel que se desfaz). */
function SuccessMark() {
  return (
    <span className="relative mx-auto grid h-20 w-20 place-items-center" aria-hidden="true">
      <motion.span
        className="absolute inset-0 rounded-full border-2 border-primary"
        initial={{ scale: 0.9, opacity: 0.7 }}
        animate={{ scale: 1.55, opacity: 0 }}
        transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
      />
      <motion.span
        className="grid h-20 w-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow-orange)]"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 20 }}
      >
        <motion.span initial={{ scale: 0, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.12, duration: 0.22 }}>
          <Check className="h-10 w-10" strokeWidth={2} />
        </motion.span>
      </motion.span>
    </span>
  );
}

/**
 * Pagamento online (Mercado Pago, Stripe, PayPal): abre o pagamento no provedor (payment-start) e, ao voltar
 * (?pagamento=retorno) ou no botão "Já paguei", pergunta ao servidor (payment-verify), que confirma na API do provedor.
 */
function OnlinePayment({ orderId, name, ready, returned, onPaid }: {
  orderId: string; name: string; ready: boolean; returned: string | null; onPaid: () => void;
}) {
  const { t, locale } = useMessages(checkoutMessages);
  const [busy, setBusy] = useState<"open" | "check" | null>(null);
  const [note, setNote] = useState<string | null>(returned === "cancelado" ? t("okPayCancelled") : null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const check = async (quiet = false) => {
    setBusy("check");
    try {
      const { data } = await supabase.functions.invoke("payment-verify", { body: { orderId } });
      if (data?.status === "paid") { onPaidRef.current(); toast.success(t("okPaidToast")); return true; }
      if (!quiet) setNote(t("okPayStillPending"));
    } catch {
      if (!quiet) setNote(t("okPayStillPending"));
    } finally {
      setBusy(null);
    }
    return false;
  };
  // De volta do provedor: confirma algumas vezes (Pix e cartão confirmam em segundos; boleto e Multibanco demoram).
  useEffect(() => {
    if (returned !== "retorno" || !ready) return;
    let stop = false, tries = 0;
    const loop = async () => {
      if (stop) return;
      const paid = await check(true);
      tries += 1;
      if (!paid && !stop) {
        if (tries < 6) window.setTimeout(loop, 4000);
        else setNote(t("okPayStillPending"));
      }
    };
    void loop();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned, ready, orderId]);

  const open = async () => {
    setBusy("open");
    setNote(null);
    const { data } = await supabase.functions.invoke("payment-start", { body: { orderId, locale } }).catch(() => ({ data: null }));
    if (data?.url) { window.location.assign(String(data.url)); return; }
    if (data?.status === "paid") { onPaidRef.current(); setBusy(null); return; }
    setBusy(null);
    setNote(t("okPayStartError"));
  };

  if (!ready) return <p className="text-[14px] text-brand-ink-soft">{t("okPayFilesFirst")}</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={open}
          disabled={!!busy}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {busy === "open" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />}
          {busy === "open" ? t("okPayOpening") : t("okPayNow", { name })}
        </button>
        <button
          type="button"
          onClick={() => void check()}
          disabled={!!busy}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-5 text-[15px] font-semibold transition-colors duration-200 hover:bg-accent disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />}
          {busy === "check" ? t("okPayChecking") : t("okPayCheck")}
        </button>
      </div>
      {note && <p role="status" className="rounded-[14px] border border-amber-300 bg-amber-50 p-3.5 text-[14px] text-amber-900">{note}</p>}
    </div>
  );
}

function PayCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className={cn(card, "space-y-4 p-5 sm:p-6")} aria-label={title}>
      <h2 className="flex items-center gap-3 text-[20px] font-bold tracking-[-0.02em]">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function PaidCard({ t }: { t: (k: "okPaidTitle" | "okPaidText") => string }) {
  return (
    <div className="flex items-center gap-4 rounded-[20px] border border-emerald-200 bg-emerald-50 p-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-emerald-700">
        <CheckCircle2 className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-[17px] font-bold text-emerald-900">{t("okPaidTitle")}</h2>
        <p className="text-[14px] text-emerald-800">{t("okPaidText")}</p>
      </div>
    </div>
  );
}

function OrderItemRow({ image, name, meta, qty, price }: { image: string; name: string; meta: string; qty: string; price: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[12px] border border-brand-card-border bg-brand-alt">
        {image && !failed
          ? <img src={image} alt={name} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
          : <LayerArt Icon={Box} size="sm" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{name}</p>
        {meta && <p className="truncate text-[13px] text-muted-foreground">{meta}</p>}
        <p className="text-[13px] text-muted-foreground">{qty}</p>
      </div>
      <p className="shrink-0 text-[15px] font-semibold tabular-nums">{price}</p>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useMessages(checkoutMessages);
  return (
    <div className="flex items-center justify-between gap-2 rounded-[14px] border border-border bg-white px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="break-all font-mono text-[15px] font-semibold">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          toast.success(t("payCopied", { label }));
        }}
        aria-label={t("payCopy", { label })}
        className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[12px] text-brand-ink-soft transition-colors duration-150 hover:bg-accent hover:text-brand-orange-text", focusRing)}
      >
        <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 text-[14px]">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{value}</span>
  </div>
);

export default OrderSuccess;
