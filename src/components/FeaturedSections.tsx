import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import ProductSectionCard from "./ProductSectionCard";
import SkeletonProductCard from "./SkeletonProductCard";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";

const SectionHeader = ({ label, title, linkTo, linkText }: { label: string; title: string; linkTo?: string; linkText?: string }) => (
  <div className="flex flex-col items-center text-center mb-8 md:mb-12">
    <div className="flex items-center gap-3 mb-2">
      <span className="hidden sm:block h-px w-8 bg-primary/50" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-primary">{label}</p>
      <span className="hidden sm:block h-px w-8 bg-primary/50" />
    </div>
    <h2 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground">{title}</h2>
    {linkTo && (
      <Link to={linkTo} className="hidden sm:inline-flex items-center gap-2 mt-3 text-[11px] text-muted-foreground hover:text-primary transition-colors uppercase tracking-[0.25em] group font-medium">
        {linkText || "Ver todos"}
        <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
      </Link>
    )}
  </div>
);

const FeaturedSections = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToCart } = useCart(user?.id);
  const { data: visualSettings } = useVisualSettings();
  const featuredStyle = visualSettings?.section_styles?.featured || "grid";

  const { data: allCategories = [], isLoading: catLoading } = useQuery({
    queryKey: ["categories-home"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const categories = allCategories.filter((cat: any) => 
    !visualSettings?.hidden_categories?.includes(cat.id)
  );

  const { data: featuredProducts = [], isLoading: featLoading } = useQuery({
    queryKey: ["featured-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("*")
        .eq("is_featured", true)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(8);
      if (error) throw error;
      return (data || []).sort((a: any, b: any) =>
        Number(a.featured_display_order ?? a.display_order ?? 0) -
        Number(b.featured_display_order ?? b.display_order ?? 0)
      );
    },
  });

  const { data: bestSellers = [], isLoading: bestLoading } = useQuery({
    queryKey: ["bestseller-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("sales_count", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="space-y-0">
      {/* Categories */}
      {(catLoading || categories.length > 0) && (
        <section className="py-12 md:py-20 bg-muted/40">
          <div className="container mx-auto px-4 sm:px-6">
            <SectionHeader label="Explore" title="Categorias" />
            {catLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 max-w-3xl mx-auto gap-3 sm:gap-4 md:gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="text-center">
                    <Skeleton className="mx-auto w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-2xl" />
                    <Skeleton className="mt-3 h-3 w-16 sm:w-20 mx-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <div className={`grid gap-3 sm:gap-4 md:gap-6 stagger-fade-in ${
                categories.length <= 4 
                  ? 'grid-cols-2 sm:grid-cols-4 max-w-3xl mx-auto' 
                  : categories.length <= 6 
                    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-6 max-w-5xl mx-auto'
                    : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
              }`}>
                {categories.map((cat: any) => (
                  <Link key={cat.id} to={`/categoria/${cat.slug}`} className="group text-center">
                    <div className="relative mx-auto w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32">
                      <div className="absolute inset-0 rounded-2xl bg-primary/0 group-hover:bg-primary/10 transition-all duration-300 group-hover:scale-110" />
                      <div className="w-full h-full rounded-2xl overflow-hidden border border-border/60 group-hover:border-primary/40 transition-all duration-300 shadow-sm">
                        <img
                          src={cat.image_url}
                          alt={cat.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          loading="lazy"
                        />
                      </div>
                    </div>
                    <p className="mt-2 sm:mt-3 text-[10px] sm:text-xs md:text-sm font-medium tracking-wide group-hover:text-primary transition-colors line-clamp-1 uppercase">{cat.name}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Featured / Destaques */}
      {(featLoading || featuredProducts.length > 0) && (
        <section className="py-12 md:py-20 bg-background">
          <div className="container mx-auto px-4 sm:px-6">
            <SectionHeader label="Curadoria" title="Destaques da Temporada" linkTo="/produtos" />
            {featLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4">
                {Array.from({ length: 8 }).map((_, i) => <SkeletonProductCard key={i} />)}
              </div>
            ) : featuredStyle === "carousel" ? (
              <Carousel className="w-full">
                <CarouselContent className="-ml-2 md:-ml-4">
                  {featuredProducts.map((p: any) => (
                    <CarouselItem key={p.id} className="pl-2 md:pl-4 basis-1/2 sm:basis-1/3 lg:basis-1/4">
                      <ProductSectionCard product={p} badgeText="Destaque" navigate={navigate} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <div className="hidden md:block">
                  <CarouselPrevious className="-left-12" />
                  <CarouselNext className="-right-12" />
                </div>
              </Carousel>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4 stagger-fade-in">
        {featuredProducts.map((p: any) => (
                      <ProductSectionCard key={p.id} product={p} badgeText="Destaque" navigate={navigate} />
                    ))}
              </div>
            )}
            <div className="sm:hidden text-center mt-5">
              <Link to="/produtos" className="text-[10px] text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors inline-flex items-center gap-2">
                Ver todos os destaques <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Best Sellers */}
      {(bestLoading || bestSellers.length > 0) && (
        <section className="py-12 md:py-20 bg-muted/30 border-y border-border/20">
          <div className="container mx-auto px-4 sm:px-6">
            <SectionHeader label="Top Vendas" title="Mais Vendidos" linkTo="/produtos" />
            {bestLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4">
                {Array.from({ length: 8 }).map((_, i) => <SkeletonProductCard key={i} />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4 stagger-fade-in">
                {bestSellers.map((p: any, i: number) => (
                  <ProductSectionCard key={p.id} product={p} rank={i + 1} navigate={navigate} />
                ))}
              </div>
            )}
            <div className="sm:hidden text-center mt-5">
              <Link to="/produtos" className="text-[10px] text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors inline-flex items-center gap-2">
                Ver mais vendidos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default FeaturedSections;
