import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Cinco estrelas laranja com meio ponto (mesmo desenho do ProductCard3D). Decorativas: o texto da nota vai ao lado. */
export function RatingStars({ value, size = 'md', className }: { value: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span className={cn('flex items-center gap-0.5', className)} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          strokeWidth={1.7}
          className={cn(box, value >= i - 0.25 ? 'fill-primary text-primary' : value >= i - 0.75 ? 'fill-primary/40 text-primary' : 'text-border')}
        />
      ))}
    </span>
  );
}
