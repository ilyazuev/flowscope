import {
  AnalysisPayload,
  AnalysisPayloadEx, CredentialsPayload, DataDescribePayload, DataDescribePayloadResponse,
  SqlPayload,
  SqlPayloadResponse, DBObjectsPayload, DBObjectsPayloadResponse, OwnersPayloadResponse,
} from '@/lib/backend-adapter.ts';
import { Project } from '@/lib/project-store.tsx';
import { analyzeWithWorker } from '@/lib/analysis-worker.ts';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { runWebSocket } from '@/lib/websocket';
import type { ColumnInfoSchema } from '@pondpilot/flowscope-core';

const baseBackendUrl = window.location.hostname == 'localhost' ? 'https://localhost' : '';

function base64UrlEncodeUtf8Json(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);

  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodePayloadContent<T>(payload?: T) {
  return payload ? base64UrlEncodeUtf8Json(payload) : '';
}

function backendUsecasePath<T>(backendEndpoint: string, payload?: T) {
  return backendEndpoint.replace('{content}', encodePayloadContent(payload));
}

function backendUrl<T>(backendEndpoint: string, payload?: T) {
  return `${baseBackendUrl}${backendUsecasePath(backendEndpoint, payload)}`;
}

let genericFormsCache: ColumnInfoSchema | null = null;
let genericFormsRequest: Promise<ColumnInfoSchema | undefined> | null = null;
export async function loadGenericForms(): Promise<ColumnInfoSchema | undefined> {
  if (genericFormsCache) {
    return genericFormsCache;
  }
  if (genericFormsRequest) {
    return genericFormsRequest;
  }
  if (!import.meta.env.VITE_BACKEND_ENDPOINT_LOADGENERICFORMS) {
    return undefined;
  }
  genericFormsRequest = (async () => {
    const res = await fetch(
      backendUrl(
        import.meta.env.VITE_BACKEND_ENDPOINT_LOADGENERICFORMS,
        null
      )
    );
    if (!res.ok) {
      throw new Error(
        `Failed to fetch from backend: ${res.status} ${res.statusText}`
      );
    }
    const response: ColumnInfoSchema = await res.json();
    if ('errorMessage' in response && response.errorMessage) {
      throw new Error(response.errorMessage as string);
    }
    genericFormsCache = response;
    return response;
  })();
  try {
    return await genericFormsRequest;
  } finally {
    genericFormsRequest = null;
  }
}

export async function devLineageAnalyze(adapterPayload: AnalysisPayload, currentProject: Project) {
  const analysisPayloadEx: AnalysisPayloadEx = {
    analysisPayload: adapterPayload,
    database: currentProject.database,
    userName: currentProject.userName,
  };

  if (import.meta.env.VITE_BACKEND_TRANSPORT === 'websocket') {
    const analysisResponse = await runWebSocket<Awaited<ReturnType<typeof analyzeWithWorker>>>({
      wsUrl: import.meta.env.VITE_BACKEND_WS_URL,
      path: backendUsecasePath(
        import.meta.env.VITE_BACKEND_WS_ENDPOINT_PARSEFORLINEAGE,
        analysisPayloadEx
      ),
      reauthUrl: import.meta.env.VITE_BACKEND_WS_REAUTH_ENDPOINT,
      ui: {
        title: `${currentProject.database ? `${currentProject.database}. ` : ''}Analyze lineage`,
        closeOnSuccess: true,
      },
    });

    if ('errorMessage' in analysisResponse && analysisResponse.errorMessage) {
      throw new Error(analysisResponse.errorMessage as string);
    }
    console.log('Received from backend via WebSocket');
    return analysisResponse;
  }

  const res = await fetch(
    backendUrl(import.meta.env.VITE_BACKEND_ENDPOINT_PARSEFORLINEAGE, analysisPayloadEx)
  );
  if (!res.ok) {
    // noinspection ExceptionCaughtLocallyJS
    throw new Error(`Failed to fetch from backend: ${res.status} ${res.statusText}`);
  }
  const analysisResponse: Awaited<ReturnType<typeof analyzeWithWorker>> = await res.json();
  if ('errorMessage' in analysisResponse && analysisResponse.errorMessage) {
    // noinspection ExceptionCaughtLocallyJS
    throw new Error(analysisResponse.errorMessage as string);
  }
  console.log('Received from backend');
  return analysisResponse;
}

export async function devLineageExecuteSql(payload: SqlPayload) {
  const res = await fetch(backendUrl(import.meta.env.VITE_BACKEND_ENDPOINT_TOCSV, payload));
  if (!res.ok) {
    // noinspection ExceptionCaughtLocallyJS
    throw new Error(`Failed to fetch from backend: ${res.status} ${res.statusText}`);
  }
  const sqlPayloadResponse: SqlPayloadResponse = await res.json();
  if ('errorMessage' in sqlPayloadResponse && sqlPayloadResponse.errorMessage) {
    // noinspection ExceptionCaughtLocallyJS
    throw new Error(sqlPayloadResponse.errorMessage as string);
  }
  console.log('Received csv from backend');
  return sqlPayloadResponse;
}

export async function devLineageDataDescribe(payload: DataDescribePayload) {
  const res = await fetch(backendUrl(import.meta.env.VITE_BACKEND_ENDPOINT_DATADESCRIBE, payload));
  if (!res.ok) {
    // noinspection ExceptionCaughtLocallyJS
    throw new Error(`Failed to fetch from backend: ${res.status} ${res.statusText}`);
  }
  const dataDescribePayloadResponse: DataDescribePayloadResponse = await res.json();
  if ('errorMessage' in dataDescribePayloadResponse && dataDescribePayloadResponse.errorMessage) {
    // noinspection ExceptionCaughtLocallyJS
    throw new Error(dataDescribePayloadResponse.errorMessage as string);
  }
  return dataDescribePayloadResponse;
}

export async function devLineageLoadOwners(payload: CredentialsPayload) {
  const res = await fetch(backendUrl(import.meta.env.VITE_BACKEND_ENDPOINT_LOADOWNERS, payload));
  if (!res.ok) {
    // noinspection ExceptionCaughtLocallyJS
    throw new Error(`Failed to fetch from backend: ${res.status} ${res.statusText}`);
  }
  const ownersPayloadResponse: OwnersPayloadResponse = await res.json();
  if ('errorMessage' in ownersPayloadResponse && ownersPayloadResponse.errorMessage) {
    // noinspection ExceptionCaughtLocallyJS
    throw new Error(ownersPayloadResponse.errorMessage as string);
  }
  return ownersPayloadResponse;
}

export async function devLineageLoadDBObjects(payload: DBObjectsPayload) {
  const res = await fetch(backendUrl(import.meta.env.VITE_BACKEND_ENDPOINT_LOADDBOBJECTS, payload));
  if (!res.ok) {
    // noinspection ExceptionCaughtLocallyJS
    throw new Error(`Failed to fetch from backend: ${res.status} ${res.statusText}`);
  }
  const dbObjectsPayloadResponse: DBObjectsPayloadResponse = await res.json();
  if ('errorMessage' in dbObjectsPayloadResponse && dbObjectsPayloadResponse.errorMessage) {
    // noinspection ExceptionCaughtLocallyJS
    throw new Error(dbObjectsPayloadResponse.errorMessage as string);
  }
  return dbObjectsPayloadResponse;
}


// ------------------------------ DATABASES and USERS ------------------------------
type DatabaseUsers = Record<string, string[]>;

let _cache: DatabaseUsers | null = null;
let _inflight: Promise<DatabaseUsers> | null = null;

async function DATABASES(): Promise<DatabaseUsers> {
  let res;
  try {
    res = await fetch(backendUrl(import.meta.env.VITE_BACKEND_ENDPOINT_LOADDATABASES)); // Simulate error example: // throw new Error("Backend is down");
    if (!res.ok) {
      // noinspection ExceptionCaughtLocallyJS
      throw new Error(`Failed to fetch from backend: ${res.status} ${res.statusText}`);
    }
    const result = await res.json();
    if ('errorMessage' in result && result.errorMessage) {
      // noinspection ExceptionCaughtLocallyJS
      throw new Error(result.errorMessage);
    }
    return result;
  } catch (error) {
    throw new Error((error instanceof Error ? error.message : String(error)) ?? 'Unknown error');
  }
}

async function loadDatabases(): Promise<DatabaseUsers> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = DATABASES()
    .then((data) => {
      _cache = data;
      _inflight = null;
      return data;
    })
    .catch((err) => {
      _inflight = null;
      throw err;
    });
  return _inflight;
}

function invalidateCache() {
  _cache = null;
}

type DatabasesContextValue = {
  databases: DatabaseUsers;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const DatabasesContext = createContext<DatabasesContextValue | null>(null);

export function DatabasesProvider({ children }: { children: ReactNode }) {
  const [databases, setDatabases] = useState<DatabaseUsers>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await loadDatabases();
      setDatabases(result);
    } catch (error) {
      setError((error instanceof Error ? error.message : String(error)) ?? 'Unknown error');
    }
    setLoading(false);
  }

  async function refresh() {
    invalidateCache();
    await load();
  }

  useEffect(() => {
    load().then();
  }, []);

  return (
    <DatabasesContext.Provider value={{ databases, loading, error, refresh }}>
      {children}
    </DatabasesContext.Provider>
  );
}

export function useDatabases() {
  const ctx = useContext(DatabasesContext);
  if (!ctx) throw new Error('useDatabases must be used inside provider');
  return ctx;
}

// ------------------------------ DATABASES and USERS ------------------------------
