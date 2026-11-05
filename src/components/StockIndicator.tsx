import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";

interface StockIndicatorProps {
  stock: number;
  showCount?: boolean;
}

const StockIndicator = ({ stock, showCount = true }: StockIndicatorProps) => {
  const getStockStatus = () => {
    if (stock === 0) {
      return {
        label: "Esgotado",
        variant: "destructive" as const,
        icon: <AlertCircle className="h-3 w-3" />
      };
    } else if (stock < 10) {
      return {
        label: showCount ? `Apenas ${stock} em stock` : "Stock Baixo",
        variant: "secondary" as const,
        icon: <Clock className="h-3 w-3" />
      };
    } else {
      return {
        label: showCount ? `${stock} em stock` : "Em Stock",
        variant: "outline" as const,
        icon: <CheckCircle className="h-3 w-3" />
      };
    }
  };

  const status = getStockStatus();

  return (
    <Badge variant={status.variant} className="gap-1">
      {status.icon}
      {status.label}
    </Badge>
  );
};

export default StockIndicator;
