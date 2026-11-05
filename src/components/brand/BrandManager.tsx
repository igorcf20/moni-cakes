// =====================================================================================
// Aplica a marca no site inteiro (montado uma vez em src/App.tsx):
//   - cores e fontes do tema -> variáveis CSS do <html> (src/theme/applyTheme.ts)
//   - título-base da aba (as páginas que definem o próprio título com Helmet passam por cima)
//   - descrição, ícone da aba e partilhas: atualiza as etiquetas que o index.html já traz
//     (preenchidas no build a partir de src/config/store.ts), sem criar duplicados
// Também guarda o tema neste navegador para a próxima visita abrir já com as cores certas.
// =====================================================================================
import { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useBrandQuery } from '@/hooks/useBrand';
import { applyTheme } from '@/theme/applyTheme';
import { rememberTheme } from '@/theme/boot';
import { STORE_DEFAULTS } from '@/config/store';

const setAttr = (selector: string, attr: string, value: string) => {
  if (value) document.querySelectorAll(selector).forEach((el) => el.setAttribute(attr, value));
};

export default function BrandManager() {
  const { data } = useBrandQuery();
  const brand = data ?? STORE_DEFAULTS;
  const title = brand.tagline ? `${brand.name} | ${brand.tagline}` : brand.name;

  useEffect(() => {
    if (!data) return; // os valores-base já foram aplicados por bootTheme() em src/main.tsx
    applyTheme(data.theme);
    rememberTheme(data.theme);
    setAttr('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', 'content', data.description);
    setAttr('meta[property="og:site_name"]', 'content', data.name);
    setAttr('meta[property="og:title"], meta[name="twitter:title"]', 'content', title);
    setAttr('meta[property="og:image"], meta[name="twitter:image"]', 'content', data.shareImage);
    setAttr('link[rel="icon"]:not([sizes])', 'href', data.favicon);
  }, [data, title]);

  return <Helmet defaultTitle={title} />;
}
