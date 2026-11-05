import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { completeKits } from "@/lib/kitPricing";
import { useFeature } from "@/hooks/useFeatures";
import { subscriptionUnit } from "@/lib/subscriptions";
import { rentalUnitPrice } from "@/lib/rentals";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { effectiveUnitPrice, VolumeTier, AppliedTier } from "@/utils/tierPricing";
import { getEffectiveBasePrice, getProductPromo } from "@/utils/promo";
import { listPendingKeys, delPending } from "@/utils/pendingDesigns";
import { prepareCartSelection, type CartSelectionItem } from "@/lib/cartSelection";
import { isLegacyRollProduct } from "@/lib/legacyRolls";
import { groupUnitPrice } from "@/lib/customerGroups";
import { useMyGroupPricing } from "@/hooks/useCustomerGroups";
import { useMessages } from "@/i18n";
import { cartMessages } from "@/i18n/cart";

import { getVatRate } from "@/utils/pricing";
import { cartHolderToken } from "@/lib/cartHolder";
import { lineStock } from "@/lib/cartStock";
import { CART_STOCK_KEY } from "@/hooks/useCartStock";

/** Aluguel (design_data.rental.periods): o preço da linha é o preço por período x períodos (o servidor recalcula pelas datas). */
const rentalPeriodsOf = (design: any) => {
  const n = Math.floor(Number(design?.rental?.periods));
  return design?.rental && n > 0 ? n : 1;
};
/**
 * Remove guest_cart entries that are DTF/configurator items but obviously
 * broken (no length, or no matching pending file in IndexedDB on this device).
 * Runs synchronously against localStorage after an async IDB probe.
 * Returns the list of removed cart entries (for logging / undo hooks).
 */
export async function pruneOrphanGuestCart(): Promise<any[]> {
  if (typeof window === "undefined") return [];
  let cart: any[] = [];
  try { cart = JSON.parse(localStorage.getItem("guest_cart") || "[]"); } catch { return []; }
  if (!Array.isArray(cart) || cart.length === 0) return [];
  let idbKeys = new Set<string>();
  try { idbKeys = new Set(await listPendingKeys()); } catch { /* IDB blocked → keep everything */ return []; }
  const removed: any[] = [];
  const kept = cart.filter((it: any) => {
    const key = it?.design_data?.cartItemKey;
    if (!key) return true; // not a configurator item
    const len = Number(it?.length_m ?? it?.design_data?.totalMeters ?? 0);
    const hasBlob = idbKeys.has(key);
    // Hard orphan: no blob AND (length is zero OR readyForCheckout not set).
    if (!hasBlob && (len <= 0 || it?.design_data?.readyForCheckout !== true)) {
      removed.push(it);
      return false;
    }
    return true;
  });
  if (removed.length > 0) {
    localStorage.setItem("guest_cart", JSON.stringify(kept));
    window.dispatchEvent(new Event("guest_cart_updated"));
    // Best-effort IDB cleanup for keys we just dropped.
    for (const r of removed) {
      const k = r?.design_data?.cartItemKey;
      if (k) { try { await delPending(k); } catch { /* ignore */ } }
    }
  }
  return removed;
}

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  variation_id?: string;
  size_label?: string;
  design_data?: any;
  products: {
    id: string;
    name: string;
    image: string;
    price: number;
    weight?: number;
    stock_quantity?: number;
  };
  product_variations?: {
    id: string;
    name: string;
    image_url: string;
    color_hex: string;
  };
}

export type { CartItem };

/** O produto esgotou (ou há menos unidades do que o carrinho pediria): nada é gravado. left = unidades que ainda há. */
export class CartStockError extends Error {
  constructor(public left: number) { super("out_of_stock"); }
}

type AddLine = { productId: string; quantity?: number; sizeLabel?: string; designData?: any };

/**
 * Antes de gravar: o carrinho atual mais as linhas novas cabem no estoque? Mesma conta do carrinho (RPC cart_stock_check
 * sem reservar + lineStock). Sem resposta do banco não barra: o carrinho e o create-order voltam a conferir.
 */
async function assertStock(current: any[], adds: AddLine[]) {
  const line = (productId: string, quantity: number, design: any) => ({ product_id: String(productId), quantity: Math.max(0, Math.floor(Number(quantity) || 0)), design_data: design ?? null });
  const lines = [
    ...current.map((i) => line(i.product_id ?? i.productId, i.quantity, i.design_data)),
    ...adds.map((a) => line(a.productId, a.quantity ?? 1, a.sizeLabel && !a.designData?.size ? { ...(a.designData ?? {}), size: a.sizeLabel } : a.designData)),
  ];
  const { data, error } = await (supabase as any).rpc("cart_stock_check", { _items: lines, _holder_token: cartHolderToken(), _reserve: false });
  if (error || !data || !Array.isArray(data.lines)) return;
  const stock = lineStock(lines, data.lines);
  const bad = stock.findIndex((st, i) => i >= current.length && st.state !== "ok");
  // left = todo o estoque livre desta linha (o que o carrinho já leva dele conta).
  if (bad >= 0) throw new CartStockError(Math.max(0, Math.floor(Number(data.lines[bad]?.available) || 0)));
}

export const useCart = (userId: string | undefined) => {
  const queryClient = useQueryClient();
  const { t } = useMessages(cartMessages);
  // Bump to force re-render when guest cart changes in localStorage
  const [guestBump, setGuestBump] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setGuestBump((n) => n + 1);
    window.addEventListener("guest_cart_updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("guest_cart_updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // Unified cart items (authenticated + guest)
  const { data: authCartItems = [], isLoading: isAuthLoading } = useQuery({
    queryKey: ["cart", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("cart_items")
        .select(`
          id,
          product_id,
          quantity,
          variation_id,
          size_label,
          design_data,
          products (
            id,
            name,
            image,
            price,
            weight,
            stock_quantity,
            vat_rate,
            unit_type,
            price_per_meter,
            promo_active,
            promo_type,
            promo_value,
            promo_label,
            promo_starts_at,
            promo_ends_at,
            promo_show_countdown
          ),
          product_variations (
            id,
            name,
            image_url,
            color_hex
          )
        `)
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching cart:", error);
        throw error;
      }

      return (data || []) as CartItem[];
    },
    enabled: !!userId,
  });

  // Guest cart state (synced with localStorage)
  const getGuestCart = () => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem("guest_cart");
    try {
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const guestItems = getGuestCart();
  // Reference guestBump so React tracks it as a dep of this render
  void guestBump;
  const mapGuest = (item: any, idx: number) => {
    const designKey = item?.design_data?.cartItemKey ? `-${item.design_data.cartItemKey}` : "";
    const isDtf = !!item?.design_data?.cartItemKey;
    const len = Number(item?.length_m ?? item?.design_data?.totalMeters ?? 0);
    let invalidReason: string | null = null;
    if (isDtf) {
      if (len <= 0) invalidReason = "zero_length";
      else if (item?.design_data?.readyForCheckout !== true) invalidReason = "not_ready";
    }
    return {
      id: `guest-${item.productId}-${item.variation || ""}-${item.size || ""}${designKey}-${idx}`,
      product_id: item.productId,
      quantity: item.quantity,
      variation_id: item.variationId,
      size_label: item.size,
      design_data: item.design_data || { variation: item.variation, size: item.size, color: item.color },
      length_m: item.length_m,
      _guestIndex: idx,
      _invalidReason: invalidReason,
      products: {
        id: item.productId,
        name: item.name,
        image: item.image,
        price: item.price,
        weight: item.weight || 0.5,
        stock_quantity: 99,
        vat_rate: item.vat_rate ?? getVatRate(),
      },
    } as any;
  };
  // Authenticated users still see guest-cart items (e.g. configurator/DTF items
  // added before sign-in or pushed directly to localStorage by the configurator).
  const mappedGuest = guestItems.map(mapGuest);
  const cartItems = userId ? [...authCartItems, ...mappedGuest] : mappedGuest;

  // Volume tiers for every product in the cart (auth + guest).
  // Used to compute the effective per-unit / per-meter price for unit-based
  // products. Per-meter (DTF) items already arrive from the configurator with
  // a pre-computed total, so tiers don't change their price.
  const productIds = Array.from(new Set(cartItems.map((i: any) => i.product_id).filter(Boolean)));
  const { data: tiersByProduct = {} } = useQuery<Record<string, VolumeTier[]>>({
    queryKey: ["cart-volume-tiers", productIds.sort().join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_volume_tiers")
        .select("product_id, min_meters, price_per_meter, label")
        .in("product_id", productIds);
      if (error) throw error;
      const map: Record<string, VolumeTier[]> = {};
      (data || []).forEach((t: any) => {
        (map[t.product_id] ||= []).push({
          min_meters: Number(t.min_meters),
          price_per_meter: Number(t.price_per_meter),
          label: t.label,
        });
      });
      return map;
    },
  });

  // Grupo do cliente (Admin > Grupos de clientes): tabela de preço e desconto. A mesma conta do servidor
  // (src/lib/customerGroups.ts); sem sessão ou com o recurso desligado não há grupo.
  const { data: groupPricing = { group: null, prices: [] } } = useMyGroupPricing(userId ? (productIds as string[]) : []);

  // Kits whose products are all in the cart (only those get the kit discount). Recurso kits desligado = sem desconto, como no servidor.
  const kitsOn = useFeature('kits');
  const kitComplete = !kitsOn ? new Set<string>() : completeKits(cartItems.map((i: any) => ({ product_id: String(i.product_id), quantity: Number(i.quantity) || 0, kit: i.design_data?.kit })));

  // Per-item pricing snapshot: single source of truth for cart, checkout and
  // the order payload. Mutates each item in-place with `_pricing`.
  const itemPricing = (item: any): {
    basePrice: number;
    rawBasePrice: number;
    promoActive: boolean;
    unitPrice: number;
    lineTotal: number;
    appliedTier: AppliedTier | null;
    isMeterBundle: boolean;
    /** Verification-fee net amount (per line), shown separately + VAT added in summaries. */
    verificationNet: number;
    /** Kept for backward-compat (no longer used; verification is taxable now). */
    nonTaxableExtra: number;
    /** Preço do grupo do cliente (tabela ou desconto) aplicado nesta linha. */
    groupPrice?: boolean;
  } => {
    // Promo: when active, the promotional price becomes the new base and
    // variations are added on top. For meter/DTF bundle items the configurator
    // already computed the total, so we don't override the price here.
    const rawBasePrice = Number(item.products?.price || 0);
    const effectiveBase = getEffectiveBasePrice(item.products);
    const selection = item.design_data?.selectionPricing;
    const hasSelectionPrice = selection?.version === 1 && Number.isFinite(selection.basePrice) && Number.isFinite(selection.modifier);
    const basePrice = hasSelectionPrice ? selection.basePrice : effectiveBase > 0 ? effectiveBase : rawBasePrice;
    const promo = getProductPromo(item.products);
    const promoActive = !!promo?.isActive;
    const design = item.design_data || {};
    // Proposta de orçamento (design_data.quote): o preço combinado, que o servidor confere em priceItems.
    if (design.quote && Number.isFinite(Number(design.quote.unit))) {
      const quoteUnit = Math.max(0, Number(design.quote.unit));
      return {
        basePrice: quoteUnit, rawBasePrice, promoActive: false, unitPrice: quoteUnit, lineTotal: quoteUnit * (item.quantity || 0),
        appliedTier: null, isMeterBundle: false, verificationNet: 0, nonTaxableExtra: 0, groupPrice: false,
      };
    }
    // A configuração do cliente é uma linha própria: o valor confirmado já
    // inclui os adicionais das áreas e não deve voltar à promoção/tabela geral.
    if (design.customization && typeof design.price === "number" && Number.isFinite(design.price) && design.price >= 0) {
      const group = groupUnitPrice(groupPricing, { productId: String(item.product_id), quantity: item.quantity || 0, base: design.price, modifier: 0, customized: true });
      // Assinatura (design_data.subscription.pct): o mesmo desconto que o servidor confere em priceItems.
      const customUnit = rentalUnitPrice(subscriptionUnit(group.unit, Number(design.subscription?.pct || 0)), rentalPeriodsOf(design));
      return {
        basePrice: customUnit - Math.max(0, Number(design.customization.addon || 0)),
        rawBasePrice,
        promoActive: false,
        unitPrice: customUnit,
        lineTotal: customUnit * (item.quantity || 0),
        appliedTier: null,
        isMeterBundle: false,
        verificationNet: 0,
        nonTaxableExtra: 0,
        groupPrice: group.source !== "catalog",
      };
    }
    // DTF / configurator items are stored as a single "bundle" line where
    // `price` is already the configurator total and quantity is 1.
    const isMeterBundle = isLegacyRollProduct(item.products?.unit_type, item.products?.price_per_meter);
    if (isMeterBundle) {
      const qty = item.quantity || 1;
      const verificationExtra = Math.max(0, Number(design?.verificationTotal || 0)) * qty;
      const bundleTotal = basePrice * qty;
      // The configurator historically baked the verification fee into `price`.
      // Surface it as a separate line and keep the printing total clean.
      const lineTotal = Math.max(0, bundleTotal - verificationExtra);
      return {
        basePrice,
        rawBasePrice,
        promoActive,
        unitPrice: basePrice,
        lineTotal,
        appliedTier: null,
        isMeterBundle: true,
        verificationNet: verificationExtra,
        nonTaxableExtra: 0,
      };
    }
    const rawTiers = tiersByProduct[item.product_id] || [];
    // When promo is active, apply the same proportional discount to every tier
    // price so that the volume table shown to the customer matches what the
    // cart actually charges.
    const ratio = hasSelectionPrice && Number.isFinite(selection.tierRatio) ? selection.tierRatio : promoActive && rawBasePrice > 0 ? basePrice / rawBasePrice : 1;
    const tiers = ratio === 1
      ? rawTiers
      : rawTiers.map((t: any) => ({ ...t, price_per_meter: Number(t.price_per_meter) * ratio }));
    const { unit: baseUnit, tier } = effectiveUnitPrice(basePrice, item.quantity || 0, tiers);
    const kit = item.design_data?.kit;
    const group = groupUnitPrice(groupPricing, { productId: String(item.product_id), quantity: item.quantity || 0, base: baseUnit, modifier: hasSelectionPrice ? selection.modifier : 0 });
    const unit = rentalUnitPrice(subscriptionUnit(group.unit * (kit?.id && kitComplete.has(kit.id) ? 1 - Number(kit.pct || 0) : 1), Number(design.subscription?.pct || 0)), rentalPeriodsOf(design));
    return {
      basePrice,
      rawBasePrice,
      promoActive,
      unitPrice: unit,
      lineTotal: unit * (item.quantity || 0),
      appliedTier: tier,
      isMeterBundle: false,
      verificationNet: 0,
      nonTaxableExtra: 0,
      groupPrice: group.source !== "catalog",
    };
  };

  const cartItemsWithPricing = cartItems.map((item: any) => ({
    ...item,
    _pricing: itemPricing(item),
  }));
  // Invalid guest DTF items (missing file / zero length) must NOT contribute
  // to totals; they show a "Refazer / Remover" block in the UI instead.
  const validForTotals = cartItemsWithPricing.filter((it: any) => !it?._invalidReason);

  // Esgotou entre mostrar e clicar: os cartões e o carrinho voltam a ler o estoque.
  const stockToast = (e: CartStockError) => {
    void queryClient.invalidateQueries({ queryKey: [CART_STOCK_KEY] });
    toast.error(e.left > 0 ? t(e.left === 1 ? "toastStockLeft_one" : "toastStockLeft_other", { count: e.left }) : t("toastSoldOut"));
  };

  // Add to cart mutation
  const addToCartMutation = useMutation({
    mutationFn: async ({ 
      productId, 
      quantity = 1, 
      variationId, 
      sizeLabel, 
      designData 
    }: { 
      productId: string; 
      quantity?: number; 
      variationId?: string; 
      sizeLabel?: string; 
      designData?: any 
    }) => {
      await assertStock(cartItems, [{ productId, quantity, sizeLabel, designData }]);
      if (!userId) {
        // Handle guest cart
        const guestCart = getGuestCart();
        const existing = guestCart.find((i: any) => 
          !designData?.customization && !i.design_data?.customization &&
          !designData?.subscription && !i.design_data?.subscription &&
          !designData?.rental && !i.design_data?.rental &&
          (designData?.kit?.id ?? null) === (i.design_data?.kit?.id ?? null) &&
          i.productId === productId && 
          i.variationId === variationId && 
          i.size === sizeLabel
        );

        if (existing) {
          existing.quantity += quantity;
        } else {
          // We need product info for guest cart - usually passed from product page
          // If not passed, we might need to fetch it, but for now we assume it's handled by the caller or uses defaults
          guestCart.push({
            productId,
            quantity,
            variationId,
            size: sizeLabel,
            design_data: designData,
            // These would normally be provided by the caller if they have it
            name: designData?.name || "Produto",
            image: designData?.image || "",
            price: designData?.price || 0,
            weight: designData?.weight || 0.5
          });
        }
        localStorage.setItem("guest_cart", JSON.stringify(guestCart));
        window.dispatchEvent(new Event("guest_cart_updated"));
        return;
      }

      // Check if item already exists in cart with same variation and size
      let query = supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("user_id", userId)
        .eq("product_id", productId);

      if (variationId) query = query.eq("variation_id", variationId);
      else query = query.is("variation_id", null);

      if (sizeLabel) query = query.eq("size_label", sizeLabel);
      else query = query.is("size_label", null);

      // A kit line only merges with a line of the same kit; a normal line never merges into a kit line.
      if (designData?.kit?.id) query = query.eq("design_data->kit->>id", String(designData.kit.id));
      else query = query.is("design_data->kit", null);
      // Linha de assinatura nunca se junta a outra (nem uma linha normal a ela).
      query = query.is("design_data->subscription", null).is("design_data->rental", null).is("design_data->quote", null);

      const { data: existing } = designData?.customization || designData?.subscription || designData?.rental ? { data: null } : await query.maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("cart_items")
          .update({ quantity: existing.quantity + quantity })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cart_items")
          .insert({
            user_id: userId,
            product_id: productId,
            variation_id: variationId,
            size_label: sizeLabel,
            quantity,
            design_data: designData,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      if (userId) queryClient.invalidateQueries({ queryKey: ["cart", userId] });
      toast.success(t("toastAdded"));
    },
    onError: (error) => {
      if (error instanceof CartStockError) { stockToast(error); return; }
      console.error("Error adding to cart:", error);
      toast.error(error instanceof DOMException && error.name === "QuotaExceededError"
        ? t("toastQuota")
        : t("toastAddError"));
    },
  });

  // One write for a multi-size selection: no partially saved personalized batch.
  const addSelectionMutation = useMutation({
    mutationFn: async (items: CartSelectionItem[]) => {
      const prepared = prepareCartSelection(items);
      await assertStock(cartItems, items);
      if (!userId) {
        const rows = items.map(i => ({ productId: i.productId, quantity: i.quantity, variationId: i.variationId, size: i.sizeLabel,
          design_data: i.designData, name: i.designData.name, image: i.designData.image, price: i.designData.price, weight: i.designData.weight || 0.5 }));
        localStorage.setItem("guest_cart", JSON.stringify([...getGuestCart(), ...rows]));
        window.dispatchEvent(new Event("guest_cart_updated"));
      } else {
        const { error } = await supabase.from("cart_items").insert(prepared.map(i => ({ user_id: userId, ...i })));
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cart", userId] }); toast.success(t("toastSelectionAdded")); },
    onError: (error) => (error instanceof CartStockError ? stockToast(error) : toast.error(t("toastSelectionError"))),
  });

  // Bulk add to cart (e.g. for kits)
  const addItemsMutation = useMutation({
    mutationFn: async (items: Array<{
      productId: string;
      quantity?: number;
      variationId?: string;
      sizeLabel?: string;
      designData?: any;
    }>) => {
      await assertStock(cartItems, items);
      if (!userId) {
        const guestCart = getGuestCart();
        items.forEach(item => {
          const existing = guestCart.find((i: any) => 
            !item.designData?.customization && !i.design_data?.customization &&
            !item.designData?.subscription && !i.design_data?.subscription &&
            !item.designData?.rental && !i.design_data?.rental &&
            (item.designData?.kit?.id ?? null) === (i.design_data?.kit?.id ?? null) &&
            i.productId === item.productId && 
            i.variationId === item.variationId && 
            i.size === item.sizeLabel
          );
          if (existing) {
            existing.quantity += (item.quantity || 1);
          } else {
            guestCart.push({
              productId: item.productId,
              quantity: item.quantity || 1,
              variationId: item.variationId,
              size: item.sizeLabel,
              design_data: item.designData,
              name: item.designData?.name || "Produto",
              image: item.designData?.image || "",
              price: item.designData?.price || 0,
              weight: item.designData?.weight || 0.5
            });
          }
        });
        localStorage.setItem("guest_cart", JSON.stringify(guestCart));
        window.dispatchEvent(new Event("guest_cart_updated"));
        return;
      }

      // Authenticated bulk add
      for (const item of items) {
        // We do this sequentially to handle existing items correctly
        // A more optimized approach would be a single RPC call
        await addToCartMutation.mutateAsync(item);
      }
    },
    onSuccess: () => {
      if (userId) queryClient.invalidateQueries({ queryKey: ["cart", userId] });
      toast.success(t("toastItemsAdded"));
    },
    onError: (error) => { if (error instanceof CartStockError) stockToast(error); },
  });

  // Remove from cart mutation
  const removeFromCartMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // Guest-cart items always live in localStorage, even when the user is
      // signed in (the configurator pushes directly to guest_cart).
      if (itemId.startsWith("guest-")) {
        const guestCart = getGuestCart();
        const parts = itemId.split("-");
        const idx = Number(parts[parts.length - 1]);
        const updated = Number.isFinite(idx)
          ? guestCart.filter((_: any, i: number) => i !== idx)
          : guestCart;
        localStorage.setItem("guest_cart", JSON.stringify(updated));
        window.dispatchEvent(new Event("guest_cart_updated"));
        return;
      }

      const { error } = await supabase
        .from("cart_items")
        .delete()
        .eq("id", itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) queryClient.invalidateQueries({ queryKey: ["cart", userId] });
      // id fixo: a página e a gaveta do carrinho trocam este aviso por um com "Desfazer"
      toast.success(t("toastRemoved"), { id: "cart-item-removed" });
    },
  });

  // Update quantity mutation
  const updateQuantityMutation = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      if (quantity < 1) throw new Error("Quantity must be at least 1");
      // Linha de orçamento: a quantidade é a da proposta (o servidor recusa outra).
      if ((cartItems as any[]).some((i) => i.id === itemId && i.design_data?.quote)) return;

      if (itemId.startsWith("guest-")) {
        const guestCart = getGuestCart();
        const parts = itemId.split("-");
        const idx = Number(parts[parts.length - 1]);
        if (Number.isFinite(idx) && guestCart[idx]) {
          guestCart[idx].quantity = quantity;
          localStorage.setItem("guest_cart", JSON.stringify(guestCart));
          window.dispatchEvent(new Event("guest_cart_updated"));
        }
        return;
      }

      const { error } = await supabase
        .from("cart_items")
        .update({ quantity })
        .eq("id", itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) queryClient.invalidateQueries({ queryKey: ["cart", userId] });
    },
  });

  // Clear cart mutation
  const clearCartMutation = useMutation({
    mutationFn: async () => {
      // Always clear local guest cart as well
      localStorage.removeItem("guest_cart");
      window.dispatchEvent(new Event("guest_cart_updated"));
      if (!userId) return;
      const { error } = await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) queryClient.invalidateQueries({ queryKey: ["cart", userId] });
    },
  });

  // Calculate totals (using tier-aware per-item pricing)
  const itemCount = validForTotals.reduce((sum: number, item: any) => sum + item.quantity, 0);
  const subtotal = validForTotals.reduce(
    (sum: number, item: any) => sum + (item._pricing?.lineTotal || 0),
    0,
  );
  const vatTotal = validForTotals.reduce((sum: number, item: any) => {
    const rate = getVatRate(item.products?.vat_rate);
    const lineTotal = item._pricing?.lineTotal || 0;
    const verification = item._pricing?.verificationNet || 0;
    // Both printing line and verification service are taxable.
    return sum + (lineTotal + verification) * (rate / 100);
  }, 0);
  const verificationSubtotal = validForTotals.reduce(
    (sum: number, item: any) => sum + (item._pricing?.verificationNet || 0),
    0,
  );
  const verificationVat = validForTotals.reduce((sum: number, item: any) => {
    const rate = getVatRate(item.products?.vat_rate);
    return sum + (item._pricing?.verificationNet || 0) * (rate / 100);
  }, 0);
  const totalWeight = validForTotals.reduce((sum: number, item: any) => {
    const weight = item.products?.weight || 0.5;
    return sum + weight * item.quantity;
  }, 0);

  return {
    cartItems: cartItemsWithPricing,
    isLoading: isAuthLoading,
    addToCartAsync: addToCartMutation.mutateAsync,
    addSelectionAsync: addSelectionMutation.mutateAsync,
    addToCart: (params: string | { productId: string; quantity?: number; variationId?: string; sizeLabel?: string; designData?: any }) => {
      if (typeof params === "string") {
        addToCartMutation.mutate({ productId: params });
      } else {
        addToCartMutation.mutate(params);
      }
    },
    addItems: addItemsMutation.mutate,
    removeFromCart: removeFromCartMutation.mutate,
    removeItem: removeFromCartMutation.mutate,
    updateQuantity: updateQuantityMutation.mutate,
    removeFromCartAsync: removeFromCartMutation.mutateAsync,
    updateQuantityAsync: updateQuantityMutation.mutateAsync,
    clearCart: clearCartMutation.mutate,
    itemCount,
    subtotal,
    vatTotal,
    verificationSubtotal,
    verificationVat,
    total: subtotal + verificationSubtotal + vatTotal,
    totalWeight,
    isAddingToCart: addToCartMutation.isPending || addItemsMutation.isPending || addSelectionMutation.isPending,
  };
};
