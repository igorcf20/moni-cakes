import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useReviews } from "@/hooks/useReviews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Star, User as UserIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ProductReviewsProps {
  productId: string;
}

const ProductReviews = ({ productId }: ProductReviewsProps) => {
  const { user } = useAuth();
  const { reviews, addReview, averageRating, totalReviews } = useReviews(productId);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Tem de iniciar sessão para avaliar.");
      return;
    }
    addReview({ rating, title, comment, user_id: user.id });
    setShowForm(false);
    setTitle("");
    setComment("");
    setRating(5);
  };

  const userHasReviewed = reviews.some(review => review.user_id === user?.id);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Avaliações</CardTitle>
            {user && !userHasReviewed && (
              <Button onClick={() => setShowForm(!showForm)}>
                {showForm ? "Cancelar" : "Escrever Avaliação"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {totalReviews > 0 && (
            <div className="flex items-center gap-4 mb-6 pb-6 border-b">
              <div className="text-center">
                <div className="text-4xl font-bold">{averageRating.toFixed(1)}</div>
                <div className="flex gap-1 justify-center mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${
                        star <= Math.round(averageRating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalReviews} {totalReviews === 1 ? "avaliação" : "avaliações"}
                </p>
              </div>
            </div>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4 mb-6 p-4 bg-muted rounded-lg">
              <div>
                <label className="text-sm font-medium mb-2 block">Sua avaliação</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`h-6 w-6 ${
                          star <= rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Input
                  placeholder="Título da avaliação"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <Textarea
                  placeholder="Conte-nos sobre sua experiência com o produto..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                />
              </div>
              <Button type="submit">Publicar Avaliação</Button>
            </form>
          )}

          <div className="space-y-4">
            {reviews.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Seja o primeiro a avaliar este produto!
              </p>
            ) : (
              reviews.map((review) => (
                <div key={review.id} className="border-b pb-6 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-border/40">
                        <AvatarImage src={review.user_profiles?.avatar_url || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <UserIcon className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {review.user_profiles?.display_name || "Cliente verificado"}
                        </p>
                        <div className="flex gap-0.5 mt-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3 w-3 ${
                                star <= review.rating
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-gray-200"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                      {format(new Date(review.created_at), "dd MMM yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="pl-[52px]">
                    <h4 className="font-bold text-sm mb-1">{review.title}</h4>
                    {review.comment && (
                      <p className="text-sm text-muted-foreground leading-relaxed italic">
                        "{review.comment}"
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductReviews;
