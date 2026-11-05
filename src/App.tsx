import React, { lazy, Suspense, useEffect } from "react";
import FeatureRoute from "@/components/FeatureRoute";
import AffiliateCapture from "@/components/AffiliateCapture";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useCurrency } from "@/hooks/use-currency";
import { useFeature } from "@/hooks/useFeatures";
import { CountrySync, useCountry } from "@/lib/countries";
import Index from "./pages/Index";
const Products = lazy(() => import("./pages/Products"));
const Brands = lazy(() => import("./pages/Brands"));
const VendorPage = lazy(() => import("./pages/VendorPage"));
const SellWithUs = lazy(() => import("./pages/SellWithUs"));
const AffiliateProgram = lazy(() => import("./pages/AffiliateProgram"));
const QuoteRequest = lazy(() => import("./pages/QuoteRequest"));
const Blog = lazy(() => import("./pages/Blog"));
const StoreReviews = lazy(() => import("./pages/StoreReviews"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Polls = lazy(() => import("./pages/Polls"));
const Forum = lazy(() => import("./pages/Forum"));
const ForumTopic = lazy(() => import("./pages/ForumTopic"));
const PunchoutStart = lazy(() => import("./pages/PunchoutStart"));
const PunchoutTest = lazy(() => import("./pages/PunchoutTest"));
const NewsletterUnsubscribe = lazy(() => import("./pages/NewsletterUnsubscribe"));
const BrandRedirect = lazy(() => import("./pages/Brands").then((m) => ({ default: m.BrandRedirect })));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Customizer = lazy(() => import("./pages/Customizer"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminOrderPage = lazy(() => import("./pages/admin/AdminOrderPage"));
const AdminOrderNewPage = lazy(() => import("./pages/admin/AdminOrderNewPage"));
const AdminCustomerPage = lazy(() => import("./pages/admin/AdminCustomerPage"));
const AdminCustomerFormPage = lazy(() => import("./pages/admin/AdminCustomerFormPage"));
const AdminCouponPage = lazy(() => import("./pages/admin/AdminCouponPage"));
const AdminProductStatsPage = lazy(() => import("./pages/admin/AdminProductStatsPage"));
const AdminCategoryPage = lazy(() => import("./pages/admin/AdminCategoryPage"));
const AdminCategoryFormPage = lazy(() => import("./pages/admin/AdminCategoryFormPage"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Category = lazy(() => import("./pages/Category"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const VivaReturn = lazy(() => import("./pages/VivaReturn"));
const OrderTracking = lazy(() => import("./pages/OrderTracking"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const ReturnsPolicy = lazy(() => import("./pages/ReturnsPolicy"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const Cart = lazy(() => import("./pages/Cart"));
const AdminProductEdit = lazy(() => import("./pages/AdminProductEdit"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Faq = lazy(() => import("./pages/Faq"));
const LeaveReview = lazy(() => import("./pages/LeaveReview"));
const Contact = lazy(() => import("./pages/Contact"));
const About = lazy(() => import("./pages/About"));
const OrderConfigure = lazy(() => import("./pages/OrderConfigure"));
const ReviewProduct = lazy(() => import("./pages/ReviewProduct"));
const ReviewOrder = lazy(() => import("./pages/ReviewOrder"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const HelpAndTerms = lazy(() => import("./pages/HelpAndTerms"));
const Kits = lazy(() => import("./pages/Kits"));
const KitDetail = lazy(() => import("./pages/KitDetail"));
const Orcamento3D = lazy(() => import("./pages/Orcamento3D"));
const Personalizar = lazy(() => import("./pages/Personalizar"));
const Compare = lazy(() => import("./pages/Compare"));
const LeadPopups = lazy(() => import("./components/popups/LeadPopups"));

import FloatingActions from "./components/FloatingActions";
import ScrollToTop from "./components/ScrollToTop";
import ScrollProgress from "./components/ScrollProgress";
import BrandManager from "./components/brand/BrandManager";
import WhatsAppButton from "./components/WhatsAppButton";
import CookieConsent from "./components/CookieConsent";
import ConsentScripts from "./components/privacy/ConsentScripts";
import CartSheet from "./components/CartSheet";
import { CartReservationSync } from "./components/cart/CartReservation";
import PostAuthRedirect from "./components/PostAuthRedirect";
import MobileTabBar from "./components/MobileTabBar";
import PageTransition from "./components/PageTransition";
import PunchoutBar, { PunchoutCheckoutGuard } from "./components/punchout/PunchoutBar";
import CompareBar from "./components/compare/CompareBar";

const queryClient = new QueryClient();

// Taxas de câmbio da loja e moeda do país escolhido pelo cliente.
const CurrencyLoader = () => {
  const { fetchRates, setCurrency, isLoading, rates, baseCurrency } = useCurrency();
  const country = useCountry();
  useEffect(() => {
    fetchRates();
  }, [fetchRates]);
  // Só mostra na moeda do país se a loja tiver taxa de câmbio para ela; senão, na moeda base.
  useEffect(() => {
    if (isLoading) return;
    const target = country.currency;
    setCurrency((target === baseCurrency || rates[target] ? target : baseCurrency) as any);
  }, [country.currency, isLoading, rates, baseCurrency, setCurrency]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Toaster />
    <Sonner />
    <CountrySync />
    <CurrencyLoader />
    <BrandManager />
    <BrowserRouter>
      <ScrollToTop />
      <Routes>


        <Route path="*" element={<StoreShell />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);
export default App;

/** A loja (tudo menos os protótipos de cliente). */
const StoreShell = () => (
    <>
      <AffiliateCapture />
      <CartReservationSync />
      <CompareBar />
      <PostAuthRedirect />
      <ScrollProgress />
      <div className="min-h-screen">
        <PunchoutBar />
        <PageTransition>
        <Suspense fallback={<div className="min-h-[60vh]" />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/produtos" element={<Products />} />
          <Route path="/marcas" element={<FeatureRoute feature="brands"><Brands /></FeatureRoute>} />
          <Route path="/marca/:slug" element={<FeatureRoute feature="brands"><BrandRedirect /></FeatureRoute>} />
          <Route path="/vendedor/:slug" element={<FeatureRoute feature="marketplace"><VendorPage /></FeatureRoute>} />
          <Route path="/vender" element={<FeatureRoute feature="marketplace"><SellWithUs /></FeatureRoute>} />
          <Route path="/afiliados" element={<FeatureRoute feature="affiliates"><AffiliateProgram /></FeatureRoute>} />
          <Route path="/pedido-de-orcamento" element={<FeatureRoute feature="quotes"><QuoteRequest /></FeatureRoute>} />
          <Route path="/avaliacoes" element={<FeatureRoute feature="store_reviews"><StoreReviews /></FeatureRoute>} />
          <Route path="/blog" element={<FeatureRoute feature="blog"><Blog /></FeatureRoute>} />
          <Route path="/blog/:slug" element={<FeatureRoute feature="blog"><BlogPost /></FeatureRoute>} />
          <Route path="/enquetes" element={<FeatureRoute feature="polls"><Polls /></FeatureRoute>} />
          <Route path="/forum" element={<FeatureRoute feature="forum"><Forum /></FeatureRoute>} />
          <Route path="/forum/topico/:id" element={<FeatureRoute feature="forum"><ForumTopic /></FeatureRoute>} />
          <Route path="/forum/:slug" element={<FeatureRoute feature="forum"><Forum /></FeatureRoute>} />
          <Route path="/punchout/entrar" element={<FeatureRoute feature="punchout"><PunchoutStart /></FeatureRoute>} />
          <Route path="/punchout/teste" element={<FeatureRoute feature="punchout"><PunchoutTest /></FeatureRoute>} />
          {/* Link "cancelar inscrição" dos e-mails: sempre ativo, mesmo com as campanhas desligadas. */}
          <Route path="/newsletter/cancelar" element={<NewsletterUnsubscribe />} />
          <Route path="/categoria/:slug" element={<Category />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/produto/:id" element={<AdminProductEdit />} />
          {/* Páginas próprias do Admin (sem janelas por cima): pedido, cliente, cupom, criar e editar */}
          <Route path="/admin/pedidos/novo" element={<AdminOrderNewPage />} />
          <Route path="/admin/pedidos/:id" element={<AdminOrderPage />} />
          <Route path="/admin/clientes/novo" element={<AdminCustomerFormPage />} />
          <Route path="/admin/clientes/:id" element={<AdminCustomerPage />} />
          <Route path="/admin/clientes/:id/editar" element={<AdminCustomerFormPage />} />
          <Route path="/admin/cupons/novo" element={<AdminCouponPage />} />
          <Route path="/admin/cupons/:id" element={<AdminCouponPage />} />
          <Route path="/admin/produtos/:id" element={<AdminProductStatsPage />} />
          <Route path="/admin/categorias/nova" element={<AdminCategoryFormPage />} />
          <Route path="/admin/categorias/:id" element={<AdminCategoryPage />} />
          <Route path="/admin/categorias/:id/editar" element={<AdminCategoryFormPage />} />
          <Route path="/shop-kodeadmin" element={<AdminLogin />} />
          <Route path="/carrinho" element={<Cart />} />
          <Route path="/checkout" element={<PunchoutCheckoutGuard><Checkout /></PunchoutCheckoutGuard>} />
          <Route path="/pedido/:orderId/sucesso" element={<OrderSuccess />} />
          <Route path="/pagamento/viva/retorno" element={<VivaReturn />} />
          <Route path="/pedido/:orderId/configurar" element={<OrderConfigure />} />
          <Route path="/rastrear" element={<OrderTracking />} />
          <Route path="/minhas-compras" element={<MyOrders />} />
          <Route path="/politica-privacidade" element={<PrivacyPolicy />} />
          <Route path="/termos" element={<TermsOfService />} />
          <Route path="/devolucoes" element={<ReturnsPolicy />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/como-utilizar" element={<Navigate to="/faq" replace />} />
          <Route path="/deixar-avaliacao" element={<LeaveReview />} />
          <Route path="/contatos" element={<Contact />} />
          <Route path="/sobre" element={<About />} />
          <Route path="/produto/:id" element={<ProductDetail />} />
          <Route path="/favoritos" element={<FeatureRoute feature="wishlist"><Wishlist /></FeatureRoute>} />
          <Route path="/customizar/:id" element={<Customizer />} />
          {/* /configurar/:slug desativado — usar /produto/:id com QuickUpload. */}
          <Route path="/avaliar/:orderId/:productId" element={<ReviewProduct />} />
          <Route path="/avaliar/pedido/:orderId" element={<ReviewOrder />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/ajuda" element={<HelpAndTerms />} />
          <Route path="/kits" element={<FeatureRoute feature="kits"><Kits /></FeatureRoute>} />
          <Route path="/kit/:slug" element={<FeatureRoute feature="kits"><KitDetail /></FeatureRoute>} />
          <Route path="/orcamento-3d" element={<FeatureRoute feature="quote_3d"><Orcamento3D /></FeatureRoute>} />
          <Route path="/personalizar" element={<FeatureRoute feature="customizer"><Personalizar /></FeatureRoute>} />
          <Route path="/comparar" element={<FeatureRoute feature="compare"><Compare /></FeatureRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </PageTransition>
        <FloatingActions />
        <WhatsAppButton />
        <CookieConsent />
        <SitePopups />
        <ConsentScripts />
        <CartSheet />
        <MobileTabBar />
        {/* Spacer to prevent content being hidden behind the mobile tab bar */}
        <div className="md:hidden h-16" aria-hidden="true" />
      </div>
    </>
);

/** Pop-ups de captação (Admin > Pop-ups de captação); o código só é baixado com o recurso ligado. */
function SitePopups() {
  const on = useFeature("lead_popups");
  if (!on) return null;
  return <Suspense fallback={null}><LeadPopups /></Suspense>;
}
