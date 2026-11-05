import { Truck, Sparkles, Tag } from "lucide-react";
import { useState, useEffect } from "react";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import { formatPrice } from "@/utils/currency";
import { useCurrency } from "@/hooks/use-currency";

const FreeShippingBanner = () => {
  const { data: visualSettings } = useVisualSettings();
  const { currentCurrency, convert } = useCurrency();
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);

  const messages = [
    { icon: Truck, text: `🚚 PORTES GRÁTIS em compras acima de ${formatPrice(convert(50), currentCurrency)}` },
    { icon: Sparkles, text: "✨ Personalização profissional, entrega rápida" },
    { icon: Tag, text: "🎁 Pague com Multibanco, MB WAY ou transferência" },
  ];

  useEffect(() => {
    if (visualSettings?.announcement_bar?.enabled === false) return;
    
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrent((prev) => (prev + 1) % messages.length);
        setVisible(true);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, [visualSettings, messages.length]);

  if (visualSettings?.announcement_bar?.enabled === false) return null;

  const customText = visualSettings?.announcement_bar?.text;
  const bgColor = visualSettings?.announcement_bar?.bg_color || "var(--foreground)";
  const textColor = visualSettings?.announcement_bar?.text_color || "var(--primary)";

  return (
    <div 
      className="py-2 px-4 text-center overflow-hidden transition-colors"
      style={{ backgroundColor: bgColor }}
    >
      <div
        className="flex items-center justify-center gap-2 text-xs sm:text-sm font-medium transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <span 
          className="tracking-wide font-semibold uppercase"
          style={{ color: textColor }}
        >
          {customText || messages[current].text}
        </span>
      </div>
    </div>
  );
};

export default FreeShippingBanner;