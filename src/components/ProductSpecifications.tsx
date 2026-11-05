import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ruler, Weight, Box, Boxes } from "lucide-react";

interface ProductSpecificationsProps {
  dimensions?: {
    width: number;
    height: number;
    depth: number;
  };
  weight?: number;
  material?: string;
  stock_quantity?: number;
  specifications?: Record<string, any>;
}

const ProductSpecifications = ({
  dimensions,
  weight,
  material,
  stock_quantity,
  specifications = {},
}: ProductSpecificationsProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Box className="h-5 w-5" />
          Especificações do Produto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {dimensions && (
          <div className="flex items-start gap-3">
            <Ruler className="h-5 w-5 text-muted-foreground mt-1" />
            <div>
              <p className="font-semibold">Dimensões</p>
              <p className="text-sm text-muted-foreground">
                {dimensions.width} × {dimensions.height} × {dimensions.depth} cm
              </p>
            </div>
          </div>
        )}

        {weight && (
          <div className="flex items-start gap-3">
            <Weight className="h-5 w-5 text-muted-foreground mt-1" />
            <div>
              <p className="font-semibold">Peso</p>
              <p className="text-sm text-muted-foreground">{weight} kg</p>
            </div>
          </div>
        )}

        {material && (
          <div className="flex items-start gap-3">
            <Box className="h-5 w-5 text-muted-foreground mt-1" />
            <div>
              <p className="font-semibold">Material</p>
              <p className="text-sm text-muted-foreground">{material}</p>
            </div>
          </div>
        )}

        {stock_quantity !== undefined && (
          <div className="flex items-start gap-3">
            <Boxes className="h-5 w-5 text-muted-foreground mt-1" />
            <div>
              <p className="font-semibold">Disponibilidade</p>
              {stock_quantity > 0 ? (
                <Badge variant="secondary">{stock_quantity} em stock</Badge>
              ) : (
                <Badge variant="destructive">Esgotado</Badge>
              )}
            </div>
          </div>
        )}

        {Object.keys(specifications).length > 0 && (
          <div className="pt-4 border-t space-y-2">
            <p className="font-semibold">Especificações Adicionais</p>
            {Object.entries(specifications).map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-muted-foreground capitalize">{key}:</span>
                <span>{String(value)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductSpecifications;
