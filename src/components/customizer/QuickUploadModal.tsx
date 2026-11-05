import type { ComponentProps } from "react";
import MultiAreaCustomizer from "./MultiAreaCustomizer";

// One upload flow prevents bypassing the size/quality consent in this legacy entry point.
type Props = Omit<ComponentProps<typeof MultiAreaCustomizer>, "productBasePrice"> & { productBasePrice?: number };
export default function QuickUploadModal({ productBasePrice = 0, ...props }: Props) {
  return <MultiAreaCustomizer {...props} productBasePrice={productBasePrice} />;
}
