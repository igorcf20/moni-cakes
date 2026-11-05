import { useState } from "react";
import { Star } from "lucide-react";
import { useProductRating } from "@/hooks/useProductRating";
import ProductReviewsModal from "./ProductReviewsModal";

interface Props {
  productId: string;
  productName?: string;
  size?: "sm" | "md";
  showEmpty?: boolean;
  className?: string;
}

const ProductRatingBadge = ({ productId, productName, size = "md", showEmpty = false, className = "" }: Props) => {
  const { average, count } = useProductRating(productId);
  const [open, setOpen] = useState(false);

  if (count === 0) {
    return showEmpty ? (
      <span className={`text-xs text-muted-foreground italic ${className}`}>Ainda sem avaliações</span>
    ) : null;
  }

  const starSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${textSize} text-muted-foreground ${className}`}
        aria-label="Ver avaliações"
      >
        <Star className={`${starSize} fill-primary text-primary`} />
        <span className="font-medium text-foreground">{average.toFixed(1).replace(".", ",")}</span>
        <span>· {count} {count === 1 ? "avaliação" : "avaliações"}</span>
      </button>
      <ProductReviewsModal productId={productId} productName={productName} open={open} onOpenChange={setOpen} />
    </>
  );
};

export default ProductRatingBadge;
