// Página de um recurso opcional (Admin > Recursos da loja): com o recurso desligado, o endereço volta para o início.
// Enquanto os valores carregam não desenha nada, para não abrir e fechar a página.
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useFeatures } from "@/hooks/useFeatures";
import { featureOn } from "@/lib/features";

export default function FeatureRoute({ feature, children }: { feature: string; children: ReactNode }) {
  const { data, isLoading } = useFeatures();
  if (isLoading) return null;
  return featureOn(data, feature) ? <>{children}</> : <Navigate to="/" replace />;
}
