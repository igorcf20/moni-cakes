import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/utils/currency";
import { useCurrency } from "@/hooks/use-currency";

interface PriceDisplayProps {
  currentPrice: number | string;
  originalPrice?: number | string;
  discount?: number;
  showInstallments?: boolean;
  installments?: number;
}

const PriceDisplay = ({ 
  currentPrice, 
  originalPrice, 
  discount,
  showInstallments = true,
  installments = 3
}: PriceDisplayProps) => {
  const { currentCurrency, convert } = useCurrency();
  
  const getPriceValue = (price: number | string): number => {
    if (typeof price === 'number') return price;
    // Parse R$ formatted string
    const cleaned = price.replace(/[^\d.,]/g, '').replace('.', '').replace(',', '.');
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  };

  const baseCurrentValue = getPriceValue(currentPrice);
  const currentValue = convert(baseCurrentValue);
  const originalValue = originalPrice ? convert(getPriceValue(originalPrice)) : undefined;
  const installmentValue = currentValue / installments;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {originalValue !== undefined && (
          <span className="text-lg text-muted-foreground line-through">
            {formatPrice(originalValue, currentCurrency)}
          </span>
        )}
        {discount && (
          <Badge variant="destructive" className="text-sm">
            -{discount}%
          </Badge>
        )}
      </div>
      
      <div className="text-4xl font-bold text-primary">
        {formatPrice(currentValue, currentCurrency)}
      </div>

      {showInstallments && currentValue > 0 && currentCurrency === 'BRL' && (
        <p className="text-sm text-muted-foreground">
          ou {installments}x de{' '}
          <span className="font-semibold text-foreground">
            {formatPrice(installmentValue, currentCurrency)}
          </span>
          {' '}sem juros
        </p>
      )}
    </div>
  );
};

export default PriceDisplay;

