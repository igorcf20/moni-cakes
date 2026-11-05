import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyCode } from '@/utils/currency';

interface CurrencyState {
  currentCurrency: CurrencyCode;
  baseCurrency: CurrencyCode;
  rates: Record<string, number>;
  markup: number;
  isLoading: boolean;
  setCurrency: (currency: CurrencyCode) => void;
  fetchRates: () => Promise<void>;
  convert: (amount: number, fromCurrency?: CurrencyCode) => number;
}

export const useCurrency = create<CurrencyState>()(
  persist(
    (set, get) => ({
      // Moeda base da loja (preços no banco). Taxas reais vêm de store_settings.currency_settings.
      currentCurrency: 'BRL',
      baseCurrency: 'BRL',
      rates: { BRL: 1 },
      markup: 0,
      isLoading: false,
      setCurrency: (currency) => set({ currentCurrency: currency }),
      fetchRates: async () => {
        set({ isLoading: true });
        const { data, error } = await supabase
          .from('store_settings')
          .select('value')
          .eq('key', 'currency_settings')
          .maybeSingle();

        if (data && !error) {
          const config = data.value as any;
          const defaultCurrency = config.default || 'BRL';
          set({ 
            baseCurrency: defaultCurrency,
            rates: { ...config.rates, [defaultCurrency]: 1 },
            markup: config.markup || 0,
            // No currency selector exposed: always force store default
            currentCurrency: defaultCurrency,
          });
        } else {
          // Fallback: ensure EUR when settings unavailable
          set({ currentCurrency: 'BRL', baseCurrency: 'BRL', rates: { BRL: 1 } });
        }
        set({ isLoading: false });
      },
      convert: (amount: number, fromCurrency?: CurrencyCode) => {
        const { currentCurrency, baseCurrency, rates, markup } = get();
        const from = fromCurrency || baseCurrency;
        
        if (from === currentCurrency) return amount;
        
        // Convert to base first if from is not base
        let inBase = amount;
        if (from !== baseCurrency) {
          const fromRate = rates[from];
          if (fromRate) inBase = amount / fromRate;
        }

        // Convert from base to current
        let converted = inBase;
        if (currentCurrency !== baseCurrency) {
          const toRate = rates[currentCurrency];
          if (toRate) {
            converted = inBase * toRate;
          }
        }
        
        // Apply markup if converting FROM or TO a non-base currency
        if ((currentCurrency !== baseCurrency || from !== baseCurrency) && markup > 0) {
          converted = converted * (1 + markup / 100);
        }
        
        return converted;
      },
    }),
    {
      name: 'currency-storage',
      version: 2,
      migrate: (persistedState: any) => {
        if (persistedState) {
          persistedState.currentCurrency = 'EUR';
          persistedState.baseCurrency = 'EUR';
        }
        return persistedState;
      },
    }
  )
);
