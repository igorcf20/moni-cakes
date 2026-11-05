// Prévia de um documento de impressão (src/lib/orderPrint.ts) num iframe: mostra as páginas no tamanho real do papel,
// reduzidas para caber na largura disponível, e imprime só o documento (ref.print()), sem abrir janela nova.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type PrintFrameHandle = { print: () => boolean };

const PrintFrame = forwardRef<PrintFrameHandle, { html: string; title: string; className?: string; maxHeight?: number; onReady?: () => void }>(
  function PrintFrame({ html, title, className, maxHeight, onReady }, ref) {
    const frame = useRef<HTMLIFrameElement>(null);
    const box = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [avail, setAvail] = useState(0);

    const measure = useCallback(() => {
      const doc = frame.current?.contentDocument;
      if (!doc?.body) return;
      setSize({ w: doc.documentElement.scrollWidth, h: doc.documentElement.scrollHeight });
    }, []);

    useEffect(() => {
      const el = box.current;
      if (!el) return;
      const ro = new ResizeObserver(() => setAvail(el.clientWidth));
      ro.observe(el);
      setAvail(el.clientWidth);
      return () => ro.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      print: () => {
        const win = frame.current?.contentWindow;
        if (!win) return false;
        win.focus();
        win.print();
        return true;
      },
    }), []);

    const scale = size.w && avail ? Math.min(1, avail / size.w) : 1;
    const height = size.h ? size.h * scale : 480;
    return (
      <div ref={box} className={cn("w-full overflow-hidden rounded-[16px] border bg-[#e9e6e1]", className)}
        style={{ height: maxHeight ? Math.min(height, maxHeight) : height, overflowY: maxHeight && height > maxHeight ? "auto" : "hidden" }}>
        <iframe
          ref={frame}
          title={title}
          srcDoc={html}
          onLoad={() => { measure(); window.setTimeout(measure, 300); onReady?.(); }}
          className="block origin-top-left border-0 bg-transparent"
          style={{ width: size.w || "100%", height: size.h || 480, transform: `scale(${scale})` }}
        />
      </div>
    );
  },
);

export default PrintFrame;
