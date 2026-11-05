import { Badge } from "@/components/ui/badge";
import { Sparkles, Truck, Shield, Award } from "lucide-react";

interface ProductBadgesProps {
  isNew?: boolean;
  isBestseller?: boolean;
  hasFreeShipping?: boolean;
  hasWarranty?: boolean;
}

const ProductBadges = ({ 
  isNew, 
  isBestseller, 
  hasFreeShipping,
  hasWarranty 
}: ProductBadgesProps) => {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {isNew && (
        <Badge variant="default" className="gap-1">
          <Sparkles className="h-3 w-3" />
          Novidade
        </Badge>
      )}
      {isBestseller && (
        <Badge variant="secondary" className="gap-1">
          <Award className="h-3 w-3" />
          Mais Vendido
        </Badge>
      )}
      {hasFreeShipping && (
        <Badge variant="outline" className="gap-1">
          <Truck className="h-3 w-3" />
          Portes Grátis
        </Badge>
      )}
      {hasWarranty && (
        <Badge variant="outline" className="gap-1">
          <Shield className="h-3 w-3" />
          Garantia
        </Badge>
      )}
    </div>
  );
};

export default ProductBadges;
