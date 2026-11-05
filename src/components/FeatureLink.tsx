// Link para uma página de recurso opcional (/favoritos, /orcamento-3d, /personalizar): some com o recurso desligado
// em Admin > Recursos da loja. Para outros endereços funciona como o Link normal.
import { Link, type LinkProps } from "react-router-dom";
import { useHrefOn } from "@/hooks/useFeatures";

export default function FeatureLink(props: LinkProps & { to: string }) {
  const on = useHrefOn();
  return on(props.to) ? <Link {...props} /> : null;
}
