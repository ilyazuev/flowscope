import { useDataLoad } from '@/hooks/useDataLoad.ts';
import { createContext, useContext } from 'react';
import { DataDescribeProvider } from '@/components/DataDescribeContext.tsx';

const DataLoadContext = createContext<ReturnType<typeof useDataLoad> | null>(null);

export function DataLoadProvider({ children }: { children: React.ReactNode }) {
  const value = useDataLoad();
  return (
    <DataLoadContext.Provider value={value}>
      <DataDescribeProvider>
        {children}
      </DataDescribeProvider>
    </DataLoadContext.Provider>
  );
}

export function useSharedDataLoad() {
  const ctx = useContext(DataLoadContext);
  if (!ctx) {
    throw new Error('useSharedDataLoad must be used inside DataLoadProvider');
  }
  return ctx;
}