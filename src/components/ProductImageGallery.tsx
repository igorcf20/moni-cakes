import { useState, useRef, useEffect } from "react";
import { useProductImages } from "@/hooks/useProductImages";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ZoomIn, ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProductImageGalleryProps {
  productId: string;
  defaultImage?: string;
  variationId?: string | null;
  variationImage?: string | null;
}

const ProductImageGallery = ({ productId, defaultImage, variationId, variationImage }: ProductImageGalleryProps) => {
  const [selectedImage, setSelectedImage] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [lensPosition, setLensPosition] = useState({ x: 50, y: 50 });
  const imageRef = useRef<HTMLDivElement>(null);
  const { data: dbImages } = useProductImages(productId, variationId);

  // Reset to first image when variation changes
  useEffect(() => {
    setSelectedImage(0);
  }, [variationId]);


  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Build image list: DB images first, then variation image as fallback, then default
  const allImages = (() => {
    if (dbImages && dbImages.length > 0) return dbImages;
    // If no DB images for this variation, use the variation's own image_url
    if (variationImage) return [{ image_url: variationImage, alt_text: "Variação do produto" }];
    if (defaultImage) return [{ image_url: defaultImage, alt_text: "Imagem do produto" }];
    return [];
  })();

  if (allImages.length === 0) {
    return (
      <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
        <p className="text-muted-foreground">Sem imagem disponível</p>
      </div>
    );
  }

  const handlePrevious = () => setSelectedImage((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
  const handleNext = () => setSelectedImage((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.targetTouches[0].clientX; };
  const handleTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.targetTouches[0].clientX; };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) { diff > 0 ? handleNext() : handlePrevious(); }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setLensPosition({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  };

  return (
    <div className="flex flex-col-reverse md:flex-row gap-3 md:gap-4">
      {/* Vertical Thumbnails - Desktop */}
      {allImages.length > 1 && (
        <div className="hidden md:flex flex-col gap-2.5 w-20 flex-shrink-0">
          {allImages.map((image, index) => (
            <button
              key={index}
              onClick={() => setSelectedImage(index)}
              className={cn(
                "aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all duration-300",
                selectedImage === index 
                  ? "border-primary shadow-[0_0_12px_hsl(var(--primary)/0.3)] scale-105" 
                  : "border-transparent hover:border-primary/40 opacity-60 hover:opacity-100"
              )}
            >
              <img
                src={image.image_url}
                alt={image.alt_text || `Vista ${index + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* Main Image */}
      <div className="flex-1 space-y-3">
        <div 
          ref={imageRef}
          className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gradient-to-b from-muted/50 to-muted group cursor-crosshair"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onMouseMove={handleMouseMove}
        >
          {/* Main product image */}
          <img
            src={allImages[selectedImage]?.image_url}
            alt={allImages[selectedImage]?.alt_text || "Produto"}
            className={cn(
              "w-full h-full object-cover transition-transform duration-500",
              isHovering && "scale-150"
            )}
            style={isHovering ? {
              transformOrigin: `${lensPosition.x}% ${lensPosition.y}%`
            } : undefined}
            draggable={false}
          />
          
          {/* Subtle vignette overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/5 via-transparent to-transparent pointer-events-none" />
          
          {/* Navigation arrows */}
          {allImages.length > 1 && (
            <>
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-background/70 backdrop-blur-md border border-border/50 opacity-0 group-hover:opacity-100 transition-all duration-300 h-10 w-10 rounded-full hover:bg-background/90 hover:scale-110" 
                onClick={(e) => { e.stopPropagation(); handlePrevious(); }} 
                aria-label="Imagem anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-background/70 backdrop-blur-md border border-border/50 opacity-0 group-hover:opacity-100 transition-all duration-300 h-10 w-10 rounded-full hover:bg-background/90 hover:scale-110" 
                onClick={(e) => { e.stopPropagation(); handleNext(); }} 
                aria-label="Próxima imagem"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}
          
          {/* Fullscreen button */}
          <button 
            onClick={() => setIsZoomed(true)} 
            className="absolute top-4 right-4 bg-background/70 backdrop-blur-md border border-border/50 p-2.5 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-background/90 hover:scale-110" 
            aria-label="Ver em ecrã inteiro"
          >
            <Expand className="h-4 w-4" />
          </button>

          {/* Image counter pill */}
          {allImages.length > 1 && (
            <div className="absolute bottom-4 right-4 bg-background/70 backdrop-blur-md border border-border/50 px-3 py-1 rounded-full text-xs font-medium opacity-0 group-hover:opacity-100 transition-all duration-300">
              {selectedImage + 1} / {allImages.length}
            </div>
          )}

          {/* Dot indicators for mobile */}
          {allImages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 md:hidden">
              {allImages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImage(index)}
                  className={cn(
                    "rounded-full transition-all duration-300",
                    selectedImage === index 
                      ? "bg-primary w-6 h-2" 
                      : "bg-background/60 w-2 h-2 hover:bg-background/80"
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Horizontal thumbnails for mobile */}
        {allImages.length > 1 && (
          <div className="flex md:hidden gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {allImages.map((image, index) => (
              <button
                key={index}
                onClick={() => setSelectedImage(index)}
                className={cn(
                  "w-16 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-300",
                  selectedImage === index 
                    ? "border-primary" 
                    : "border-transparent opacity-60"
                )}
              >
                <img
                  src={image.image_url}
                  alt={image.alt_text || `Vista ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen lightbox */}
      <Dialog open={isZoomed} onOpenChange={setIsZoomed}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-foreground/95 border-none">
          <div 
            className="relative flex items-center justify-center min-h-[80vh]" 
            onTouchStart={handleTouchStart} 
            onTouchMove={handleTouchMove} 
            onTouchEnd={handleTouchEnd}
          >
            <img 
              src={allImages[selectedImage]?.image_url} 
              alt={allImages[selectedImage]?.alt_text || "Produto"} 
              className="max-w-full max-h-[90vh] object-contain" 
            />
            {allImages.length > 1 && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/20 backdrop-blur-md text-background hover:bg-background/30 h-12 w-12 rounded-full" 
                  onClick={handlePrevious}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/20 backdrop-blur-md text-background hover:bg-background/30 h-12 w-12 rounded-full" 
                  onClick={handleNext}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}
            {/* Thumbnail strip in lightbox */}
            {allImages.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 bg-background/10 backdrop-blur-md p-2 rounded-xl">
                {allImages.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={cn(
                      "w-12 h-14 rounded-lg overflow-hidden border-2 transition-all",
                      selectedImage === index ? "border-primary scale-110" : "border-transparent opacity-50 hover:opacity-80"
                    )}
                  >
                    <img src={image.image_url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductImageGallery;
