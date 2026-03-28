import { useCallback, useRef, useState } from 'react';
import { SqlPayload } from '@/lib/backend-adapter.ts';
import { devLineageExecuteSql } from '@/lib/utils_idaf.tsx';
import { useProject } from '@/lib/project-store.tsx';
import { DataLoadState } from '@/types';


export function useDataLoad() {

  const { currentProject, activeProjectId } = useProject();
  const dataLoadRequestRef = useRef(0);
  const [state, setState] = useState<DataLoadState>({
    isDataLoading: false,
    requestId: 0,
    csv: null,
    dataLoadingError: null,
    _lastLoadAt: null,
  });


  const setRequestId = useCallback(() => {
    setState((prev) => ({ ...prev, requestId: prev.requestId + 1 }));
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
      if (currentProject.dialect != 'oracleIdaf') {
        return;
      }

      setDataLoading(true);
      clear();
      const requestId = state.requestId;
      dataLoadRequestRef.current = requestId;

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        if (!activeFileContent) {
          setDataLoadingError('No project context available');
          return;
        }
        const sqlPayload: SqlPayload = {
          path: activeFilePath,
          content: activeFileContent,
          database: currentProject.database,
          userName: currentProject.userName,
        };

        const sqlPayloadResponse = await devLineageExecuteSql(sqlPayload, currentProject);
        if (!sqlPayloadResponse.csv) {
          setDataLoadingError('No data response');
        }
        setCsv(sqlPayloadResponse.csv);
        console.log(sqlPayloadResponse.csv);
      } catch (error) {
        if (dataLoadRequestRef.current !== requestId) {
          return;
        }
        setDataLoadingError(error instanceof Error ? error.message : 'Data load failed');
        console.error(error);
      } finally {
        if (dataLoadRequestRef.current === requestId) {
          setDataLoading(false);
        }
      }
    },
    [
      currentProject,
      activeProjectId,
      //storeResult,
      //getResult,
      setDataLoading,
      setDataLoadingError,
    ]
  );

  const clear = useCallback(() => {
    setCsv(null);
    setRequestId();
    setDataLoadingError(null);
  }, []);

  return {
    ...state,
    runExecuteSql,
    setDataLoadingError,
    clear,
  };
}