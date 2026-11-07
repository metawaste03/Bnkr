import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { fractionDigits, formatMoney, minorToEditable, parseMoney } from './lib/money';
import type { AllData } from './lib/types';

interface Ctx {
  data: AllData;
  today: string;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ value, children }: { value: Ctx; children: ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useMoney() {
  const currency = useApp().data.settings?.currency ?? 'NGN';
  return useMemo(() => {
    const digits = fractionDigits(currency);
    return {
      format: (minor: number) => formatMoney(minor, currency),
      parse: (text: string) => parseMoney(text, digits),
      toInput: (minor: number) => minorToEditable(minor, digits),
    };
  }, [currency]);
}
