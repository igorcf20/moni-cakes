import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ShippingZone {
  id: string;
  country_code: string;
  country_name: string;
  zone_name: string;
  is_active: boolean;
}

interface ShippingRate {
  id: string;
  zone_id: string;
  min_weight: number;
  max_weight: number;
  base_rate: number;
  per_kg_rate: number;
  estimated_days_min: number;
  estimated_days_max: number;
}

interface ShippingResult {
  cost: number;
  estimatedDays: { min: number; max: number };
  zoneName: string;
  freeShipping: boolean;
}

// Portugal: 3 zonas tarifárias
// Continente, Madeira, Açores
const districtToZone: Record<string, string> = {
  // Continente
  Aveiro: "Continente", Beja: "Continente", Braga: "Continente",
  Bragança: "Continente", "Castelo Branco": "Continente", Coimbra: "Continente",
  Évora: "Continente", Faro: "Continente", Guarda: "Continente",
  Leiria: "Continente", Lisboa: "Continente", Portalegre: "Continente",
  Porto: "Continente", Santarém: "Continente", Setúbal: "Continente",
  "Viana do Castelo": "Continente", "Vila Real": "Continente", Viseu: "Continente",
  // Ilhas
  Madeira: "Madeira",
  Açores: "Açores",
};

// Limiar de portes grátis por zona (EUR)
const freeShippingThresholds: Record<string, number> = {
  Continente: 50,
  Madeira: 75,
  Açores: 75,
};

// Tarifas base (fallback) por zona até integração CTT real
const fallbackRates: Record<string, { base: number; perKg: number; minDays: number; maxDays: number }> = {
  Continente: { base: 4.5, perKg: 0.8, minDays: 1, maxDays: 3 },
  Madeira: { base: 8.5, perKg: 1.5, minDays: 3, maxDays: 7 },
  Açores: { base: 8.5, perKg: 1.5, minDays: 3, maxDays: 7 },
};

export const useShippingZones = () => {
  const { data = [], isLoading } = useQuery({
    queryKey: ["shippingZones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipping_zones")
        .select("*")
        .eq("is_active", true)
        .order("country_name");

      if (error) throw error;
      return data as ShippingZone[];
    },
  });

  return { data, isLoading };
};

export const useShippingRates = (zoneId: string | undefined) => {
  const { data = [], isLoading } = useQuery({
    queryKey: ["shippingRates", zoneId],
    queryFn: async () => {
      if (!zoneId) return [];

      const { data, error } = await supabase
        .from("shipping_rates")
        .select("*")
        .eq("zone_id", zoneId);

      if (error) throw error;
      return data as ShippingRate[];
    },
    enabled: !!zoneId,
  });

  return { data, isLoading };
};

export const useCalculateShipping = (weight: number, zoneId: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ["calculateShipping", weight, zoneId],
    queryFn: async () => {
      if (!zoneId) return null;

      // Get the rate for this zone and weight
      const { data: rates, error } = await supabase
        .from("shipping_rates")
        .select("*")
        .eq("zone_id", zoneId)
        .gte("max_weight", weight)
        .lte("min_weight", weight)
        .limit(1);

      if (error) throw error;

      if (!rates || rates.length === 0) {
        // Get the highest weight tier if no exact match
        const { data: fallbackRates, error: fallbackError } = await supabase
          .from("shipping_rates")
          .select("*")
          .eq("zone_id", zoneId)
          .order("max_weight", { ascending: false })
          .limit(1);

        if (fallbackError) throw fallbackError;
        if (!fallbackRates || fallbackRates.length === 0) return null;

        const rate = fallbackRates[0] as ShippingRate;
        const extraWeight = Math.max(0, weight - rate.min_weight);
        const total = rate.base_rate + extraWeight * (rate.per_kg_rate || 0);

        return {
          total,
          estimated_days_min: rate.estimated_days_min || 5,
          estimated_days_max: rate.estimated_days_max || 10,
        };
      }

      const rate = rates[0] as ShippingRate;
      const extraWeight = Math.max(0, weight - rate.min_weight);
      const total = rate.base_rate + extraWeight * (rate.per_kg_rate || 0);

      return {
        total,
        estimated_days_min: rate.estimated_days_min || 5,
        estimated_days_max: rate.estimated_days_max || 10,
      };
    },
    enabled: !!zoneId && weight > 0,
  });

  return { data, isLoading };
};

// Calcula portes por distrito (PT)
export const calculateShippingByDistrict = async (
  weight: number,
  district: string,
  orderTotal: number = 0
): Promise<ShippingResult | null> => {
  const zoneName = districtToZone[district] || "Continente";
  const threshold = freeShippingThresholds[zoneName] ?? 50;

  if (orderTotal >= threshold) {
    const fb = fallbackRates[zoneName];
    return {
      cost: 0,
      estimatedDays: { min: fb.minDays, max: fb.maxDays },
      zoneName,
      freeShipping: true,
    };
  }

  // Try DB first
  const { data: zones } = await supabase
    .from("shipping_zones")
    .select("id")
    .eq("zone_name", zoneName)
    .eq("is_active", true)
    .limit(1);

  if (zones && zones.length > 0) {
    const { data: rates } = await supabase
      .from("shipping_rates")
      .select("*")
      .eq("zone_id", zones[0].id)
      .gte("max_weight", weight)
      .lte("min_weight", weight)
      .limit(1);
    if (rates && rates.length > 0) {
      const r = rates[0] as ShippingRate;
      const extra = Math.max(0, weight - r.min_weight);
      return {
        cost: r.base_rate + extra * (r.per_kg_rate || 0),
        estimatedDays: { min: r.estimated_days_min || 1, max: r.estimated_days_max || 3 },
        zoneName,
        freeShipping: false,
      };
    }
  }

  // Fallback estático (tabela tarifária base por zona PT)
  const fb = fallbackRates[zoneName];
  const extra = Math.max(0, weight - 1);
  return {
    cost: fb.base + extra * fb.perKg,
    estimatedDays: { min: fb.minDays, max: fb.maxDays },
    zoneName,
    freeShipping: false,
  };
};

// Alias para retro-compatibilidade
export const calculateShippingByState = calculateShippingByDistrict;

export const getFreeShippingThreshold = (district: string): number => {
  const zoneName = districtToZone[district] || "Continente";
  return freeShippingThresholds[zoneName] ?? 50;
};

// Lista de distritos PT (mantida em src/utils/countries.ts como PT_DISTRICTS)
