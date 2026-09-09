import { useCallback, useRef, useState } from 'react';
import { SqlPayload, SqlPartType } from '@/lib/backend-adapter.ts';
import {
  devLineageExecuteSql,
  devLineageInterruptRequests,
  devLineageInterruptRequestsOnUnload,
} from '@/lib/utils_backend.tsx';
import { backendParsed, SqlParameters, useProject } from '@/lib/project-store.tsx';
import { DataLoadState } from '@/types';

function createClientInstanceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useDataLoad() {
  const { currentProject } = useProject();
  const requestIdRef = useRef(0);
  const clientInstanceIdRef = useRef(createClientInstanceId());

  const [state, setState] = useState<DataLoadState>({
    dataLoadingState: SqlPartType.none,
    isSqlExecutionInFlight: false,
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
      isSqlExecutionInFlight: partType === SqlPartType.sql || partType === SqlPartType.cte,
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
          isSqlExecutionInFlight: false,
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

        const sqlPayloadResponse = await devLineageExecuteSql(sqlPayload, clientInstanceIdRef.current);

        if (requestIdRef.current !== requestId) {
          return;
        }
        const needParameters: boolean = !parameters && !!sqlPayloadResponse.parameters;

        if (!sqlPayloadResponse.csv) {
          setState((prev) => ({
            ...prev,
            dataLoadingState: needParameters ? partType : SqlPartType.none,
            isSqlExecutionInFlight: false,
            dataLoadingError: needParameters ? null : 'No data response',
            csv: null,
            parameters: sqlPayloadResponse.parameters,
            needParameters,
          }));
          return;
        }

        const dbUser =
          (sqlPayloadResponse.database ? `${sqlPayloadResponse.database}` : '') +
          (sqlPayloadResponse.userName ? `@${sqlPayloadResponse.userName}` : '');
        const queryName = partType != SqlPartType.sql
          ? `${SqlPartType[partType].toUpperCase()}${cteName ? ` (${cteName}) ` : ''}: `
          : ''
        setState((prev) => ({
          ...prev,
          dataLoadingState: SqlPartType.none,
          isSqlExecutionInFlight: false,
          dataLoadingError: null,
          csv: sqlPayloadResponse.csv,
          parameters: sqlPayloadResponse.parameters,
          title: `${dbUser ? `${dbUser}: ` : ''}${queryName}${activeFilePath}`,
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
          isSqlExecutionInFlight: false,
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
      isSqlExecutionInFlight: false,
      dataLoadingError: null,
      needParameters: false,
    }));

    try {
      await devLineageInterruptRequests(clientInstanceIdRef.current);
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
      isSqlExecutionInFlight: false,
      csv: null,
      dataLoadingError: null,
    }));
  }, []);

  const runInterruptRequestsOnUnload = useCallback(() => {
    if (!state.isSqlExecutionInFlight) {
      return;
    }

    requestIdRef.current += 1;
    void devLineageInterruptRequestsOnUnload(clientInstanceIdRef.current);
  }, [state.isSqlExecutionInFlight]);

  const isInterruptibleSqlExecutionInFlight = state.isSqlExecutionInFlight;

  return {
    ...state,
    isInterruptibleSqlExecutionInFlight,
    runExecuteSql,
    runInterruptRequests,
    runInterruptRequestsOnUnload,
    setDataLoadingError,
    setDataLoadingState: setDataLoadingState,
    setNeedParameters,
    setParameters,
    setCsv,
    clear,
  };
}
