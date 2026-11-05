import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import { ImageOff, ArrowUpRight } from "lucide-react";

const CategoryGrid = () => {
  const { data: visualSettings } = useVisualSettings();
  const { data: allCategories = [], isLoading } = useQuery({
    queryKey: ["categories"],
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

  if (isLoading) {
    return (
      <section className="py-10 md:py-16">
        <div className="container mx-auto px-4">
          <p className="text-center text-sm text-muted-foreground">Carregando categorias…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative py-20 md:py-28 overflow-hidden bg-muted/30">
      <div className="relative container mx-auto px-4 sm:px-6">
        <div className="flex flex-col items-center text-center mb-14 md:mb-18">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary mb-4">
            Categorias
          </span>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-foreground tracking-tight text-balance">
            As nossas <span className="italic text-primary">especialidades</span>
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Brindes e vestuário personalizado para empresas, eventos e particulares.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
          {categories.map((category: any) => (
            <Link
              key={category.id}
              to={`/categoria/${category.slug}`}
              className="group relative overflow-hidden rounded-2xl bg-card border border-border/40 aspect-[4/5] flex flex-col"
            >
              <div className="absolute inset-0">
                {category.image_url ? (
                  <img
                    src={category.image_url}
                    alt={category.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/70">
                    <ImageOff className="h-10 w-10 text-primary-foreground/70" />
                  </div>
                )}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent"
                />
              </div>

              <div className="relative mt-auto p-4 md:p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="font-heading font-semibold text-foreground text-base md:text-lg tracking-tight">
                      {category.name}
                    </h3>
                    <span className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-primary opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                      Explorar <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoryGrid;
