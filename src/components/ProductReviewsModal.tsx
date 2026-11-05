import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useReviews } from "@/hooks/useReviews";

interface Props {
  productId: string;
  productName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const ProductReviewsModal = ({ productId, productName, open, onOpenChange }: Props) => {
  const { reviews, averageRating, totalReviews } = useReviews(productId);
  const [filter, setFilter] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);

  const distribution = useMemo(() => {
    const d = [0, 0, 0, 0, 0];
    reviews.forEach((r) => {
      const idx = Math.min(5, Math.max(1, r.rating)) - 1;
      d[idx] += 1;
    });
    return d;
  }, [reviews]);

  const filtered = filter === 0 ? reviews : reviews.filter((r) => r.rating === filter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Avaliações{productName ? ` — ${productName}` : ""}
          </DialogTitle>
        </DialogHeader>

        {totalReviews === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            Ainda sem avaliações para este produto.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-6 items-center">
              <div className="text-center">
                <div className="text-4xl font-bold">{averageRating.toFixed(1).replace(".", ",")}</div>
                <div className="flex gap-0.5 justify-center mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`h-4 w-4 ${s <= Math.round(averageRating) ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalReviews} {totalReviews === 1 ? "avaliação" : "avaliações"}
                </p>
              </div>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((s) => {
                  const n = distribution[s - 1];
                  const pct = totalReviews > 0 ? (n / totalReviews) * 100 : 0;
                  return (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setFilter(filter === s ? 0 : (s as any))}
                      className={`w-full flex items-center gap-2 text-xs group ${filter === s ? "opacity-100" : "opacity-90 hover:opacity-100"}`}
                    >
                      <span className="w-8 shrink-0 text-left">{s}★</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${filter === s ? "bg-primary" : "bg-primary/70 group-hover:bg-primary"} transition-colors`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right text-muted-foreground">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={filter === 0 ? "default" : "outline"} onClick={() => setFilter(0)} className="h-8 text-xs">
                Todas ({totalReviews})
              </Button>
              {[5, 4, 3, 2, 1].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={filter === s ? "default" : "outline"}
                  onClick={() => setFilter(s as any)}
                  className="h-8 text-xs gap-1"
                  disabled={distribution[s - 1] === 0}
                >
                  {s}★ ({distribution[s - 1]})
                </Button>
              ))}
            </div>

            <div className="space-y-4 pt-2 border-t">
              {filtered.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">Sem avaliações neste filtro.</p>
              ) : (
                filtered.map((review) => (
                  <div key={review.id} className="border-b pb-4 last:border-0">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border/40">
                          <AvatarImage src={(review as any).user_profiles?.avatar_url || ""} />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            <UserIcon className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-semibold">
                            {(review as any).user_profiles?.display_name || (review as any).customer_name || "Cliente verificado"}
                          </p>
                          <div className="flex gap-0.5 mt-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star key={s} className={`h-3 w-3 ${s <= review.rating ? "fill-primary text-primary" : "text-muted-foreground/20"}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        {format(new Date(review.created_at), "dd MMM yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="pl-12">
                      <h4 className="font-bold text-sm mb-1">{review.title}</h4>
                      {review.comment && (
                        <p className="text-sm text-muted-foreground leading-relaxed italic">"{review.comment}"</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProductReviewsModal;
