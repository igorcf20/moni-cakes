import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useCurrency } from "@/hooks/use-currency";
import { formatPrice } from "@/utils/currency";

interface AdvancedFiltersProps {
  priceRange: [number, number];
  onPriceChange: (range: [number, number]) => void;
  selectedSizes: string[];
  onSizeChange: (sizes: string[]) => void;
  selectedColors: string[];
  onColorChange: (colors: string[]) => void;
  selectedMaterials: string[];
  onMaterialChange: (materials: string[]) => void;
}

const sizes = ["PP", "P", "M", "G", "GG", "XG"];
const colors = [
  { name: "Preto", value: "black", hex: "#000000" },
  { name: "Branco", value: "white", hex: "#FFFFFF" },
  { name: "Vermelho", value: "red", hex: "#DC2626" },
  { name: "Rosa", value: "pink", hex: "#EC4899" },
  { name: "Azul", value: "blue", hex: "#3B82F6" },
  { name: "Nude", value: "nude", hex: "#D4A574" },
];
const materials = ["Renda", "Cetim", "Seda", "Algodão", "Microfibra", "Tule"];

const AdvancedFilters = ({
  priceRange,
  onPriceChange,
  selectedSizes,
  onSizeChange,
  selectedColors,
  onColorChange,
  selectedMaterials,
  onMaterialChange,
}: AdvancedFiltersProps) => {
  const { currentCurrency, convert } = useCurrency();
  const handleSizeToggle = (size: string) => {
    if (selectedSizes.includes(size)) {
      onSizeChange(selectedSizes.filter((s) => s !== size));
    } else {
      onSizeChange([...selectedSizes, size]);
    }
  };

  const handleColorToggle = (color: string) => {
    if (selectedColors.includes(color)) {
      onColorChange(selectedColors.filter((c) => c !== color));
    } else {
      onColorChange([...selectedColors, color]);
    }
  };

  const handleMaterialToggle = (material: string) => {
    if (selectedMaterials.includes(material)) {
      onMaterialChange(selectedMaterials.filter((m) => m !== material));
    } else {
      onMaterialChange([...selectedMaterials, material]);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        {/* Price Range */}
        <div>
          <Label className="text-base font-display mb-4 block">Preço</Label>
          <Slider
            min={0}
            max={500}
            step={10}
            value={priceRange}
            onValueChange={(value) => onPriceChange(value as [number, number])}
            className="mb-2"
          />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{formatPrice(convert(priceRange[0]), currentCurrency)}</span>
            <span>{formatPrice(convert(priceRange[1]), currentCurrency)}</span>
          </div>
        </div>

        <Separator />

        {/* Sizes */}
        <div>
          <Label className="text-base font-display mb-3 block">Tamanho</Label>
          <div className="grid grid-cols-3 gap-2">
            {sizes.map((size) => (
              <button
                key={size}
                onClick={() => handleSizeToggle(size)}
                className={`px-3 py-2 border rounded-md text-sm font-medium transition-colors ${
                  selectedSizes.includes(size)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Colors */}
        <div>
          <Label className="text-base font-display mb-3 block">Cor</Label>
          <div className="space-y-2">
            {colors.map((color) => (
              <div key={color.value} className="flex items-center gap-3">
                <Checkbox
                  id={color.value}
                  checked={selectedColors.includes(color.value)}
                  onCheckedChange={() => handleColorToggle(color.value)}
                />
                <label
                  htmlFor={color.value}
                  className="flex items-center gap-2 cursor-pointer flex-1"
                >
                  <div
                    className="w-5 h-5 rounded-full border-2"
                    style={{
                      backgroundColor: color.hex,
                      borderColor: color.value === "white" ? "#e5e7eb" : color.hex,
                    }}
                  />
                  <span className="text-sm">{color.name}</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Materials */}
        <div>
          <Label className="text-base font-display mb-3 block">Material</Label>
          <div className="space-y-2">
            {materials.map((material) => (
              <div key={material} className="flex items-center gap-3">
                <Checkbox
                  id={material}
                  checked={selectedMaterials.includes(material)}
                  onCheckedChange={() => handleMaterialToggle(material)}
                />
                <label htmlFor={material} className="text-sm cursor-pointer flex-1">
                  {material}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};

export default AdvancedFilters;
