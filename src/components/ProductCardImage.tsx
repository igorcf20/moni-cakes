import { useEffect, useRef, useState } from "react";
import { useProductImages } from "@/hooks/useProductImages";
import { cn } from "@/lib/utils";

interface Props {
  productId: string;
  fallbackImage: string;
  alt: string;
  onClick?: () => void;
  autoplayMs?: number;
}

const ProductCardImage = ({
  productId,
  fallbackImage,
  alt,
  onClick,
  autoplayMs = 3500,
}: Props) => {
  const { data: dbImages } = useProductImages(productId);
  const images: string[] = (() => {
    const urls = (dbImages || [])
      .map((i: any) => i.image_url)
      .filter(Boolean);
    if (urls.length === 0 && fallbackImage) return [fallbackImage];
    // Ensure the fallback image is included first if it isn't already in DB list
    if (fallbackImage && !urls.includes(fallbackImage)) return [fallbackImage, ...urls];
    return urls;
  })();

  const [idx, setIdx] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Reset when list changes
  useEffect(() => {
    setIdx(0);
  }, [productId, images.length]);

  // Autoplay
  useEffect(() => {
    if (images.length <= 1 || paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % images.length), autoplayMs);
    return () => clearInterval(t);
  }, [images.length, paused, autoplayMs]);

  const go = (dir: 1 | -1) => {
    if (images.length <= 1) return;
    setIdx((i) => (i + dir + images.length) % images.length);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = touchStartX.current;
    setPaused(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };
  const onTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      go(diff > 0 ? 1 : -1);
    }
    // resume after a short pause
    setTimeout(() => setPaused(false), 1200);
  };

  const currentSrc = images[idx] || fallbackImage;

  return (
    <div
      className="relative aspect-[3/4] overflow-hidden cursor-pointer bg-muted"
      onClick={onClick}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {!imgLoaded && <div className="absolute inset-0 skeleton" />}
      {images.map((src, i) => (
        <img
          key={src + i}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => i === idx && setImgLoaded(true)}
          onError={() => i === idx && setImgLoaded(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-out group-hover:scale-105",
            i === idx ? "opacity-100" : "opacity-0"
          )}
        />
      ))}

      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 px-2 py-1 rounded-full bg-background/50 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-0 pointer-events-auto group-hover:pointer-events-none">
          {images.map((_, i) => (
            <button
              key={i}
              aria-label={`Imagem ${i + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                setIdx(i);
              }}
              className={cn(
                "rounded-full transition-all",
                i === idx ? "bg-primary w-4 h-1.5" : "bg-foreground/40 w-1.5 h-1.5 hover:bg-foreground/70"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductCardImage;