import { Heart } from "lucide-react";
import { useFeature } from "@/hooks/useFeatures";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWishlist } from "@/hooks/useWishlist";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { cn } from "@/lib/utils";

interface WishlistButtonProps {
  productId: string;
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
}

/** Botão de favorito (coração). Sem sessão, leva ao login e depois volta para a mesma página. */
const WishlistButton = ({ productId, size = "icon", showLabel = false }: WishlistButtonProps) => {
  const { t } = useMessages(accountMessages);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist(user?.id);
  const isFavorite = isInWishlist(productId);
  const wishlistOn = useFeature("wishlist");

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    if (isFavorite) removeFromWishlist(productId);
    else addToWishlist(productId);
  };

  const iconOnly = size === "icon" && !showLabel;
  if (!wishlistOn) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? t("wishRemove") : t("wishAdd")}
      title={isFavorite ? t("wishRemove") : t("wishAdd")}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] border text-[14px] font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isFavorite
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
          : "border-border bg-white text-foreground hover:border-primary hover:text-brand-orange-text",
        iconOnly ? "h-11 w-11" : size === "sm" ? "min-h-10 px-3" : size === "lg" ? "min-h-12 px-5" : "min-h-11 px-4",
      )}
    >
      <Heart className={cn("h-[18px] w-[18px]", isFavorite && "fill-current")} strokeWidth={1.8} aria-hidden="true" />
      {showLabel && <span>{isFavorite ? t("wishInList") : t("wishAddShort")}</span>}
    </button>
  );
};

export default WishlistButton;
