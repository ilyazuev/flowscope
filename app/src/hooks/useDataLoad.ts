import { useCallback, useRef, useState } from 'react';
import { SqlPayload } from '@/lib/backend-adapter.ts';
import { devLineageExecuteSql } from '@/lib/utils_backend.tsx';
import { useProject } from '@/lib/project-store.tsx';
import { DataLoadState } from '@/types';

export function useDataLoad() {
  const { currentProject } = useProject();
  const requestIdRef = useRef(0);

  const [state, setState] = useState<DataLoadState>({
    isDataLoading: false,
    requestId: 0,
    csv: null,
    dataLoadingError: null,
    _lastLoadAt: null,
  });

  const startRequest = useCallback(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setState((prev) => ({
      ...prev,
      requestId,
      isDataLoading: true,
      dataLoadingError: null,
      csv: null,
    }));
    return requestId;
  }, []);

  const setCsv = useCallback((csv?: string|null) => {
    setState((prev) => ({ ...prev, csv }));
  }, []);

  const setDataLoading = useCallback((isDataLoading: boolean) => {
    setState((prev) => ({ ...prev, isDataLoading }));
  }, []);

  const setDataLoadingError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, dataLoadingError: error }));
  }, []);

  const runExecuteSql = useCallback(
    async (activeFileContent?: string, activeFilePath?: string) => {
      if (!currentProject) return;
      if (currentProject.dialect != 'oracleBackend') {
        return;
      }

      if (!activeFileContent?.trim()) {
        setState((prev) => ({
          ...prev,
          isDataLoading: false,
          dataLoadingError: 'No SQL content to execute',
        }));
        return;
      }

      const requestId = startRequest(); // await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        const sqlPayload: SqlPayload = {
          path: activeFilePath,
          content: activeFileContent,
          database: currentProject.database,
          userName: currentProject.userName,
        };

        const sqlPayloadResponse = await devLineageExecuteSql(sqlPayload, currentProject);

        if (requestIdRef.current !== requestId) {
          return;
        }

        if (!sqlPayloadResponse.csv) {
          setState((prev) => ({
            ...prev,
            isDataLoading: false,
            dataLoadingError: 'No data response',
            csv: null,
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          isDataLoading: false,
          dataLoadingError: null,
          csv: sqlPayloadResponse.csv,
          title: activeFilePath,
          _lastLoadAt: Date.now(),
        }));
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setState((prev) => ({
          ...prev,
          isDataLoading: false,
          dataLoadingError: error instanceof Error ? error.message : 'Data load failed',
        }));

        console.error(error);
      }
    },
    [
      currentProject,
      startRequest,
    ]
  );

  const clear = useCallback(() => {
    requestIdRef.current += 1;

    setState((prev) => ({
      ...prev,
      requestId: requestIdRef.current,
      isDataLoading: false,
      csv: null,
      dataLoadingError: null,
    }));
  }, []);

  return {
    ...state,
    runExecuteSql,
    setDataLoadingError,
    setDataLoading,
    setCsv,
    clear,
  };
}
