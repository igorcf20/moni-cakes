const VerseHighlight = () => {
  return (
    <section className="relative py-20 md:py-28 bg-foreground overflow-hidden">
      {/* Decorative gold lines */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-primary">
            Versículo em destaque
          </p>

          <div className="flex items-center justify-center gap-4">
            <span className="h-px w-12 bg-primary/50" />
            <span className="text-primary text-2xl">✦</span>
            <span className="h-px w-12 bg-primary/50" />
          </div>

          <blockquote className="font-display text-2xl md:text-4xl lg:text-5xl font-light italic text-background leading-[1.3]">
            "Porque para mim o viver é Cristo,
            <br className="hidden md:block" />
            {" "}e o morrer é ganho."
          </blockquote>

          <p className="text-primary text-sm md:text-base font-medium tracking-[0.25em] uppercase">
            Filipenses 1:21
          </p>
        </div>
      </div>
    </section>
  );
};

export default VerseHighlight;
