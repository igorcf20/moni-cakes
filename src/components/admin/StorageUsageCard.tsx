import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { HardDrive, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type UsageResponse = {
  limit_bytes: number;
  used_bytes: number;
  used_pct: number;
  buckets: { name: string; bytes: number; count: number }[];
};

const fmt = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

const StorageUsageCard = () => {
  const { data, isLoading, error } = useQuery<UsageResponse>({
    queryKey: ["storage-usage"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("storage-usage");
      if (error) throw error;
      return data as UsageResponse;
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="h-4 w-4" /> Armazenamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Armazenamento — indisponível
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const pct = Math.min(100, data.used_pct);
  const color =
    pct >= 95 ? "text-destructive" : pct >= 80 ? "text-amber-600" : "text-primary";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary" /> Armazenamento da Loja
        </CardTitle>
        <CardDescription>
          Limite de {fmt(data.limit_bytes)} para imagens, ficheiros de impressão e banners.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <span className={`text-2xl font-bold ${color}`}>{fmt(data.used_bytes)}</span>
            <span className="text-xs text-muted-foreground">de {fmt(data.limit_bytes)} ({pct.toFixed(1)}%)</span>
          </div>
          <Progress value={pct} className="h-2" />
          {pct >= 95 && (
            <p className="text-xs text-destructive mt-2 flex gap-1 items-center">
              <AlertTriangle className="h-3 w-3" /> Espaço crítico — elimina ficheiros antigos.
            </p>
          )}
          {pct >= 80 && pct < 95 && (
            <p className="text-xs text-amber-600 mt-2">
              Aviso: a aproximar-se do limite de 2 GB.
            </p>
          )}
        </div>

        <div className="space-y-1.5 pt-2 border-t">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Uso por bucket
          </p>
          {data.buckets
            .sort((a, b) => b.bytes - a.bytes)
            .map((b) => (
              <div key={b.name} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{b.name}</span>
                <span className="font-medium">
                  {fmt(b.bytes)} <span className="text-muted-foreground">({b.count})</span>
                </span>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default StorageUsageCard;