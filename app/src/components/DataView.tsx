import { useEffect, useRef, useState } from 'react';
import perspective from '@perspective-dev/client';
import perspective_viewer from '@perspective-dev/viewer';
import '@perspective-dev/viewer-datagrid';
import '@perspective-dev/viewer-d3fc';
import '@perspective-dev/viewer/dist/css/themes.css';

import SERVER_WASM from '@perspective-dev/server/dist/wasm/perspective-server.wasm?url';
import CLIENT_WASM from '@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm?url';

// noinspection JSVoidFunctionReturnValueUsed
await Promise.all([
  perspective.init_server(fetch(SERVER_WASM)),
  perspective_viewer.init_client(fetch(CLIENT_WASM)),
]);

type PerspectiveViewerElement = HTMLElement & {
  load: (table: unknown) => Promise<void>;
  restore: (config: Record<string, unknown>) => Promise<void>;
  delete?: () => Promise<void>;
};

type PerspectiveTable = {
  delete?: () => Promise<void>;
};

export function DataView() {
  const viewerRef = useRef<PerspectiveViewerElement | null>(null);
  const workerRef = useRef<Awaited<ReturnType<typeof perspective.worker>> | null>(null);
  const tableRef = useRef<PerspectiveTable | null>(null);

  const [status, setStatus] = useState<string | null>('Initialization...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      setError(null);
      setStatus('Loading data...');

      try {
        const response = await fetch('/mock/customers.csv');
        if (!response.ok) {
          // noinspection ExceptionCaughtLocallyJS
          throw new Error(`Failed to load data: ${response.status}`);
        }

        const csv = await response.text();

        if (!workerRef.current) {
          workerRef.current = await perspective.worker();
        }

        await tableRef.current?.delete?.();

        const table = await workerRef.current.table(csv, {
          format: 'csv',
        });

        tableRef.current = table as PerspectiveTable;

        if (cancelled) return;

        await viewer.load(table);
        await viewer.restore({
          plugin: 'Datagrid',
          settings: true,
          title: '123213',
          plugin_config: {
            editable: true,
            edit_mode: 'EDIT',
          },
        });

      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        setError(message);
        setStatus('Error');
      } finally {
        setStatus(null);
      }
    };

    void run();

    return () => {
      cancelled = true;
      void tableRef.current?.delete?.();
      void viewerRef.current?.delete?.();
    };
  }, []);

  return (
    <>
      {!error && status && <div style={{ marginBottom: 12 }}>{status}</div>}
      {error && <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>}
      <perspective-viewer
        ref={(node) => {
          viewerRef.current = node as PerspectiveViewerElement | null;
        }}
        style={{ width: '100%', height: '100%', display: !error && !status ? 'block' : 'none' }}
      />
    </>
  );
}
