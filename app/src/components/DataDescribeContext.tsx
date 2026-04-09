import { createContext, useContext } from 'react';
import { useDataDescribe } from '@/hooks/useDataDescribe.ts';

const DataDescribeContext = createContext<ReturnType<typeof useDataDescribe> | null>(null);

export function DataDescribeProvider({ children }: { children: React.ReactNode }) {
  const value = useDataDescribe();
  return (
    <DataDescribeContext.Provider value={value}>
      {children}
    </DataDescribeContext.Provider>
  );
}

export function useSharedDataDescribe() {
  const ctx = useContext(DataDescribeContext);
  if (!ctx) {
    throw new Error('useSharedDataDescribe must be used inside DataDescribeProvider');
  }
  return ctx;
}