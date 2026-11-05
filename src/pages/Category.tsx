// /categoria/:slug (e ?sub=<subcategoria>): banner da categoria, chips das subcategorias e a mesma listagem de /produtos.
// A categoria vem primeiro do catálogo PRINT3D (src/lib/catalog.ts) e só é enriquecida pela linha da BD, se existir.
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { CategoryHero } from '@/components/catalog/CatalogHeader';
import { CategoryNotFound, CategorySkeleton, ListingBody, ListingSeo, ListingShell } from '@/components/catalog/CatalogLayout';
import { useListing, useListingText, type ListingScope } from '@/components/catalog/useListing';

const Category = () => {
  const { slug = '' } = useParams();
  const scope = useMemo<ListingScope>(() => ({ kind: 'category', slug }), [slug]);
  const listing = useListing(scope);
  const text = useListingText(listing);

  if (listing.notFound) return <ListingShell><CategoryNotFound /></ListingShell>;
  if (!listing.category) return <ListingShell><CategorySkeleton /></ListingShell>;
  return (
    <ListingShell>
      <ListingSeo text={text} image={listing.category.image} imageUrl={listing.category.imageUrl} />
      <CategoryHero listing={listing} text={text} />
      <ListingBody listing={listing} text={text} />
    </ListingShell>
  );
};

export default Category;
