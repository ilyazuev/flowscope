import { useCallback, useRef, useState } from 'react';
import { SqlPayload, SqlPartType } from '@/lib/backend-adapter.ts';
import { devLineageExecuteSql, devLineageInterruptRequests } from '@/lib/utils_backend.tsx';
import { backendParsed, SqlParameters, useProject } from '@/lib/project-store.tsx';
import { DataLoadState } from '@/types';

export function useDataLoad() {
  const { currentProject } = useProject();
  const requestIdRef = useRef(0);

  const [state, setState] = useState<DataLoadState>({
    dataLoadingState: SqlPartType.none,
    requestId: 0,
    csv: null,
    dataLoadingError: null,
    _lastLoadAt: null,
    needParameters: false,
  });

  const startRequest = useCallback((partType: SqlPartType) => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setState((prev) => ({
      ...prev,
      requestId,
      dataLoadingState: partType,
      dataLoadingError: null,
      csv: null,
      needParameters: false,
    }));
    return requestId;
  }, []);

  const setNeedParameters = useCallback((needParameters: boolean) => {
    setState((prev) => ({ ...prev, needParameters }));
  }, []);

  const setParameters = useCallback((parameters?: SqlParameters) => {
    setState((prev) => ({ ...prev, parameters }));
  }, []);

  const setCsv = useCallback((csv?: string | null, title?: string | null) => {
    // const setCsv = useCallback((csv?: string|null) => { setState((prev) => ({ ...prev, csv })); }, []);
    requestIdRef.current += 1;

    setState((prev) => ({
      ...prev,
      requestId: requestIdRef.current,
      csv,
      title: title ?? prev.title,
      dataLoadingError: null,
      _lastLoadAt: Date.now(),
    }));
  }, []);

  const setDataLoadingState = useCallback((dataLoadingState: SqlPartType) => {
    setState((prev) => ({ ...prev, dataLoadingState: dataLoadingState }));
  }, []);

  const setDataLoadingError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, dataLoadingError: error }));
  }, []);

  const runExecuteSql = useCallback(
    async (
      activeFileContent?: string,
      activeFilePath?: string,
      parameters?: SqlParameters,
      partType: SqlPartType = SqlPartType.sql,
      cteName?: string,
      database?: string,
      userName?: string
    ) => {
      setNeedParameters(false);

      if (!currentProject) return;

      if (!backendParsed(currentProject.dialect)) {
        return;
      }

      if (!activeFileContent?.trim()) {
        setState((prev) => ({
          ...prev,
          dataLoadingState: SqlPartType.none,
          dataLoadingError: 'No SQL content to execute',
        }));
        return;
      }

      const requestId = startRequest(partType); // await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        const sqlPayload: SqlPayload = {
          path: activeFilePath,
          content: activeFileContent,
          database: database ?? currentProject.database,
          userName: userName ?? currentProject.userName,
          parameters: parameters,
          partType,
        };

        const sqlPayloadResponse = await devLineageExecuteSql(sqlPayload);

        if (requestIdRef.current !== requestId) {
          return;
        }
        const needParameters: boolean = !parameters && !!sqlPayloadResponse.parameters;

        if (!sqlPayloadResponse.csv) {
          setState((prev) => ({
            ...prev,
            dataLoadingState: needParameters ? partType : SqlPartType.none,
            dataLoadingError: needParameters ? null : 'No data response',
            csv: null,
            parameters: sqlPayloadResponse.parameters,
            needParameters,
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          dataLoadingState: SqlPartType.none,
          dataLoadingError: null,
          csv: sqlPayloadResponse.csv,
          parameters: sqlPayloadResponse.parameters,
          title:
            (partType != SqlPartType.sql
              ? `${SqlPartType[partType].toUpperCase()}${cteName ? ` (${cteName})` : ''}: `
              : '') + activeFilePath,
          _lastLoadAt: Date.now(),
          needParameters,
        }));
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setState((prev) => ({
          ...prev,
          dataLoadingState: SqlPartType.none,
          dataLoadingError: error instanceof Error ? error.message : 'Data load failed',
        }));

        console.error(error);
      }
    },
    [currentProject, startRequest]
  );

  const runInterruptRequests = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    setState((prev) => ({
      ...prev,
      requestId,
      dataLoadingState: SqlPartType.none,
      dataLoadingError: null,
      needParameters: false,
    }));

    try {
      await devLineageInterruptRequests();
      setState((prev) => ({
        ...prev,
        dataLoadingError: 'Request(s) interrupted',
      }));
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setState((prev) => ({
        ...prev,
        dataLoadingError: error instanceof Error ? error.message : 'Failed to interrupt requests',
      }));
      console.error(error);
    }
  }, []);

  const clear = useCallback(() => {
    requestIdRef.current += 1;

    setState((prev) => ({
      ...prev,
      requestId: requestIdRef.current,
      dataLoadingState: SqlPartType.none,
      csv: null,
      dataLoadingError: null,
    }));
  }, []);

  return {
    ...state,
    runExecuteSql,
    runInterruptRequests,
    setDataLoadingError,
    setDataLoadingState: setDataLoadingState,
    setNeedParameters,
    setParameters,
    setCsv,
    clear,
  };
}
