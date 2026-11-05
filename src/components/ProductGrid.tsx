import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ProductCard from "./ProductCard";
import ProductFilter from "./ProductFilter";
import SortDropdown from "./SortDropdown";
import SkeletonProductCard from "./SkeletonProductCard";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, Grid3X3, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import Reveal from "@/components/Reveal";

const TAG_LABELS: Record<string, string> = {
  destaques: "Destaques",
  promocoes: "Promoções",
};

const ProductGrid = () => {
  const [searchParams] = useSearchParams();
  const activeTag = searchParams.get("tag") || "";
  const searchQuery = searchParams.get("q") || "";

  const { data: allProducts = [], isLoading: loadingProducts } = useQuery<any[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      const productIds = (data || []).map((p: any) => p.id);
      const tiersByProduct: Record<string, number> = {};
      const variationModByProduct: Record<string, number> = {};
      const colorsByProduct: Record<string, string[]> = {};
      const sizesByProduct: Record<string, string[]> = {};
      if (productIds.length > 0) {
        const [{ data: tiers }, { data: vars }, { data: szs }] = await Promise.all([
          (supabase as any)
            .from("product_volume_tiers")
            .select("product_id,price_per_meter")
            .in("product_id", productIds),
          (supabase as any)
            .from("product_variations")
            .select("product_id,price_modifier,name")
            .eq("is_active", true)
            .in("product_id", productIds),
          (supabase as any)
            .from("product_sizes")
            .select("product_id,size_label")
            .eq("is_active", true)
            .in("product_id", productIds),
        ]);
        (tiers || []).forEach((t: any) => {
          const v = Number(t.price_per_meter);
          if (!Number.isFinite(v)) return;
          if (tiersByProduct[t.product_id] === undefined || v < tiersByProduct[t.product_id]) {
            tiersByProduct[t.product_id] = v;
          }
        });
        (vars || []).forEach((v: any) => {
          const m = Number(v.price_modifier) || 0;
          if (variationModByProduct[v.product_id] === undefined || m < variationModByProduct[v.product_id]) {
            variationModByProduct[v.product_id] = m;
          }
          if (v.name) {
            (colorsByProduct[v.product_id] ||= []).push(v.name);
          }
        });
        (szs || []).forEach((s: any) => {
          if (s.size_label) (sizesByProduct[s.product_id] ||= []).push(s.size_label);
        });
      }
      return data.map((product: any) => ({
        id: product.id,
        image: product.image,
        title: product.name,
        price: product.price,
        description: product.description,
        category: product.category.toLowerCase(),
        categoryLabel: product.category,
        material: product.material || "",
        materials: product.materials || [],
        colors: colorsByProduct[product.id] || [],
        sizes: sizesByProduct[product.id] || [],
        isNew: !!product.is_new,
        isBestseller: product.sales_count > 50,
        stock_quantity: product.stock_quantity,
        is_featured: product.is_featured,
        sales_count: product.sales_count,
        created_at: product.created_at,
        unit_type: "unit",
        price_per_meter: null,
        min_price: (() => {
          const base = Number(product.price) || 0;
          const withMod = base + (variationModByProduct[product.id] ?? 0);
          const tierMin = tiersByProduct[product.id];
          if (tierMin !== undefined) return Math.min(withMod, tierMin);
          return withMod;
        })(),
        has_variants:
          variationModByProduct[product.id] !== undefined || tiersByProduct[product.id] !== undefined,
        vat_rate: product.vat_rate,
        customizable: product.customizable !== false,
        slug: product.slug,
        promo_active: product.promo_active,
        promo_type: product.promo_type,
        promo_value: product.promo_value,
        promo_label: product.promo_label,
        promo_starts_at: product.promo_starts_at,
        promo_ends_at: product.promo_ends_at,
        promo_show_countdown: product.promo_show_countdown,
        display_order: product.display_order,
        category_display_order: product.category_display_order,
        featured_display_order: product.featured_display_order,
      }));
    },
  });

  // Fetch product IDs linked to categories with the "promocoes" tag
  const { data: promoProductIds, isLoading: loadingPromo } = useQuery<string[]>({
    queryKey: ["promo-product-ids"],
    enabled: activeTag === "promocoes",
    queryFn: async () => {
      const { data: cats, error: catErr } = await (supabase as any)
        .from("categories")
        .select("id")
        .contains("tags", ["promocoes"]);
      if (catErr) throw catErr;
      if (!cats || cats.length === 0) return [];
      const catIds = cats.map((c: any) => c.id);
      const { data: pcRows, error: pcErr } = await (supabase as any)
        .from("product_categories")
        .select("product_id")
        .in("category_id", catIds);
      if (pcErr) throw pcErr;
      return (pcRows || []).map((r: any) => r.product_id) as string[];
    },
  });

  const isLoading = loadingProducts || (activeTag === "promocoes" && loadingPromo);

  const tagFilteredProducts = (() => {
    let filtered = allProducts;
    
    if (activeTag === "destaques") {
      filtered = allProducts
        .filter(p => p.is_featured)
        .sort((a, b) => Number(a.featured_display_order ?? a.display_order ?? 0) - Number(b.featured_display_order ?? b.display_order ?? 0));
    } else if (activeTag === "promocoes") {
      if (promoProductIds && promoProductIds.length > 0) {
        filtered = allProducts.filter(p => promoProductIds.includes(p.id));
      } else {
        // Fallback: bestsellers when no promo category is configured
        filtered = allProducts.filter(p => p.isBestseller);
      }
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(q) || 
        p.description?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    }
    
    return filtered;
  })();

  const [filteredProducts, setFilteredProducts] = useState(tagFilteredProducts);
  const prices = allProducts.map(p => p.price);
  const minPriceLimit = Math.floor(prices.length > 0 ? Math.min(...prices) : 0);
  const maxPriceLimit = Math.ceil(prices.length > 0 ? Math.max(...prices) : 500);

  const [sortBy, setSortBy] = useState("relevance");
  const [showFilters, setShowFilters] = useState(false);
  const [gridCols, setGridCols] = useState("3");

  useEffect(() => {
    setFilteredProducts(tagFilteredProducts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProducts, activeTag, searchQuery, promoProductIds]);

  const handleFilterChange = (filters: any) => {
    let filtered = [...tagFilteredProducts];


    // Free-text search in the filters panel (accent- and case-insensitive, every word must match).
    const text = String(filters.search || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (text) {
      const words = text.split(/\s+/);
      filtered = filtered.filter((p) => {
        const hay = [p.title, p.description, p.category].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }

    if (filters.categories.length > 0) {
      filtered = filtered.filter(p => filters.categories.includes(p.category));
    }

    if (filters.priceRange[0] > minPriceLimit || filters.priceRange[1] < maxPriceLimit) {
      filtered = filtered.filter(p => 
        p.price >= filters.priceRange[0] && p.price <= filters.priceRange[1]
      );
    }

    if (filters.inStock) {
      filtered = filtered.filter(p => p.stock_quantity > 0);
    }

    if (filters.onSale) {
      const now = Date.now();
      filtered = filtered.filter(p => {
        if (!p.promo_active) return false;
        const starts = p.promo_starts_at ? new Date(p.promo_starts_at).getTime() : null;
        const ends = p.promo_ends_at ? new Date(p.promo_ends_at).getTime() : null;
        if (starts && starts > now) return false;
        if (ends && ends <= now) return false;
        return Number(p.promo_value) > 0;
      });
    }

    if (filters.materials && filters.materials.length > 0) {
      filtered = filtered.filter(p =>
        filters.materials.some((m: string) => (p.materials || []).includes(m))
      );
    }

    if (filters.colors && filters.colors.length > 0) {
      filtered = filtered.filter(p =>
        filters.colors.some((c: string) => (p.colors || []).includes(c))
      );
    }

    if (filters.sizes && filters.sizes.length > 0) {
      filtered = filtered.filter(p =>
        filters.sizes.some((s: string) => (p.sizes || []).includes(s))
      );
    }

    if (sortBy === "relevance" && filters.categories.length > 0) {
      filtered.sort((a, b) =>
        Number(a.category_display_order ?? a.display_order ?? 0) -
        Number(b.category_display_order ?? b.display_order ?? 0)
      );
    }

    setFilteredProducts(filtered);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    const sorted = [...filteredProducts];

    switch (value) {
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "name":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "rating":
        sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case "newest":
        sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        break;
      default:
        break;
    }

    setFilteredProducts(sorted);
  };

  const gridClass = gridCols === "3"
    ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
    : "grid-cols-1 sm:grid-cols-2";

  const displayedProducts = filteredProducts;

  if (isLoading) {
    return (
      <section id="produtos" className="py-8 md:py-12 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-6 lg:gap-8">
            <div className="hidden lg:block w-64 xl:w-72 flex-shrink-0">
              <div className="h-96 bg-muted/50 rounded-xl animate-pulse" />
            </div>
            <div className="flex-1">
              <div className={`grid ${gridClass} gap-4`}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonProductCard key={i} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="produtos" className="py-8 md:py-12 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <Reveal as="div" className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-3">
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
              <span className="hidden sm:block h-px w-10 bg-primary/50" />
              <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-light">
                {searchQuery ? (
                  <>Resultados para: <span className="italic text-primary">"{searchQuery}"</span></>
                ) : activeTag && TAG_LABELS[activeTag] ? (
                  <span className="italic text-primary">{TAG_LABELS[activeTag]}</span>
                ) : (
                  <>Nossa <span className="italic text-primary">Coleção</span></>
                )}
              </h2>
              <span className="hidden sm:block h-px w-10 bg-primary/50" />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Grid Layout Toggle - desktop only */}
            <ToggleGroup type="single" value={gridCols} onValueChange={(v) => v && setGridCols(v)} className="hidden md:flex">
              <ToggleGroupItem value="2" aria-label="2 colunas" size="sm">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="3" aria-label="3 colunas" size="sm">
                <Grid3X3 className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Mobile Filter (uses ProductFilter's built-in Sheet trigger) */}
            <div className="lg:hidden">
              <ProductFilter onFilterChange={handleFilterChange} minPriceLimit={minPriceLimit} maxPriceLimit={maxPriceLimit} allPrices={prices} />
            </div>

            <SortDropdown onSortChange={handleSortChange} />
          </div>
        </Reveal>

        {/* Main Content Area */}
        <div className="flex gap-6 lg:gap-8">
          {/* Desktop Sidebar Filter */}
          <div className="hidden lg:block w-64 xl:w-72 flex-shrink-0">
            <ProductFilter onFilterChange={handleFilterChange} minPriceLimit={minPriceLimit} maxPriceLimit={maxPriceLimit} allPrices={prices} />
          </div>

          {/* Products Grid */}
          <div className="flex-1 min-w-0">
            {displayedProducts.length > 0 ? (
              <div className={`grid ${gridClass} gap-3 sm:gap-4 md:gap-5 stagger-fade-in`}>
                {displayedProducts.map((product) => (
                  <ProductCard 
                    key={product.id}
                    {...product}
                    isNew={product.isNew}
                    isBestseller={product.isBestseller}
                    stock_quantity={product.stock_quantity}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 md:py-24">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <SlidersHorizontal className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-base md:text-lg font-medium">
                  Nenhum produto encontrado
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tente ajustar os filtros selecionados
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductGrid;
