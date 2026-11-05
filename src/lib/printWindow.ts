// =====================================================================================
// Imprimir um HTML sem abrir janela (nada de bloqueio de pop-up): iframe escondido, espera carregar, abre o diálogo
// de impressão do navegador e limpa depois. Usado pelos documentos do pedido (printDocs.ts) e pelas etiquetas de produto.
// O HTML é montado por funções que passam tudo por esc(); aqui só se escreve no iframe do próprio site.
// =====================================================================================

/** Imprime o HTML (corpo + <style>) pelo diálogo do navegador. Resolve quando o diálogo foi aberto e fechado. */
export function printHtml(html: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('print_unavailable')); return; }
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      window.setTimeout(() => frame.remove(), 500);
      if (err) reject(err); else resolve();
    };
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) { finish(new Error('print_unavailable')); return; }
      win.addEventListener('afterprint', () => finish());
      // Dá um instante para o desenho dos SVG dos códigos de barras antes de abrir o diálogo.
      window.setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch (e) {
          finish(e instanceof Error ? e : new Error('print_failed'));
          return;
        }
        // Alguns navegadores não disparam afterprint: não deixar a promessa pendurada.
        window.setTimeout(() => finish(), 1500);
      }, 150);
    };
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title></title></head><body>${html}</body></html>`;
    document.body.appendChild(frame);
  });
}
