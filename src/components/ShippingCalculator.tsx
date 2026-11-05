import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, Package, Zap, Globe } from "lucide-react";
import { formatPrice } from "@/utils/currency";
import { useCurrency } from "@/hooks/use-currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ShippingCalculatorProps {
  productWeight: number;
}

interface ShippingOption {
  service: string;
  price: number;
  days: number;
  description: string;
}

// CTT — tarifário simplificado (EUR), por zona e por peso (kg)
// Valores aproximados baseados no tarifário público CTT 2025 para encomendas até 2kg/5kg.
type Zone = "PT_CONTINENTE" | "PT_ILHAS" | "EU" | "RESTO_MUNDO";

const ZONE_LABELS: Record<Zone, string> = {
  PT_CONTINENTE: "Portugal Continental",
  PT_ILHAS: "Açores e Madeira",
  EU: "Europa",
  RESTO_MUNDO: "Resto do mundo",
};

// Países da União Europeia (zona EU do CTT)
const EU_COUNTRIES = [
  "Alemanha", "Áustria", "Bélgica", "Bulgária", "Chéquia", "Chipre",
  "Croácia", "Dinamarca", "Eslováquia", "Eslovénia", "Espanha", "Estónia",
  "Finlândia", "França", "Grécia", "Hungria", "Irlanda", "Itália",
  "Letónia", "Lituânia", "Luxemburgo", "Malta", "Países Baixos", "Polónia",
  "Roménia", "Suécia",
];

// Resto do mundo (amostragem)
const WORLD_COUNTRIES = [
  "Reino Unido", "Suíça", "Noruega", "Estados Unidos", "Canadá",
  "Portugal", "Espanha", "França", "Reino Unido", "Alemanha", "Itália", "Países Baixos", "Bélgica",
];

const COUNTRY_TO_ZONE: Record<string, Zone> = {
  "Portugal": "PT_CONTINENTE",
  "Açores": "PT_ILHAS",
  "Madeira": "PT_ILHAS",
};
EU_COUNTRIES.forEach((c) => (COUNTRY_TO_ZONE[c] = "EU"));
WORLD_COUNTRIES.forEach((c) => (COUNTRY_TO_ZONE[c] = "RESTO_MUNDO"));

const cttRate = (zone: Zone, weightKg: number): ShippingOption[] => {
  // Garantir peso mínimo
  const w = Math.max(0.1, weightKg || 0.3);

  const tier = (under1: number, under2: number, under5: number, perKgAbove: number) => {
    if (w <= 1) return under1;
    if (w <= 2) return under2;
    if (w <= 5) return under5;
    return under5 + Math.ceil(w - 5) * perKgAbove;
  };

  switch (zone) {
    case "PT_CONTINENTE":
      return [
        {
          service: "CTT Normal",
          price: tier(3.5, 4.5, 6.9, 1.2),
          days: 3,
          description: "Entrega standard ao domicílio",
        },
        {
          service: "CTT Expresso",
          price: tier(6.9, 8.5, 11.5, 1.8),
          days: 1,
          description: "Entrega no dia útil seguinte",
        },
      ];
    case "PT_ILHAS":
      return [
        {
          service: "CTT Normal",
          price: tier(6.9, 8.9, 12.9, 1.8),
          days: 5,
          description: "Açores / Madeira",
        },
      ];
    case "EU":
      return [
        {
          service: "CTT Internacional Económico",
          price: tier(11.9, 15.9, 24.9, 3.5),
          days: 8,
          description: "Entrega na União Europeia",
        },
        {
          service: "CTT Internacional Prioritário",
          price: tier(18.9, 24.9, 36.9, 4.8),
          days: 4,
          description: "Entrega rápida na UE",
        },
      ];
    case "RESTO_MUNDO":
      return [
        {
          service: "CTT Internacional Económico",
          price: tier(22.9, 32.9, 49.9, 6.5),
          days: 18,
          description: "Entrega fora da UE",
        },
        {
          service: "CTT Internacional Prioritário",
          price: tier(34.9, 48.9, 79.9, 9.5),
          days: 8,
          description: "Entrega rápida fora da UE",
        },
      ];
  }
};

const ShippingCalculator = ({ productWeight }: ShippingCalculatorProps) => {
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("Portugal");
  const [results, setResults] = useState<ShippingOption[] | null>(null);
  const { currentCurrency, convert } = useCurrency();

  const { data: internationalSettings } = useQuery({
    queryKey: ["international-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", "international_shipping")
        .maybeSingle();
      return data?.value as { enabled: boolean; allowed_countries: string[] } | null;
    },
  });

  const allowedCountries = internationalSettings?.enabled
    ? Array.from(
        new Set([
          "Portugal",
          "Açores",
          "Madeira",
          ...EU_COUNTRIES,
          ...(internationalSettings.allowed_countries || []),
        ])
      )
    : ["Portugal", "Açores", "Madeira", ...EU_COUNTRIES];

  // Format Portuguese postal code as NNNN-NNN
  const formatPortugueseCP = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 7);
    if (digits.length > 4) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return digits;
  };

  const isPT = country === "Portugal" || country === "Açores" || country === "Madeira";

  const calculate = useMutation({
    mutationFn: async () => {
      const zone: Zone = COUNTRY_TO_ZONE[country] ?? "RESTO_MUNDO";
      // Simulate small delay for UX consistency
      await new Promise((r) => setTimeout(r, 350));
      return { options: cttRate(zone, productWeight) };
    },
    onSuccess: (data) => setResults(data.options),
    onError: () => setResults(null),
  });

  const canCalculate = isPT
    ? postalCode.replace(/\D/g, "").length === 7
    : postalCode.trim().length >= 3;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-brand-gold-dark" strokeWidth={1.5} />
        <h3 className="font-medium">Calcular envio (CTT)</h3>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Globe className="h-3 w-3" /> País de entrega
        </Label>
        <Select
          value={country}
          onValueChange={(v) => {
            setCountry(v);
            setResults(null);
            setPostalCode("");
          }}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {allowedCountries.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          Zona: {ZONE_LABELS[COUNTRY_TO_ZONE[country] ?? "RESTO_MUNDO"]}
        </p>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          {isPT ? (
            <Input
              placeholder="Código postal (ex: 1000-100)"
              value={postalCode}
              onChange={(e) => setPostalCode(formatPortugueseCP(e.target.value))}
              maxLength={8}
              inputMode="numeric"
            />
          ) : (
            <Input
              placeholder="Código postal / Zip code"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
            />
          )}
        </div>
        <Button
          onClick={() => calculate.mutate()}
          disabled={!canCalculate || calculate.isPending}
          size="sm"
        >
          {calculate.isPending ? "..." : "Calcular"}
        </Button>
      </div>

      {isPT && (
        <a
          href="https://www.ctt.pt/feapl_2/app/open/postalCodeSearch/postalCodeSearch.jspx"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-gold-dark hover:underline"
        >
          Não sei o meu código postal
        </a>
      )}

      {calculate.isPending && (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {results && (
        <div className="space-y-2 pt-2 border-t">
          {results.map((option) => {
            const isExpress = /express|prioritário/i.test(option.service);
            return (
              <div
                key={option.service}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-brand-gold transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpress ? (
                    <Zap className="h-4 w-4 text-brand-gold" strokeWidth={1.5} />
                  ) : (
                    <Package className="h-4 w-4 text-brand-gold-dark" strokeWidth={1.5} />
                  )}
                  <div>
                    <p className="text-sm font-medium">{option.service}</p>
                    <p className="text-xs text-muted-foreground">
                      {option.days} {option.days === 1 ? "dia útil" : "dias úteis"} · {option.description}
                    </p>
                  </div>
                </div>
                <span className="font-medium text-sm">
                  {formatPrice(convert(option.price), currentCurrency)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default ShippingCalculator;
