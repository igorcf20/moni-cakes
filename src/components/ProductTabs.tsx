import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Truck, FileText, Package } from "lucide-react";

interface ProductTabsProps {
  description?: string;
  shippingInfo?: string;
}

const ProductTabs = ({ 
  description, 
  shippingInfo 
}: ProductTabsProps) => {
  return (
    <Tabs defaultValue="description" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="description" className="gap-2">
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">Descrição</span>
        </TabsTrigger>
        <TabsTrigger value="shipping" className="gap-2">
          <Truck className="h-4 w-4" />
          <span className="hidden sm:inline">Entrega</span>
        </TabsTrigger>
        <TabsTrigger value="warranty" className="gap-2">
          <Shield className="h-4 w-4" />
          <span className="hidden sm:inline">Garantia</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="description" className="mt-6">
        <Card>
          <CardContent className="pt-6">
            <div className="prose prose-sm max-w-none">
              <p className="text-muted-foreground leading-relaxed">
                {description || "Descrição detalhada do produto não disponível."}
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="shipping" className="mt-6">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <Truck className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Envio Rápido</h4>
                <p className="text-sm text-muted-foreground">
                  {shippingInfo || "Entregamos para todo Portugal. Prazo de 1 a 3 dias úteis (continente)."}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Embalagem Segura</h4>
                <p className="text-sm text-muted-foreground">
                  Produtos cuidadosamente embalados para garantir que chegam perfeitos.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="warranty" className="mt-6">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Garantia de 90 Dias</h4>
                <p className="text-sm text-muted-foreground">
                  Todos os nossos produtos têm garantia de 90 dias contra defeitos de fabrico.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Troca Fácil</h4>
                <p className="text-sm text-muted-foreground">
                  Se não ficar satisfeito, pode trocar o produto em até 7 dias.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default ProductTabs;
