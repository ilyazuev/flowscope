import { useEffect, useRef, useState } from 'react';
import perspective from '@perspective-dev/client';
import perspective_viewer from '@perspective-dev/viewer';
import '@perspective-dev/viewer-datagrid';
import '@perspective-dev/viewer-d3fc';
import '@perspective-dev/viewer/dist/css/themes.css';
import { resolveTheme, useThemeStore } from '@/lib/theme-store.ts';

import SERVER_WASM from '@perspective-dev/server/dist/wasm/perspective-server.wasm?url';
import CLIENT_WASM from '@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm?url';
import { useSharedDataLoad } from '@/components/DataLoadContext.tsx';

// noinspection JSVoidFunctionReturnValueUsed
await Promise.all([
  perspective.init_server(fetch(SERVER_WASM)),
  perspective_viewer.init_client(fetch(CLIENT_WASM)),
]);

type PerspectiveViewerElement = HTMLElement & {
  load: (table: unknown) => Promise<void>;
  restore: (config: Record<string, unknown>) => Promise<void>;
  delete?: () => Promise<void>;
  restyleElement?: () => Promise<void>;
  flush?: () => Promise<void>;
};

type PerspectiveWorker = Awaited<ReturnType<typeof perspective.worker>>;

type PerspectiveTable = {
  delete?: () => Promise<void>;
};

export function DataView() {
  const viewerRef = useRef<PerspectiveViewerElement | null>(null);
  const workerRef = useRef<PerspectiveWorker | null>(null);
  const tableRef = useRef<PerspectiveTable | null>(null);
  const initializedRef = useRef(false);
  const lastAppliedRequestIdRef = useRef(0);

  const { isDataLoading, dataLoadingError, csv, title, requestId } = useSharedDataLoad();

  const [status, setStatus] = useState<string | null>('Initialization...');
  const [error, setError] = useState<string | null>(null);

  const theme = useThemeStore((state) => state.theme);
  const isDark = resolveTheme(theme) === 'dark';

  const applyTheme = async (viewer: PerspectiveViewerElement) => {
    viewer.setAttribute('theme', isDark ? 'Pro Dark' : 'Pro Light');
    if (viewer.restyleElement) {
      await viewer.restyleElement();
    }
    if (viewer.flush) {
      await viewer.flush();
    }
  };

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer && initializedRef.current) {
      void applyTheme(viewer);
    }
  }, [isDark]);

  const loadCsvToViewer = async (csv: string, title?: string | null) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!workerRef.current) {
      workerRef.current = await perspective.worker();
    }
    const prevTable = tableRef.current; // csv = 'abc,bca,drt\n123,dew,456';

    const table = await workerRef.current.table(csv, {
      format: 'csv',
    });
    tableRef.current = table as PerspectiveTable;
    await viewer.load(table);
    await viewer.restore({
      plugin: 'Datagrid',
      settings: true,
      title: title ?? 'no data',
      plugin_config: {
        editable: true,
        edit_mode: 'EDIT',
      },
    });

    const elements = viewer.getElementsByTagName('perspective-viewer-datagrid');
    if( elements && elements.length > 0 ){
      const tds = elements[0].shadowRoot?.querySelectorAll('regular-table > table td, regular-table > table th');
      if (tds && elements.length > 0) {
        for (const td of tds) {
          (td as HTMLElement).style.boxShadow = '1px 0px var(--psp-inactive--border-color, #8b868045)'; //style.boxShadow = '1px 0px var(--inactive--border-color, #8b868045)';
        }
      }
      
    }

    await prevTable?.delete?.();
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const viewer = viewerRef.current;
      if (!viewer || initializedRef.current) {
        return;
      }
      setError(null);
      setStatus('Loading data...');
      try {
        const csv = 'empty\n'; // const response = await fetch('/mock/customers.csv'); if (!response.ok) { // noinspection ExceptionCaughtLocallyJS throw new Error(`Failed to load data: ${response.status}`); } const csv = await response.text();
        if (cancelled) return;
        await loadCsvToViewer(csv);
        setStatus(null);
        initializedRef.current = true;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        setError(message);
      }
    };

    void run();

    return () => {
      cancelled = true; // if (initializedRef.current) {}
      const viewer = viewerRef.current;
      const table = tableRef.current;
      viewerRef.current = null;
      tableRef.current = null;
      void (async () => {
        await viewer?.delete?.();
        await table?.delete?.();
      })();
    };
  }, []);

  useEffect(() => {
    if (dataLoadingError) {
      setError('Data Loading Error: ' + dataLoadingError);
    } else {
      setError(null);
      if (isDataLoading) {
        setStatus('Data loading...');
      } else {
        setStatus(null);
      }
    }
  }, [isDataLoading, dataLoadingError]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (!requestId) return;
    if (isDataLoading || lastAppliedRequestIdRef.current === requestId) return;

    lastAppliedRequestIdRef.current = requestId;

    const run = async () => {
      try {
        if (!csv?.trim()) {
          setError(null);
          setStatus('No data');
          return;
        }
        await loadCsvToViewer(csv, title);
        setStatus(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        setError(message);
        setStatus(null);
      }
    };

    void run();
  }, [csv, requestId]);

  return (
    <>
      {!error && status && <div style={{ marginBottom: 12 }}>{status}</div>}
      {error && <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>}
      <perspective-viewer
        ref={(node) => {
          node?.setAttribute('theme', isDark ? 'Pro Dark' : 'Pro Light');
          viewerRef.current = node as PerspectiveViewerElement | null;
        }}
        style={{
          width: !error && !status ? '100%' : '0',
          height: !error && !status ? '100%' : '0',
        }}
      />
    </>
  );
}
