import { useState } from "react";
import { useFrameOptions, useProductFramePricing } from "@/hooks/useFrameOptions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// Import frame images
import frameWood from "@/assets/product-frame-wood.jpg";
import frameBlack from "@/assets/product-frame-black.jpg";
import frameWhite from "@/assets/product-frame-white.jpg";
import frameGold from "@/assets/product-frame-gold.jpg";

interface FrameSelectorProps {
  productId: string;
  onFrameSelect: (frameId: string | null, price: number) => void;
}

const FrameSelector = ({ productId, onFrameSelect }: FrameSelectorProps) => {
  const { data: frames = [] } = useFrameOptions();
  const { data: pricing = [] } = useProductFramePricing(productId);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);

  // Map frame image URLs to imported images
  const getFrameImage = (imageUrl: string) => {
    const imageMap: { [key: string]: string } = {
      "/assets/product-frame-wood.jpg": frameWood,
      "/assets/product-frame-black.jpg": frameBlack,
      "/assets/product-frame-white.jpg": frameWhite,
      "/assets/product-frame-gold.jpg": frameGold,
    };
    return imageMap[imageUrl] || frameWood;
  };

  const handleFrameSelect = (frameId: string) => {
    if (selectedFrame === frameId) {
      setSelectedFrame(null);
      onFrameSelect(null, 0);
    } else {
      setSelectedFrame(frameId);
      const framePrice = pricing.find((p: any) => p.frame_id === frameId);
      const price = framePrice?.final_combo_price || frames.find((f: any) => f.id === frameId)?.base_price || 0;
      onFrameSelect(frameId, price);
    }
  };

  return (
    <div className="space-y-3 py-4 border-y border-border">
      <h3 className="text-lg font-semibold">Adicionar Moldura</h3>
      
      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-4">
          {frames.map((frame: any) => {
            const framePrice = pricing.find((p: any) => p.frame_id === frame.id);
            const comboPrice = framePrice?.final_combo_price;
            const basePrice = frame.base_price;
            const isSelected = selectedFrame === frame.id;
            const hasDiscount = comboPrice && comboPrice < basePrice;

            return (
              <Card
                key={frame.id}
                className={`flex-shrink-0 w-[160px] sm:w-[180px] cursor-pointer transition-all hover:shadow-md ${
                  isSelected ? "ring-2 ring-primary shadow-lg" : ""
                }`}
                onClick={() => handleFrameSelect(frame.id)}
              >
                <div className="relative">
                  <img
                    src={getFrameImage(frame.image_url)}
                    alt={frame.name}
                    className="w-full h-32 sm:h-36 object-cover rounded-t-lg"
                  />
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-primary rounded-full p-1.5">
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-1.5">
                  <h4 className="font-semibold text-sm leading-tight line-clamp-2">
                    {frame.name}
                  </h4>
                  <p className="text-xs text-muted-foreground">{frame.material}</p>
                  <div className="flex flex-col gap-1 pt-1">
                    {hasDiscount ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs line-through text-muted-foreground">
                            €{basePrice}
                          </span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            -{Math.round(((basePrice - comboPrice) / basePrice) * 100)}%
                          </Badge>
                        </div>
                        <span className="text-base font-bold text-primary">€{comboPrice}</span>
                      </>
                    ) : (
                      <span className="text-base font-bold">€{comboPrice || basePrice}</span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      
      {frames.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhuma moldura disponível no momento
        </p>
      )}
    </div>
  );
};

export default FrameSelector;
