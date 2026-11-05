import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/i18n";
import { paymentsMessages } from "@/i18n/payments";
import { useCountry, type Country } from "@/lib/countries";
import { methodBlock } from "@/lib/paymentMethods";
import { siApplepay, siGooglepay, siMastercard, siMercadopago, siPaypal, siPix, siVisa, siVivawallet } from "simple-icons";

// Selos dos meios de pagamento (rodapé, produto, carrinho e checkout). Mostra só o que existe no país atual:
// os métodos ativos no Admin (get_active_payment_methods), filtrados pelo país como no checkout; enquanto não
// houver nenhum método ativo, os provedores configurados no país (countries.payment_providers). Sem nada
// configurado, não mostra nada. Logótipos de marcas: pacote simple-icons (CC0, SVG embutido, sem pedidos a outros
// sites); o resto são selos com texto.

type Translate = (key: keyof (typeof paymentsMessages)["pt-BR"], vars?: Record<string, string | number>) => string;
type Icon = { path: string; hex: string };
type Badge = { key: string; label: string; icon?: Icon; title?: string; provider?: boolean };

const brand = (key: string, label: string, icon: Icon): Badge => ({ key, label, icon });
const VISA = brand("visa", "Visa", siVisa);
const MASTERCARD = brand("mastercard", "Mastercard", siMastercard);
const APPLE_PAY = brand("applepay", "Apple Pay", siApplepay);
const GOOGLE_PAY = brand("googlepay", "Google Pay", siGooglepay);
const PIX = brand("pix", "Pix", siPix);
const MBWAY: Badge = { key: "mbway", label: "MB WAY" };
const MULTIBANCO: Badge = { key: "multibanco", label: "Multibanco" };

/** Selo do provedor que processa os pagamentos (fica no fim da lista). */
const providerBadge = (key: string, label: string, icon: Icon, t: Translate): Badge =>
  ({ key: `provider-${key}`, label, icon, title: t("processedBy", { name: label }), provider: true });

/** Meio ativo vale no país? Mesma regra do checkout (Admin > Pagamentos, países do meio; vazio = todos). */
const methodAvailable = (m: { countries?: string[] | null }, c: Country) => methodBlock({ type: "", countries: m.countries }, c.code, 0) !== "country";

/** Selos de um provedor do país ou de um método ativo. `name` é o nome gravado no Admin (métodos desconhecidos). */
function badgesFor(type: string, c: Country, t: Translate, name?: string): Badge[] {
  switch (type) {
    case "viva":
      return [
        VISA, MASTERCARD, APPLE_PAY, GOOGLE_PAY,
        ...(c.code === "PT" ? [MBWAY, MULTIBANCO] : []),
        providerBadge("viva", "Viva", siVivawallet, t),
      ];
    case "mercado_pago":
      return [
        ...(c.code === "BR" ? [PIX] : []),
        VISA, MASTERCARD,
        providerBadge("mercado_pago", "Mercado Pago", siMercadopago, t),
      ];
    case "stripe":
      return [VISA, MASTERCARD, APPLE_PAY, GOOGLE_PAY];
    case "paypal":
      return [brand("paypal", "PayPal", siPaypal)];
    case "bizum":
      return [{ key: "bizum", label: "Bizum" }];
    case "pix":
      return [PIX];
    case "mbway":
      return [MBWAY];
    case "multibanco":
      return [MULTIBANCO];
    case "transfer":
      return [{ key: "transfer", label: t("methodTransfer") }];
    case "on_delivery":
      return [{ key: "on_delivery", label: t("methodOnDelivery") }];
    default:
      // Provedor do país sem selo conhecido: nada (sem inventar). Método ativo desconhecido: o nome do Admin.
      return name ? [{ key: type, label: name }] : [];
  }
}

/** Meio ativo como o site vê (sem os dados de pagamento). O desconto e os limites servem a Exibição de preços. */
export type PublicPaymentMethod = {
  type: string; name: string; countries: string[];
  discount_percent: number | string | null; min_total: number | string | null; max_total: number | string | null;
};

export function usePaymentMethods() {
  return useQuery<PublicPaymentMethod[]>({
    queryKey: ["public-payment-methods"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_active_payment_methods");
      return ((data as any[]) || []).map((m) => ({
        type: String(m.type), name: String(m.name || m.type), countries: (m.countries ?? []) as string[],
        discount_percent: m.discount_percent ?? null, min_total: m.min_total ?? null, max_total: m.max_total ?? null,
      }));
    },
  });
}

/** Logótipo em SVG embutido (sem label = decorativo). */
function BrandIcon({ icon, label, className }: { icon: Icon; label?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={icon.path} fill={`#${icon.hex}`} />
    </svg>
  );
}

const PaymentMethods = ({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) => {
  const { t } = useMessages(paymentsMessages);
  const country = useCountry();
  const { data: methods = [], isPending } = usePaymentMethods();
  if (isPending) return null;

  const sources = methods.length > 0
    ? methods.filter((m) => methodAvailable(m, country)).map((m) => badgesFor(m.type, country, t, m.name))
    : country.paymentProviders.map((p) => badgesFor(p, country, t));
  const seen = new Set<string>();
  const unique = sources.flat().filter((b) => (seen.has(b.key) ? false : (seen.add(b.key), true)));
  const badges = [...unique.filter((b) => !b.provider), ...unique.filter((b) => b.provider)];
  if (badges.length === 0) return null;

  const badge = `inline-flex h-8 items-center justify-center rounded-md px-2.5 ${tone === "dark" ? "bg-white" : "border border-border/70 bg-white"}`;

  return (
    <ul className={`flex flex-wrap items-center gap-2 ${className}`} aria-label={t("methodsLabel")}>
      {badges.map((b) =>
        b.icon && !b.provider ? (
          <li key={b.key} className={badge} title={b.label}>
            <BrandIcon icon={b.icon} label={b.label} className="h-4 w-auto" />
          </li>
        ) : (
          <li key={b.key} className={`${badge} gap-1.5 text-[11px] font-semibold text-slate-800`} title={b.title ?? b.label}>
            {b.icon && <BrandIcon icon={b.icon} className="h-3.5 w-auto" />}
            {b.label}
          </li>
        ),
      )}
    </ul>
  );
};

export default PaymentMethods;
