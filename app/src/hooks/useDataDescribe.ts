import { useProject } from '@/lib/project-store.tsx';
import { useCallback, useRef, useState } from 'react';
import { DataDescribeState } from '@/types';
import { DataDescribePayload, DataDescribePayloadResponse } from '@/lib/backend-adapter.ts';
import { devLineageDataDescribe } from '@/lib/utils_backend.tsx';

export function useDataDescribe() {
  const { currentProject } = useProject();
  const requestIdRef = useRef(0);


  const [state, setState] = useState<DataDescribeState>({
    isDataDescribing: false,
    requestId: 0,
    dataDescribingError: null,
    dataDescriptionScript: null,
  });

  const startRequest = useCallback(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setState((prev) => ({
      ...prev,
      requestId,
      isDataDescribing: true,
      dataDescribingError: null,
    }));
    return requestId;
  }, []);

  const setDataDescribing = useCallback((isDataDescribing: boolean) => {
    setState((prev) => ({ ...prev, isDataDescribing }));
  }, []);

  const setDataDescribingError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, dataDescribingError: error }));
  }, []);

  const runDataDescribe = useCallback(
    async (tableName: string, schema?: string, columnName?: string) : Promise<DataDescribePayloadResponse | null> => {
      if (!currentProject) return null;
      if (currentProject.dialect != 'oracleBackend') {
        return null;
      }
      const requestId = startRequest();
      try {
        const dataDescribePayload: DataDescribePayload = {
          schema,
          tableName,
          columnName,
          database: currentProject.database,
          userName: currentProject.userName,
        };
        const dataDescribePayloadResponse = await devLineageDataDescribe(
          dataDescribePayload,
          currentProject
        );

        if (requestIdRef.current !== requestId) {
          return null;
        }

        if (!dataDescribePayloadResponse.script) {
          setState((prev) => ({
            ...prev,
            isDataDescribing: false,
            dataDescribingError: 'No description',
            dataDescriptionScript: null,
          }));
          return null;
        }

        setState((prev) => ({
          ...prev,
          isDataDescribing: false,
          dataDescribingError: null,
          dataDescriptionScript: dataDescribePayloadResponse.script ?? null,
        }));
        return dataDescribePayloadResponse;
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return null;
        }
        setState((prev) => ({
          ...prev,
          isDataLoading: false,
          dataLoadingError: error instanceof Error ? error.message : 'Data load failed',
        }));
        console.error(error);
      }
      return null;
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
      isDataDescribing: false,
      dataDescriptionScript: null,
      dataDescribingError: null,
    }));
  }, []);

  return {
    ...state,
    runDataDescribe,
    setDataDescribingError,
    setDataDescribing,
    clear,
  };

}