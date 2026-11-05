import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import Reveal from "@/components/Reveal";
import { getVatRate } from "@/utils/pricing";
import { getProductPromo, formatPromoBadge } from "@/utils/promo";
import { isLegacyRollProduct } from "@/lib/legacyRolls";
import PromoCountdown from "@/components/PromoCountdown";

type Section = {
  id: string;
  key: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  source: "featured" | "promo" | "bestsellers" | "low_stock" | "new_arrivals" | "customizable" | "ready_made" | "category";
  category_slug: string | null;
  cta_text: string | null;
  cta_url: string | null;
  item_limit: number;
  layout: "grid" | "carousel";
  display_order: number;
  is_active: boolean;
};

const PRODUCT_COLS =
  "id,slug,name,short_description,image,category,price,price_per_meter,unit_type,customizable,is_featured,is_new,vat_rate,promo_active,promo_type,promo_value,promo_label,promo_starts_at,promo_ends_at,promo_show_countdown,stock_quantity,sales_count,created_at";

const formatEUR = (v: number) =>
  Number(v || 0).toFixed(2).replace(".", ",") + " €";

const Card = ({ p }: { p: any }) => {
  const isMeter = isLegacyRollProduct(p.unit_type, p.price_per_meter);
  const rawNet = Number(p.price_per_meter ?? p.price ?? 0);
  const vatPct = getVatRate(p.vat_rate);
  const promo = getProductPromo(p);
  const net =
    promo?.isActive && promo.basePrice > 0
      ? Math.max(0, rawNet * (promo.effectivePrice / promo.basePrice))
      : rawNet;
  return (
    <Link
      to={`/produto/${p.slug || p.id}`}
      className="group relative overflow-hidden rounded-2xl border border-border/40 bg-card hover:border-primary/40 transition-all h-full flex flex-col"
    >
      <div className="relative aspect-square overflow-hidden bg-background">
        <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
        {p.category && (
          <span className="absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded-full bg-background/85 backdrop-blur text-[11px] font-medium text-foreground">
            {p.category}
          </span>
        )}
        {promo?.isActive && (
          <span className="absolute top-3 right-3 inline-flex items-center px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold shadow">
            {formatPromoBadge(promo)}
          </span>
        )}
        {!promo?.isActive && p.is_new && (
          <span className="absolute top-3 right-3 inline-flex items-center px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shadow">
            Novo
          </span>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-heading text-base md:text-lg tracking-tight line-clamp-1">{p.name}</h3>
        {p.short_description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.short_description}</p>
        )}
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-base font-semibold text-foreground truncate">
              {formatEUR(net)}
              {isMeter && <span className="ml-1 text-[10px] font-normal text-muted-foreground">/ m</span>}
            </span>
            {promo?.isActive && net !== rawNet && (
              <span className="text-[10px] text-muted-foreground line-through">
                {formatEUR(rawNet)}
              </span>
            )}
            <span className="text-[9px] text-muted-foreground">
              + IVA {vatPct.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%
            </span>
            {promo?.isActive && promo.showCountdown && promo.endsAt && (
              <PromoCountdown endsAt={promo.endsAt} compact className="mt-0.5" />
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 group-hover:text-primary transition-colors">
            Ver <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
};

const useSectionProducts = (s: Section) =>
  useQuery({
    queryKey: ["home-product-section", s.id, s.source, s.category_slug, s.item_limit],
    queryFn: async () => {
      let q = (supabase as any).from("products").select(PRODUCT_COLS).eq("is_active", true);

      switch (s.source) {
        case "featured":
          q = q.eq("is_featured", true).order("display_order", { ascending: true });
          break;
        case "promo":
          q = q.eq("promo_active", true).order("display_order", { ascending: true });
          break;
        case "bestsellers":
          q = q.order("sales_count", { ascending: false });
          break;
        case "low_stock":
          q = q.gt("stock_quantity", 0).lte("stock_quantity", 10).order("stock_quantity", { ascending: true });
          break;
        case "new_arrivals":
          q = q.eq("is_new", true).order("created_at", { ascending: false });
          break;
        case "customizable":
          q = q.eq("customizable", true).order("display_order", { ascending: true });
          break;
        case "ready_made":
          q = q.eq("customizable", false).order("display_order", { ascending: true });
          break;
        case "category":
          if (s.category_slug) q = q.eq("category", s.category_slug).order("display_order", { ascending: true });
          break;
      }

      const { data, error } = await q.limit(s.item_limit || 8);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

const SectionBlock = ({ s, idx }: { s: Section; idx: number }) => {
  const { data: products = [] } = useSectionProducts(s);
  const [api, setApi] = useState<CarouselApi | null>(null);
  const autoplay = useRef(Autoplay({ delay: 4500, stopOnInteraction: false, stopOnMouseEnter: true }));

  if (!products.length) return null;

  const showCarousel = s.layout === "carousel" && products.length > 1;
  const bg = idx % 2 === 1 ? "bg-muted/30" : "";

  return (
    <section className={`py-12 lg:py-20 ${bg}`}>
      <div className="container mx-auto px-4">
        <Reveal className="flex items-end justify-between mb-8 gap-4">
          <div className="max-w-2xl">
            {s.eyebrow && (
              <p className="text-sm font-medium text-primary uppercase tracking-[0.2em]">{s.eyebrow}</p>
            )}
            <h2 className="font-heading text-3xl lg:text-4xl mt-2 tracking-tight">{s.title}</h2>
            {s.subtitle && <p className="text-sm text-muted-foreground mt-2">{s.subtitle}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {showCarousel && (
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={() => { api?.scrollPrev(); autoplay.current.reset(); }}
                  aria-label="Anterior"
                  className="h-9 w-9 rounded-full border border-border/60 flex items-center justify-center hover:border-primary hover:text-primary transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { api?.scrollNext(); autoplay.current.reset(); }}
                  aria-label="Seguinte"
                  className="h-9 w-9 rounded-full border border-border/60 flex items-center justify-center hover:border-primary hover:text-primary transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {s.cta_url && (
              <Link
                to={s.cta_url}
                className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all"
              >
                {s.cta_text || "Ver mais"} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </Reveal>

        {showCarousel ? (
          <Reveal delay={120}>
            <Carousel
              setApi={setApi}
              opts={{ align: "start", loop: true }}
              plugins={[autoplay.current]}
              onMouseEnter={() => autoplay.current.stop()}
              onMouseLeave={() => autoplay.current.play()}
              className="w-full"
            >
              <CarouselContent className="-ml-4 md:-ml-5">
                {products.map((p: any) => (
                  <CarouselItem key={p.id} className="pl-4 md:pl-5 basis-[80%] sm:basis-1/2 md:basis-1/3 lg:basis-1/4">
                    <Card p={p} />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </Reveal>
        ) : (
          <Reveal delay={120}>
            <div className="grid gap-4 md:gap-5 grid-cols-2 lg:grid-cols-4">
              {products.map((p: any) => <Card key={p.id} p={p} />)}
            </div>
          </Reveal>
        )}

        {s.cta_url && (
          <div className="mt-8 flex justify-center sm:hidden">
            <Link
              to={s.cta_url}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
            >
              {s.cta_text || "Ver mais"} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

const HomeProductSections = () => {
  const { data: sections = [] } = useQuery({
    queryKey: ["home_product_sections_public"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("home_product_sections")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as Section[];
    },
    staleTime: 60_000,
  });

  return (
    <>
      {sections.map((s, idx) => (
        <SectionBlock key={s.id} s={s} idx={idx} />
      ))}
    </>
  );
};

export default HomeProductSections;
