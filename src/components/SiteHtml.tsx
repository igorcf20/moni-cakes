// Texto rico escrito no Admin (páginas da loja): limpo com DOMPurify antes de entrar na página e desenhado com os
// estilos de texto da marca. Links para fora do site abrem noutro separador.
import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

export const siteProse =
  'prose prose-neutral max-w-none text-[16px] leading-relaxed md:text-[17px] prose-headings:font-bold prose-headings:tracking-[-0.02em] prose-headings:text-foreground prose-h2:text-[24px] md:prose-h2:text-[28px] prose-p:text-brand-ink-soft prose-li:text-brand-ink-soft prose-strong:text-foreground prose-a:font-semibold prose-a:text-brand-orange-text prose-blockquote:border-primary/40 prose-blockquote:text-brand-ink-soft';

export default function SiteHtml({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => {
    const out = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    if (typeof window === 'undefined') return out;
    const doc = new DOMParser().parseFromString(out, 'text/html');
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href) && !href.startsWith(window.location.origin)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      } else {
        a.removeAttribute('target');
      }
    });
    return doc.body.innerHTML;
  }, [html]);
  return <div className={cn(siteProse, className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}
