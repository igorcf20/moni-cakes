import { ShoppingBag, Heart, CreditCard, Truck } from "lucide-react";

const steps = [
  {
    icon: ShoppingBag,
    number: "01",
    title: "Explore o catálogo",
    description: "Navegue por categorias ou pesquise o produto ideal para você",
  },
  {
    icon: Heart,
    number: "02",
    title: "Escolha & personalize",
    description: "Selecione variações, tamanhos e adicione ao carrinho",
  },
  {
    icon: CreditCard,
    number: "03",
    title: "Compra segura",
    description: "Checkout rápido com múltiplas opções de pagamento",
  },
  {
    icon: Truck,
    number: "04",
    title: "Receba em casa",
    description: "Entrega rastreada via CTT em Portugal e toda a Europa",
  },
];

const HowItWorks = () => {
  return (
    <section
      id="como-funciona"
      className="py-20 md:py-24 bg-brand-cream text-brand-text-light relative"
    >
      <div className="container mx-auto px-4 lg:px-8 relative">
        <div className="text-center space-y-3 mb-16">
          <div className="flex items-center justify-center gap-3">
            <span className="hidden sm:block h-px w-10 bg-brand-gold/50" />
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-brand-gold-dark">
              Simples & seguro
            </p>
            <span className="hidden sm:block h-px w-10 bg-brand-gold/50" />
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-light text-brand-text-light">
            Como <span className="italic text-brand-gold-dark">comprar</span>
          </h2>
          <p className="text-brand-cream-muted max-w-xl mx-auto text-sm font-normal">
            Processo simples e seguro em 4 passos
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-8 md:gap-6 stagger-fade-in">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isLast = index === steps.length - 1;
            return (
              <div key={index} className="relative text-center group">
                {!isLast && (
                  <div className="hidden md:block absolute top-10 left-[calc(50%+40px)] right-[-50%] h-px bg-gradient-to-r from-brand-cream-border to-transparent z-0" />
                )}
                <div className="relative z-10 flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-brand-cream-card border border-brand-cream-border flex items-center justify-center group-hover:border-brand-gold transition-all duration-300">
                      <Icon
                        className="h-7 w-7 text-brand-gold-dark"
                        strokeWidth={1.5}
                      />
                    </div>
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-brand-gold text-brand-text-light text-[10px] font-medium flex items-center justify-center">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="text-base font-medium text-brand-text-light">
                    {step.title}
                  </h3>
                  <p className="text-xs text-brand-cream-muted max-w-[180px] mx-auto leading-relaxed font-normal">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
