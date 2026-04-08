import { useCallback, useRef, useState } from 'react';
import { SqlPayload, SqlPartType } from '@/lib/backend-adapter.ts';
import { devLineageExecuteSql } from '@/lib/utils_backend.tsx';
import { useProject } from '@/lib/project-store.tsx';
import { DataLoadState } from '@/types';

export function useDataLoad() {
  const { currentProject } = useProject();
  const requestIdRef = useRef(0);

  const [state, setState] = useState<DataLoadState>({
    isDataLoading: SqlPartType.none,
    requestId: 0,
    csv: null,
    dataLoadingError: null,
    _lastLoadAt: null,
  });

  const startRequest = useCallback((partType: SqlPartType) => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setState((prev) => ({
      ...prev,
      requestId,
      isDataLoading: partType,
      dataLoadingError: null,
      csv: null,
    }));
    return requestId;
  }, []);

  const setCsv = useCallback((csv?: string|null) => {
    setState((prev) => ({ ...prev, csv }));
  }, []);

  const setDataLoading = useCallback((isDataLoading: SqlPartType) => {
    setState((prev) => ({ ...prev, isDataLoading }));
  }, []);

  const setDataLoadingError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, dataLoadingError: error }));
  }, []);

  const runExecuteSql = useCallback(
    async (activeFileContent?: string, activeFilePath?: string, partType: SqlPartType = SqlPartType.sql, cteName?: string) => {
      if (!currentProject) return;
      if (currentProject.dialect != 'oracleBackend') {
        return;
      }

      if (!activeFileContent?.trim()) {
        setState((prev) => ({
          ...prev,
          isDataLoading: SqlPartType.none,
          dataLoadingError: 'No SQL content to execute',
        }));
        return;
      }

      const requestId = startRequest(partType); // await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        const sqlPayload: SqlPayload = {
          path: activeFilePath,
          content: activeFileContent,
          database: currentProject.database,
          userName: currentProject.userName,
          partType
        };

        const sqlPayloadResponse = await devLineageExecuteSql(sqlPayload, currentProject);

        if (requestIdRef.current !== requestId) {
          return;
        }

        if (!sqlPayloadResponse.csv) {
          setState((prev) => ({
            ...prev,
            isDataLoading: SqlPartType.none,
            dataLoadingError: 'No data response',
            csv: null,
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          isDataLoading: SqlPartType.none,
          dataLoadingError: null,
          csv: sqlPayloadResponse.csv,
          title: (partType != SqlPartType.sql ? `${SqlPartType[partType].toUpperCase()}${cteName? ` (${cteName})`:''}: ` : '' ) + activeFilePath,
          _lastLoadAt: Date.now(),
        }));
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setState((prev) => ({
          ...prev,
          isDataLoading: SqlPartType.none,
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
      isDataLoading: SqlPartType.none,
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
