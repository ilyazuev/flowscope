import { useDataLoad } from '@/hooks/useDataLoad.ts';
import { createContext, useContext, useEffect } from 'react';

const DataLoadContext = createContext<ReturnType<typeof useDataLoad> | null>(null);

export function DataLoadProvider({ children }: { children: React.ReactNode }) {
  const value = useDataLoad();
  const { isInterruptibleSqlExecutionInFlight, runInterruptRequestsOnUnload } = value;

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isInterruptibleSqlExecutionInFlight) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted || !isInterruptibleSqlExecutionInFlight) {
        return;
      }
      runInterruptRequestsOnUnload();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isInterruptibleSqlExecutionInFlight, runInterruptRequestsOnUnload]);

  return (
    <DataLoadContext.Provider value={value}>
      {children}
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