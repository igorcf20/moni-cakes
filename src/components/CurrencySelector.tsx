import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "@/hooks/use-currency";
import { CURRENCIES, CurrencyCode } from "@/utils/currency";
import { Globe } from "lucide-react";

export const CurrencySelector = () => {
  const { currentCurrency, setCurrency } = useCurrency();

  return (
    <div className="flex items-center gap-2">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <Select 
        value={currentCurrency} 
        onValueChange={(value) => setCurrency(value as CurrencyCode)}
      >
        <SelectTrigger className="w-[120px] h-9 border-none bg-transparent hover:bg-muted/50 transition-colors focus:ring-0">
          <SelectValue placeholder="Moeda" />
        </SelectTrigger>
        <SelectContent>
          {Object.values(CURRENCIES).map((currency) => (
            <SelectItem key={currency.code} value={currency.code}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{currency.code}</span>
                <span className="text-xs text-muted-foreground">({currency.symbol})</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
