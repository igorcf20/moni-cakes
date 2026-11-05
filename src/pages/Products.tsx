// /produtos: todos os produtos, busca (?q=), mais vendidos (?ordem=mais-vendidos), novidades (?ordem=novidades)
// e ofertas (?promo=1), com filtros de categoria, preço e ofertas. Estado na URL para poder partilhar.
import { ListingHero } from '@/components/catalog/CatalogHeader';
import { ListingBody, ListingSeo, ListingShell } from '@/components/catalog/CatalogLayout';
import { useListing, useListingText, type ListingScope } from '@/components/catalog/useListing';

const SCOPE: ListingScope = { kind: 'all' };

const Products = () => {
  const listing = useListing(SCOPE);
  const text = useListingText(listing);
  return (
    <ListingShell>
      <ListingSeo text={text} imageUrl={listing.brandPage?.logo_url} />
      <ListingHero listing={listing} text={text} />
      <ListingBody listing={listing} text={text} />
    </ListingShell>
  );
};

export default Products;
