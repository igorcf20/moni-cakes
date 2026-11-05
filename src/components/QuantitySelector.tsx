import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

interface QuantitySelectorProps {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  max?: number;
  min?: number;
}

const QuantitySelector = ({ 
  quantity, 
  onQuantityChange, 
  max = 9999,
  min = 1 
}: QuantitySelectorProps) => {
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  const commit = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const next = isNaN(parsed) ? min : Math.min(max, Math.max(min, parsed));
    onQuantityChange(next);
    setDraft(String(next));
  };

  const handleIncrement = () => {
    if (quantity < max) {
      onQuantityChange(quantity + 1);
    }
  };

  const handleDecrement = () => {
    if (quantity > min) {
      onQuantityChange(quantity - 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    setDraft(raw);
    if (raw === "") return;
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onQuantityChange(parsed);
    }
  };


  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">Quantidade:</span>
      <div className="flex items-center border rounded-lg">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-r-none"
          onClick={handleDecrement}
          disabled={quantity <= min}
          aria-label="Diminuir quantidade"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={handleInputChange}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }}
          className="h-11 w-20 text-center border-0 border-x focus-visible:ring-0 rounded-none"
          aria-label="Quantidade"
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-l-none"
          onClick={handleIncrement}
          disabled={quantity >= max}
          aria-label="Aumentar quantidade"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default QuantitySelector;
