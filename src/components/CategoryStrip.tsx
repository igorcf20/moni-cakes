import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import { ImageOff } from "lucide-react";
import Reveal from "@/components/Reveal";

const CategoryStrip = () => {
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

  const categories = allCategories.filter(
    (cat: any) => !visualSettings?.hidden_categories?.includes(cat.id)
  );

  if (isLoading || categories.length === 0) return null;

  return (
    <section className="border-b border-border/40 bg-card/40">
      <div className="container mx-auto px-4 sm:px-6 py-5">
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {categories.map((category: any, i: number) => (
            <Reveal key={category.id} delay={i * 60} variant="scale" className="shrink-0">
              <Link
                to={`/categoria/${category.slug}`}
                className="group flex flex-col items-center w-24 sm:w-28"
              >
                <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full overflow-hidden bg-muted ring-1 ring-border/50 group-hover:ring-primary transition-all">
                  {category.image_url ? (
                    <img
                      src={category.image_url}
                      alt={category.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/60">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <span className="mt-2 text-xs sm:text-sm font-medium text-center line-clamp-1 group-hover:text-primary transition-colors">
                  {category.name}
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoryStrip;