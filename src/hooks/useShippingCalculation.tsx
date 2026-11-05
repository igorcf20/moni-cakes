import { useState } from "react";

interface ShippingCalculationParams {
  totalWeight: number;
  zipCode?: string;
}

export const useShippingCalculation = ({ totalWeight, zipCode: initialZipCode }: ShippingCalculationParams) => {
  const [zipCode, setZipCode] = useState(initialZipCode || "");
  const [shippingCost] = useState(15.00); // Mock shipping cost
  const [estimatedDays] = useState<{ min: number; max: number }>({ min: 5, max: 10 });

  return {
    zipCode,
    setZipCode,
    shippingCost,
    estimatedDays,
    isLoading: false,
  };
};
