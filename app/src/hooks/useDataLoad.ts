import { useCallback, useEffect, useRef, useState } from 'react';
import { SqlPayload, SqlPartType } from '@/lib/backend-adapter.ts';
import {
  devLineageExecuteSql,
  devLineageInterruptRequests,
  devLineageInterruptRequestsOnUnload,
} from '@/lib/utils_backend.tsx';
import { backendParsed, SqlParameters, useProject } from '@/lib/project-store.tsx';
import { DataLoadState, FetchSessionState } from '@/types';

function createClientInstanceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const FETCH_WIDGET_TIMEOUT_MS = 55_000;

export function useDataLoad() {
  const { currentProject } = useProject();
  const requestIdRef = useRef(0);
  const clientInstanceIdRef = useRef(createClientInstanceId());
  const fetchRequestPayloadRef = useRef<SqlPayload | null>(null);
  const fetchSessionRef = useRef<FetchSessionState | null>(null);
  const fetchAllLoopTokenRef = useRef(0);

  const [state, setState] = useState<DataLoadState>({
    dataLoadingState: SqlPartType.none,
    isSqlExecutionInFlight: false,
    isFetchActionInFlight: false,
    requestId: 0,
    csvUpdateMode: 'replace',
    csv: null,
    dataLoadingError: null,
    _lastLoadAt: null,
    needParameters: false,
    fetchSession: null,
  });

  useEffect(() => {
    fetchSessionRef.current = state.fetchSession;
  }, [state.fetchSession]);

  const startRequest = useCallback((partType: SqlPartType) => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    fetchAllLoopTokenRef.current += 1;
    fetchRequestPayloadRef.current = null;
    setState((prev) => ({
      ...prev,
      requestId,
      dataLoadingState: partType,
      isSqlExecutionInFlight: partType === SqlPartType.sql || partType === SqlPartType.cte,
      isFetchActionInFlight: false,
      csvUpdateMode: 'replace',
      dataLoadingError: null,
      csv: null,
      needParameters: false,
      fetchSession: null,
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
      csvUpdateMode: 'replace',
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

  const runFetchAction = useCallback(
    async (fetchMode: 'next' | 'cancel', options?: { silentError?: boolean }) => {
      const fetchPayloadBase = fetchRequestPayloadRef.current;
      const fetchSession = fetchSessionRef.current;
      if (!fetchPayloadBase || !fetchSession) {
        return;
      }

      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      if (fetchMode === 'cancel') {
        fetchRequestPayloadRef.current = null;
      }

      setState((prev) => ({
        ...prev,
        requestId,
        dataLoadingState: SqlPartType.dataLoading,
        isSqlExecutionInFlight: true,
        isFetchActionInFlight: true,
        dataLoadingError: null,
        fetchSession: fetchMode === 'cancel' ? null : prev.fetchSession,
      }));

      try {
        const sqlPayloadResponse = await devLineageExecuteSql(
          {
            content: '',
            database: fetchPayloadBase.database,
            userName: fetchPayloadBase.userName,
            fetchMode,
            fetchToken: fetchPayloadBase.fetchToken ?? fetchSession.fetchToken,
            chunkSize: fetchPayloadBase.chunkSize ?? fetchSession.chunkSize,
          },
          clientInstanceIdRef.current
        );

        if (requestIdRef.current !== requestId) {
          return;
        }

        const hasMore =
          fetchMode !== 'cancel' && sqlPayloadResponse.hasMore === true && !!sqlPayloadResponse.fetchToken;

        const nextFetchSession: FetchSessionState | null = hasMore
          ? {
              fetchToken: sqlPayloadResponse.fetchToken!,
              chunkSize: sqlPayloadResponse.chunkSize ?? fetchSession.chunkSize,
              rowsFetched: sqlPayloadResponse.rowsFetched,
              expiresAt: Date.now() + FETCH_WIDGET_TIMEOUT_MS,
            }
          : null;

        if (nextFetchSession) {
          fetchRequestPayloadRef.current = {
            content: '',
            database: fetchPayloadBase.database,
            userName: fetchPayloadBase.userName,
            fetchToken: nextFetchSession.fetchToken,
            chunkSize: nextFetchSession.chunkSize,
          };
          fetchSessionRef.current = nextFetchSession;
        } else {
          fetchRequestPayloadRef.current = null;
          fetchSessionRef.current = null;
        }

        setState((prev) => ({
          ...prev,
          requestId,
          dataLoadingState: SqlPartType.none,
          isSqlExecutionInFlight: false,
          isFetchActionInFlight: false,
          dataLoadingError: null,
          csvUpdateMode: fetchMode === 'cancel' ? prev.csvUpdateMode : 'append',
          csv: fetchMode === 'cancel' ? prev.csv : (sqlPayloadResponse.csv ?? prev.csv ?? null),
          parameters: sqlPayloadResponse.parameters ?? prev.parameters,
          _lastLoadAt: fetchMode === 'cancel' ? prev._lastLoadAt : Date.now(),
          fetchSession: nextFetchSession,
        }));
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setState((prev) => ({
          ...prev,
          dataLoadingState: SqlPartType.none,
          isSqlExecutionInFlight: false,
          isFetchActionInFlight: false,
          fetchSession: fetchMode === 'cancel' ? null : prev.fetchSession,
          dataLoadingError:
            options?.silentError && fetchMode === 'cancel'
              ? prev.dataLoadingError
              : error instanceof Error
                ? error.message
                : 'Data load failed',
        }));
        if (fetchMode === 'cancel') {
          fetchSessionRef.current = null;
        }

        console.error(error);
      }
    },
    []
  );

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
        const supportsFetch =
          (partType === SqlPartType.sql || partType === SqlPartType.cte) &&
          sqlPayloadResponse.hasMore === true &&
          !!sqlPayloadResponse.fetchToken;
        const fetchSession: FetchSessionState | null = supportsFetch
          ? {
              fetchToken: sqlPayloadResponse.fetchToken!,
              chunkSize: sqlPayloadResponse.chunkSize,
              rowsFetched: sqlPayloadResponse.rowsFetched,
              expiresAt: Date.now() + FETCH_WIDGET_TIMEOUT_MS,
            }
          : null;

        if (fetchSession) {
          fetchRequestPayloadRef.current = {
            content: '',
            database: sqlPayload.database,
            userName: sqlPayload.userName,
            fetchToken: fetchSession.fetchToken,
            chunkSize: fetchSession.chunkSize,
          };
          fetchSessionRef.current = fetchSession;
        } else {
          fetchRequestPayloadRef.current = null;
          fetchSessionRef.current = null;
        }

        if (!sqlPayloadResponse.csv) {
          setState((prev) => ({
            ...prev,
            dataLoadingState: needParameters ? partType : SqlPartType.none,
            isSqlExecutionInFlight: false,
            isFetchActionInFlight: false,
            csvUpdateMode: 'replace',
            dataLoadingError: needParameters ? null : 'No data response',
            csv: null,
            parameters: sqlPayloadResponse.parameters,
            needParameters,
            fetchSession,
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
          isFetchActionInFlight: false,
          csvUpdateMode: 'replace',
          dataLoadingError: null,
          csv: sqlPayloadResponse.csv,
          parameters: sqlPayloadResponse.parameters,
          title: `${dbUser ? `${dbUser}: ` : ''}${queryName}${activeFilePath}`,
          _lastLoadAt: Date.now(),
          needParameters,
          fetchSession,
        }));
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setState((prev) => ({
          ...prev,
          dataLoadingState: SqlPartType.none,
          isSqlExecutionInFlight: false,
          isFetchActionInFlight: false,
          csvUpdateMode: 'replace',
          dataLoadingError: error instanceof Error ? error.message : 'Data load failed',
          fetchSession: null,
        }));
        fetchRequestPayloadRef.current = null;
        fetchSessionRef.current = null;

        console.error(error);
      }
    },
    [currentProject, startRequest]
  );

  const runFetchNext = useCallback(async () => {
    fetchAllLoopTokenRef.current += 1;
    await runFetchAction('next');
  }, [runFetchAction]);

  const runFetchAll = useCallback(async () => {
    const loopToken = ++fetchAllLoopTokenRef.current;
    while (loopToken === fetchAllLoopTokenRef.current && fetchSessionRef.current) {
      await runFetchAction('next');
      if (loopToken !== fetchAllLoopTokenRef.current) {
        return;
      }
      if (!fetchSessionRef.current) {
        return;
      }
    }
  }, [runFetchAction]);

  const runFetchCancel = useCallback(
    async (options?: { silentError?: boolean }) => {
      fetchAllLoopTokenRef.current += 1;
      await runFetchAction('cancel', options);
    },
    [runFetchAction]
  );

  useEffect(() => {
    if (!state.fetchSession) {
      return;
    }
    const timeoutMs = Math.max(state.fetchSession.expiresAt - Date.now(), 0);
    const timeoutId = window.setTimeout(() => {
      void runFetchCancel({ silentError: true });
    }, timeoutMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state.fetchSession, runFetchCancel]);

  const runInterruptRequests = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    fetchAllLoopTokenRef.current += 1;
    fetchRequestPayloadRef.current = null;
    fetchSessionRef.current = null;

    setState((prev) => ({
      ...prev,
      requestId,
      dataLoadingState: SqlPartType.none,
      isSqlExecutionInFlight: false,
      isFetchActionInFlight: false,
      csvUpdateMode: 'replace',
      dataLoadingError: null,
      needParameters: false,
      fetchSession: null,
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
    fetchAllLoopTokenRef.current += 1;

    setState((prev) => ({
      ...prev,
      requestId: requestIdRef.current,
      dataLoadingState: SqlPartType.none,
      isSqlExecutionInFlight: false,
      isFetchActionInFlight: false,
      csvUpdateMode: 'replace',
      csv: null,
      dataLoadingError: null,
      fetchSession: null,
    }));
    fetchRequestPayloadRef.current = null;
    fetchSessionRef.current = null;
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
    runFetchNext,
    runFetchAll,
    runFetchCancel,
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
