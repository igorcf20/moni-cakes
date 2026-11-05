import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1] as const;

/** Valor que desliza até ao novo número (sem animação com "reduzir movimento"). */
export function AnimatedValue({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) { el.textContent = format(value); last.current = value; return; }
    const c = animate(last.current, value, { duration: 0.45, ease: EASE, onUpdate: (n) => { el.textContent = format(n); last.current = n; } });
    return () => c.stop();
  }, [value, format, reduce]);
  return <span ref={ref} className={className}>{format(value)}</span>;
}

