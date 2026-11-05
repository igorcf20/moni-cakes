import { kitCartItems } from "@/lib/kitPricing";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gift, ShoppingBag, Package, ArrowRight } from "lucide-react";
import { formatPrice } from "@/utils/currency";
import { Link } from "react-router-dom";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/use-currency";
import { toast } from "sonner";

const KitImageGrid = ({ items }: { items: any[] }) => {
  const images = items.filter((i) => i.products?.image).slice(0, 4);
  const count = images.length;

  if (count === 0) {
    return (
      <div className="w-full aspect-square bg-muted rounded-xl flex items-center justify-center">
        <Package className="h-12 w-12 text-muted-foreground/30" />
      </div>
    );
  }

  if (count === 1) {
    return (
      <div className="w-full aspect-square rounded-xl overflow-hidden">
        <img src={images[0].products.image} alt={images[0].products.name} className="w-full h-full object-cover" />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="w-full aspect-square rounded-xl overflow-hidden grid grid-cols-2 gap-0.5">
        {images.map((item, i) => (
          <div key={i} className="overflow-hidden">
            <img src={item.products.image} alt={item.products.name} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="w-full aspect-square rounded-xl overflow-hidden grid grid-cols-2 gap-0.5">
        <div className="row-span-2 overflow-hidden">
          <img src={images[0].products.image} alt={images[0].products.name} className="w-full h-full object-cover" />
        </div>
        <div className="overflow-hidden">
          <img src={images[1].products.image} alt={images[1].products.name} className="w-full h-full object-cover" />
        </div>
        <div className="overflow-hidden">
          <img src={images[2].products.image} alt={images[2].products.name} className="w-full h-full object-cover" />
        </div>
      </div>
    );
  }

  // 4 images
  return (
    <div className="w-full aspect-square rounded-xl overflow-hidden grid grid-cols-2 gap-0.5">
      {images.map((item, i) => (
        <div key={i} className="overflow-hidden">
          <img src={item.products.image} alt={item.products.name} className="w-full h-full object-cover" />
        </div>
      ))}
    </div>
  );
};

const KitsSection = () => {
  const { user } = useAuth();
  const { addItems } = useCart(user?.id);
  const { currentCurrency, convert } = useCurrency();

  const { data: kits = [], isLoading } = useQuery({
    queryKey: ["home-kits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kits")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: kitItemsMap = {} } = useQuery({
    queryKey: ["home-kit-items"],
    enabled: kits.length > 0,
    queryFn: async () => {
      const { data: items, error } = await supabase.from("kit_items").select("*");
      if (error) throw error;

      const productIds = [...new Set((items || []).map((i) => i.product_id))];
      const { data: products } = await supabase
        .from("products")
        .select("id, name, price, image")
        .in("id", productIds);

      const productMap: Record<string, any> = {};
      (products || []).forEach((p) => { productMap[p.id] = p; });

      const map: Record<string, any[]> = {};
      (items || []).forEach((item) => {
        if (!map[item.kit_id]) map[item.kit_id] = [];
        map[item.kit_id].push({ ...item, products: productMap[item.product_id] || null });
      });
      return map;
    },
  });

  const getKitPrices = (kit: any) => {
    const items = kitItemsMap[kit.id] || [];
    const originalTotalBRL = items.reduce(
      (sum: number, item: any) => sum + (item.products?.price || 0) * item.quantity,
      0
    );
    const discountBRL =
      kit.discount_type === "percentage"
        ? originalTotalBRL * (kit.discount_value / 100)
        : kit.discount_value;
    
    return { 
      originalTotal: convert(originalTotalBRL), 
      finalPrice: convert(Math.max(0, originalTotalBRL - discountBRL)), 
      discount: convert(discountBRL),
      discountValueBRL: kit.discount_value
    };
  };

  if (!isLoading && kits.length === 0) return null;

  return (
    <section className="py-14 md:py-20 bg-background border-y border-border/20">
      <div className="container mx-auto px-4">
        {/* Header — editorial */}
        <div className="text-center space-y-3 mb-12">
          <div className="flex items-center justify-center gap-3">
            <span className="hidden sm:block h-px w-10 bg-primary/50" />
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-primary inline-flex items-center gap-2">
              <Gift className="h-3.5 w-3.5" /> Combos exclusivos
            </p>
            <span className="hidden sm:block h-px w-10 bg-primary/50" />
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-light">
            Kits <span className="italic text-primary">especiais</span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">Conjuntos de brindes com desconto, prontos a personalizar com a sua marca.</p>
          <Link
            to="/kits"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.2em] text-primary hover:gap-2 transition-all font-medium pt-2"
          >
            Ver todos <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-muted animate-pulse aspect-[3/4]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-fade-in">
            {kits.map((kit: any) => {
              const items = kitItemsMap[kit.id] || [];
              const { originalTotal, finalPrice, discount, discountValueBRL } = getKitPrices(kit);
              const discountLabel =
                kit.discount_type === "percentage"
                  ? `${kit.discount_value}% OFF`
                  : `${formatPrice(convert(discountValueBRL), currentCurrency)} OFF`;

              return (
                <Card
                  key={kit.id}
                  className="overflow-hidden border-border/50 hover:border-primary/30 hover:shadow-hover transition-all duration-300 bg-card group"
                >
                  {/* Image collage */}
                  <div className="relative p-3 pb-2">
                    <Badge className="absolute top-5 left-5 z-10 bg-primary text-primary-foreground font-bold text-xs px-2.5 py-1 shadow-md">
                      {discountLabel}
                    </Badge>
                    <KitImageGrid items={items} />
                  </div>

                  {/* Info */}
                  <CardContent className="px-4 pb-4 pt-2 space-y-3">
                    {/* Name + description */}
                    <div>
                      <h3 className="font-bold text-base leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                        {kit.name}
                      </h3>
                      {kit.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{kit.description}</p>
                      )}
                    </div>

                    {/* Item name list */}
                    {items.length > 0 && (
                      <ul className="space-y-1">
                        {items.map((item: any, idx: number) => (
                          <li key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                            <span className="truncate">{item.products?.name || "Produto"}</span>
                            {item.quantity > 1 && (
                              <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                x{item.quantity}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Price + CTA */}
                    <div className="flex items-end justify-between pt-1 border-t border-border/40">
                      <div>
                        {originalTotal > 0 && (
                          <p className="text-[11px] text-muted-foreground line-through leading-none mb-0.5">
                            {formatPrice(originalTotal, currentCurrency)}
                          </p>
                        )}
                        <p className="text-xl font-bold text-primary leading-none">{formatPrice(finalPrice, currentCurrency)}</p>
                        {discount > 0 && (
                          <p className="text-[11px] text-primary/70 font-medium mt-0.5">
                            Economize {formatPrice(discount, currentCurrency)}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="h-9 text-xs"
                        onClick={() => {
                          const lines = kitCartItems(kit, items);
                          if (lines.length) addItems(lines);
                        }}
                      >
                        <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
                        Comprar Kit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Mobile CTA */}
        <div className="sm:hidden text-center mt-6">
          <Link to="/kits" className="text-sm text-primary font-medium hover:underline inline-flex items-center gap-1">
            Ver todos os kits <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default KitsSection;
