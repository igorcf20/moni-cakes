// Classes partilhadas pelas listagens (visual editorial PRINT3D: botões e chips em pílula, cor da marca, alvos de 44px).
export const btnPrimary =
  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export const btnSecondary =
  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-foreground/20 bg-white px-6 text-[15px] font-medium text-foreground transition-colors duration-150 hover:border-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Chip de navegação ou filtro (subcategorias, atalhos). */
export const chip =
  'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[14px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
export const chipIdle = 'border-border bg-white text-foreground hover:border-foreground/40';
export const chipActive = 'border-primary bg-primary text-primary-foreground';

/* Grade de produtos das listagens: catalogGrid (src/lib/catalogPage.ts), conforme Admin > Página de catálogo. */
/** Grade sem a coluna de filtros (catálogo vazio). */
export const productGridWide = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4';
