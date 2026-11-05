import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/utils/currency";
import { useCurrency } from "@/hooks/use-currency";

const Customizer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCurrency, convert } = useCurrency();

  const { data: product, isLoading } = useQuery({
    queryKey: ["customizable-product", id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .eq("customizable", true)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="py-12 md:py-20">
          <div className="container mx-auto px-4">
            <Card>
              <CardContent className="py-12 text-center">
                <h1 className="text-2xl font-bold mb-4">Personalização não disponível</h1>
                <p className="text-muted-foreground mb-6">
                  Este produto não está disponível para personalização no momento.
                </p>
                <Button onClick={() => navigate("/produtos")}>
                  Ver Produtos
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="py-8 md:py-12">
        <div className="container mx-auto px-4">
          <Button 
            variant="ghost" 
            className="mb-6"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          <div className="bg-card rounded-lg p-6 shadow-soft mb-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl md:text-3xl font-bold">{product.name}</h1>
              <p className="text-xl font-semibold text-primary">{formatPrice(convert(Number(product.price)), currentCurrency)}</p>
            </div>
          </div>

          <Card>
            <CardContent className="py-12 text-center">
              <h2 className="text-xl font-semibold mb-4">
                Ferramenta de Personalização
              </h2>
              <p className="text-muted-foreground mb-6">
                A personalização para este produto estará disponível em breve.
              </p>
              <div className="flex justify-center gap-4">
                <Button onClick={() => navigate(`/produto/${product.id}`)}>
                  Ver Detalhes do Produto
                </Button>
                <Button variant="outline" onClick={() => navigate("/produtos")}>
                  Ver Outros Produtos
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Customizer;
