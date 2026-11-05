import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Mariana C.",
    text: "A qualidade do algodão é incrível e a mensagem da t-shirt abre portas para conversas sobre fé no meu dia a dia. Já é a minha terceira compra!",
    rating: 5,
    city: "Lisboa, Portugal",
    avatar: "MC",
  },
  {
    name: "João P.",
    text: "Encomendei para o nosso grupo de jovens da igreja e chegou super rápido via CTT. Design moderno, acabamento premium. Recomendo a todos.",
    rating: 5,
    city: "Porto, Portugal",
    avatar: "JP",
  },
  {
    name: "Sofia R.",
    text: "Finalmente uma marca cristã com estética cuidada. Uso a minha t-shirt na faculdade e recebo elogios sempre. Vestir a fé com estilo!",
    rating: 5,
    city: "Braga, Portugal",
    avatar: "SR",
  },
];

const TestimonialSection = () => {
  return (
    <section className="py-16 md:py-24 bg-muted/20">
      <div className="container mx-auto px-4">
        <div className="text-center space-y-4 mb-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">Testemunhos</p>
          <div className="flex items-center justify-center gap-3">
            <span className="hidden sm:block h-px w-10 bg-primary/50" />
            <h2 className="font-display text-3xl md:text-4xl font-light">
              Vozes de quem <span className="italic text-primary">veste a fé</span>
            </h2>
            <span className="hidden sm:block h-px w-10 bg-primary/50" />
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-primary text-primary" />
            ))}
            <span className="text-sm font-semibold ml-1">4.9</span>
            <span className="text-xs text-muted-foreground">· +2.400 avaliações</span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-5 md:gap-6 max-w-5xl mx-auto">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="group relative bg-card border border-border/40 hover:border-primary/40 transition-all duration-500 p-7 flex flex-col"
            >
              <Quote className="h-8 w-8 text-primary/20 mb-4" strokeWidth={1.5} />
              <p className="font-display text-base md:text-lg leading-relaxed text-foreground/85 italic flex-1">
                "{t.text}"
              </p>
              <div className="flex items-center gap-3 pt-5 mt-5 border-t border-border/30">
                <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold flex-shrink-0 tracking-wider">
                  {t.avatar}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground tracking-wide">{t.city}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} className="h-3 w-3 fill-primary text-primary" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialSection;
