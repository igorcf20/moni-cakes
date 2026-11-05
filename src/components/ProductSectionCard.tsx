import { useState } from "react";
import { Star, ArrowRight } from "lucide-react";
import { formatPrice } from "@/utils/currency";
import { useCurrency } from "@/hooks/use-currency";
import WishlistButton from "./WishlistButton";
import QuickViewModal from "./QuickViewModal";

interface ProductSectionCardProps {
  product: any;
  badgeText?: string;
  rank?: number;
  navigate: any;
}

const ProductSectionCard = ({ product: p, badgeText, rank, navigate }: ProductSectionCardProps) => {
  const { currentCurrency, convert } = useCurrency();
  const [showQuickView, setShowQuickView] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const handleCustomize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/produto/${(p as any).slug || p.id}`);
  };

  const product = {
    id: p.id, name: p.name, description: p.description, price: p.price, image: p.image,
    stock_quantity: p.stock_quantity, is_featured: p.is_featured, category: p.category, material: p.material,
  };

  return (
    <>
      <div className="group overflow-hidden bg-card h-full flex flex-col rounded-xl border border-border/50 hover:border-primary/60 transition-all duration-500 hover:shadow-[0_8px_30px_-8px_hsl(43_96%_46%/0.15)]">
        {/* Image container */}
        <div className="relative overflow-hidden">
          {/* Badges */}
          <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1.5">
            {badgeText && (
              <span className="bg-foreground/90 backdrop-blur-sm text-primary border border-primary/30 text-[8px] px-2.5 py-0.5 rounded-full tracking-widest uppercase font-medium">
                {badgeText}
              </span>
            )}
            {rank && rank <= 3 && (
              <span className="bg-foreground text-primary border border-primary/30 text-[8px] px-2.5 py-0.5 rounded-full tracking-widest uppercase font-medium">
                #{rank} Mais Vendido
              </span>
            )}
          </div>

          {/* Wishlist */}
          <div className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
            <WishlistButton productId={p.id} size="icon" />
          </div>

          {/* Image */}
          <div
            className="relative aspect-[3/4] overflow-hidden cursor-pointer bg-muted"
            onClick={() => navigate(`/produto/${p.id}`)}
          >
            {!imgLoaded && <div className="absolute inset-0 skeleton" />}
            <img
              src={p.image}
              alt={p.name}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-105 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          </div>

          {/* Quick view — slide up */}
          <div className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
            <button
              className="w-full bg-foreground/90 backdrop-blur-sm text-background text-[10px] tracking-widest uppercase py-2.5 font-medium hover:bg-primary transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowQuickView(true); }}
            >
              Ver Rápido
            </button>
          </div>
        </div>

        {/* Info */}
        <div
          className="p-3 sm:p-4 flex-1 flex flex-col gap-2 cursor-pointer"
          onClick={() => navigate(`/produto/${p.id}`)}
        >
          <div className="flex-1">
            <h3 className="text-sm font-medium leading-snug line-clamp-2 tracking-tight group-hover:text-primary transition-colors duration-300">
              {p.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`h-2.5 w-2.5 ${i < 4 ? "fill-primary text-primary" : "text-muted-foreground/20"}`} />
                ))}
              </div>
              <span className="text-[9px] text-muted-foreground tracking-wide">(4.8)</span>
            </div>
          </div>

          <div className="flex items-end justify-between pt-2 border-t border-border/30">
            <div>
              <span className="font-display text-lg font-medium text-foreground">{formatPrice(convert(p.price), currentCurrency)}</span>
              <p className={`text-[9px] tracking-wide mt-0.5 ${p.stock_quantity === 0 ? 'text-destructive' : 'text-green-600'}`}>
                {p.stock_quantity === 0 ? "Esgotado" : "Em stock"}
              </p>
            </div>
            <button
              className={`min-h-[3.25rem] inline-flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-wider uppercase px-4 py-3 rounded-lg transition-[transform,background-color,color,box-shadow] duration-200 ${
                p.stock_quantity === 0
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-foreground text-background hover:bg-primary hover:-translate-y-0.5 shadow-sm hover:shadow-md"
              }`}
              onClick={handleCustomize}
              disabled={p.stock_quantity === 0}
            >
              <ArrowRight className="h-4 w-4" />
              {p.stock_quantity === 0 ? "Esgotado" : "Personalizar"}
            </button>
          </div>
        </div>
      </div>

      <QuickViewModal product={product} open={showQuickView} onOpenChange={setShowQuickView} />
    </>
  );
};

export default ProductSectionCard;
