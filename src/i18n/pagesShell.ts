// Textos dos componentes globais da área institucional: barra de navegação do celular, botão voltar ao topo
// e avisos do envio de avaliações (useReviews). Ficam separados de ./pages.ts porque estes componentes entram
// no pacote inicial do site, e os textos longos das páginas (FAQ, Sobre...) só devem carregar com as páginas.
// Sem emojis nem travessões em textos visíveis.
import { defineMessages } from '@/i18n';

const ptBR = {
  tabNav: 'Navegação principal',
  tabHome: 'Início',
  tabProducts: 'Produtos',
  tabCart: 'Carrinho',
  tabCartCount: 'Carrinho, {count} itens',
  tabCartCountOne: 'Carrinho, 1 item',
  tabHelp: 'Ajuda',
  tabAccount: 'Conta',
  tabSignIn: 'Entrar',
  backToTop: 'Voltar ao topo',
  reviewSent: 'Avaliação enviada para aprovação.',
  reviewError: 'Não foi possível enviar a avaliação. Tente de novo.',
};

export const shellMessages = defineMessages({
  'pt-BR': ptBR,
  'pt-PT': {
    ...ptBR,
    reviewError: 'Não foi possível enviar a avaliação. Tente novamente.',
  },
  en: {
    tabNav: 'Main navigation',
    tabHome: 'Home',
    tabProducts: 'Products',
    tabCart: 'Cart',
    tabCartCount: 'Cart, {count} items',
    tabCartCountOne: 'Cart, 1 item',
    tabHelp: 'Help',
    tabAccount: 'Account',
    tabSignIn: 'Sign in',
    backToTop: 'Back to top',
    reviewSent: 'Review sent for approval.',
    reviewError: 'We could not send your review. Please try again.',
  },
  es: {
    tabNav: 'Navegación principal',
    tabHome: 'Inicio',
    tabProducts: 'Productos',
    tabCart: 'Carrito',
    tabCartCount: 'Carrito, {count} artículos',
    tabCartCountOne: 'Carrito, 1 artículo',
    tabHelp: 'Ayuda',
    tabAccount: 'Cuenta',
    tabSignIn: 'Entrar',
    backToTop: 'Volver arriba',
    reviewSent: 'Opinión enviada para aprobación.',
    reviewError: 'No se pudo enviar la opinión. Inténtalo de nuevo.',
  },
});
