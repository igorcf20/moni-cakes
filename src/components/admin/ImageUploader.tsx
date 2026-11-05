import StorageImageUploader from "./StorageImageUploader";

interface ImageUploaderProps {
  onImageUploaded: (url: string) => void;
  category?: 'product' | 'category' | 'banner' | 'kits';
  currentImage?: string;
}

/**
 * Wrapper around StorageImageUploader for backward compatibility.
 * Used by AdminCategories, AdminKits, AdminProducts, etc.
 */
export const ImageUploader = ({ onImageUploaded, category = 'product', currentImage }: ImageUploaderProps) => {
  const bucketMap: Record<string, string> = {
    product: "product-images",
    category: "product-images",
    banner: "banners",
    kits: "product-images",
  };

  return (
    <StorageImageUploader
      value={currentImage || ""}
      onChange={onImageUploaded}
      bucket={bucketMap[category] || "product-images"}
      folder={category}
      label={category === 'product' ? "Imagem do Produto" : category === 'category' ? "Imagem da Categoria" : category === 'kits' ? "Imagem do Kit" : "Imagem do Banner"}
      previewAspect={category === 'banner' ? "aspect-video" : "aspect-square"}
    />
  );
};
