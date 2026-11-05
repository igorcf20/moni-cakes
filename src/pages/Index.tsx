// Página inicial da Moni Cakes: experiência cinematográfica conduzida pela rolagem
// (hero com bolos em camadas, Nossos Bolos, O Sabor em Cada Detalhe, Bolos para Celebrar e Encomende Seu Favorito).
// Direção de arte: docs/GUIA-VISUAL.md. Imagens provisórias e dados do hero: src/lib/moniHome.ts.
// Movimento: src/components/moni/useMoniMotion.ts (GSAP + ScrollTrigger; respeita "reduzir movimento").
import { useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import Footer from '@/components/Footer';
import { MoniHeader } from '@/components/moni/MoniHeader';
import { MoniHero } from '@/components/moni/MoniHero';
import { Celebrate, FinalOrder, FlavorDetail, OurCakes } from '@/components/moni/MoniSections';
import { useMoniMotion } from '@/components/moni/useMoniMotion';
import { CampaignBanners } from '@/components/home/CampaignBanners';
import { HomeKits } from '@/components/home/HomeKits';
import { HomePolls } from '@/components/home/HomePolls';
import { useFeature } from '@/hooks/useFeatures';
import '@/components/moni/moni.css';
import { useBrand } from '@/hooks/useBrand';
import { useHomeCatalog } from '@/hooks/useHomeCatalog';
import { useVisualSettings } from '@/hooks/useVisualSettings';
import { useMessages } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { moniHomeMessages } from '@/i18n/moniHome';
import { orderHref } from '@/lib/moniHome';

const Index = () => {
  const { t } = useMessages(moniHomeMessages);
  const { t: tl } = useMessages(layoutMessages);
  const brand = useBrand();
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const catalog = useHomeCatalog();
  const kitsOn = useFeature('kits');
  const { data: visual } = useVisualSettings();
  const wa = visual?.plugins?.whatsapp;
  const order = orderHref(wa?.enabled === false ? '' : wa?.phone, wa?.message || tl('waMessage'));
  // As animações de rolagem só arrancam depois de o catálogo decidir a altura de Nossos Bolos.
  useMoniMotion(root, !catalog.isLoading);

  return (
    <div ref={root} className="moni-home">
      <Helmet>
        <title>{t('metaTitle', { store: brand.name })}</title>
        <meta name="description" content={brand.description} />
        <link rel="preload" as="image" href="/images/moni/bolo-floral.webp" />
      </Helmet>
      <MoniHeader order={order} whatsHref={order.external ? order.href : null} />
      <main id="conteudo">
        <MoniHero active={active} onSelect={setActive} order={order} />
        <OurCakes products={catalog.featured} loading={catalog.isLoading} order={order} />
        <FlavorDetail />
        <Celebrate order={order} />
        <FinalOrder order={order} />
        {/* Conteúdo do Admin (só aparece quando existe): banners de campanha, kits marcados para a página
            inicial e enquetes abertas. Fica depois da narrativa para não mexer nas cenas de rolagem. */}
        <div className="mc-cream-tex">
          <CampaignBanners />
          {kitsOn && <HomeKits title={tl('kits_title')} sub={tl('kits_sub')} />}
          <HomePolls />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
