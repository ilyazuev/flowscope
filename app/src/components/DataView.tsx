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
import { SqlPartType } from '@/lib/backend-adapter.ts';

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
  delete?: (options?: { lazy?: boolean }) => Promise<void>;
};

export type PerspectiveCellMeta = {
  dx?: number;
  dy?: number;
  row_header?: unknown[];
  size_key?: number;
  type?: string;
  user?: unknown;
  value?: unknown;
  virtual_x?: number;
  x?: number;
  x0?: number;
  x1?: number;
  y?: number;
  y0?: number;
  y1?: number;
  column_header?: string[];
  current?: boolean;
};

type RegularTableElement = HTMLElement & {
  getMeta?: (el: Element) => PerspectiveCellMeta;
};

const getRowMetas = (
  regularTable: RegularTableElement,
  row: HTMLTableRowElement,
): PerspectiveCellMeta[] => {
  return [...row.querySelectorAll<HTMLTableCellElement>('td')].map((td) => ({
    ...(regularTable.getMeta?.(td) ?? {}),
  }));
};

export const getRowValue = (
  row: PerspectiveCellMeta[],
  column: string,
): unknown => {
  return row.find(
    (meta) => meta.column_header?.[0] === column,
  )?.value;
};

type RowButtonConfig = {
  column: string; // A column in which a button will be displayed in the cell.
  label?: string; // Button text. Can be used with an icon.
  icon?: string; // SVG markup. For example: `<svg ...>...</svg>`.
  title?: string; // Tooltip.
  className?: string; // Additional CSS class.
  visible?: (row: PerspectiveCellMeta[]) => boolean; // You can dynamically hide the button for a specific row.
  disabled?: (row: PerspectiveCellMeta[]) => boolean; // You can disable the button dynamically.
  onClick: (
    row: PerspectiveCellMeta[],
    event: MouseEvent,
    cellMeta: PerspectiveCellMeta,
  ) => void;
};

export function DataView({
  settings,
  datagrid_editable = true,
  datagrid_edit_mode = 'EDIT',
  onRowDoubleClick,
  rowButtons = [],
}: {
  settings: boolean;
  datagrid_editable?: boolean;
  datagrid_edit_mode?: string;
  onRowDoubleClick?: (metas: PerspectiveCellMeta[], event: MouseEvent) => void;
  rowButtons?: RowButtonConfig[];
}) {
  const viewerRef = useRef<PerspectiveViewerElement | null>(null);
  const workerRef = useRef<PerspectiveWorker | null>(null);
  const tableRef = useRef<PerspectiveTable | null>(null);
  const initializedRef = useRef(false);
  const lastAppliedRequestIdRef = useRef(0);
  const loadTokenRef = useRef(0);

  const { dataLoadingState, dataLoadingError, csv, title, requestId } = useSharedDataLoad();

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

  useEffect(() => {
    if (dataLoadingError) {
      setError('Data Loading Error: ' + dataLoadingError);
    } else {
      setError(null);
      if (dataLoadingState) {
        setStatus('Data loading...');
      } else {
        setStatus(null);
      }
    }
  }, [dataLoadingState, dataLoadingError]);


  const safeDeleteTable = async (table: PerspectiveTable | null) => {
    if (!table?.delete) return;

    try {
      await table.delete({ lazy: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!message.includes('Cannot delete table with views')) {
        throw e;
      }
    }
  };

  const hidePerspectiveThemeControl = (viewer: PerspectiveViewerElement) => {
    const root = viewer.shadowRoot;
    if (!root) return;
    const styleId = 'hide-perspective-theme-control';
    if (root.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        #theme,
        #theme_icon,
        label[for="theme"],
        select#theme {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `;
    root.appendChild(style);
  };

  const attachRowDoubleClickHandler = (
    viewer: PerspectiveViewerElement,
    onRowDoubleClick: (metas: PerspectiveCellMeta[], event: MouseEvent) => void,
  ) => {
    const datagrid = viewer.getElementsByTagName('perspective-viewer-datagrid')[0];
    const regularTable = datagrid?.shadowRoot?.querySelector(
      'regular-table',
    ) as RegularTableElement | null;
    if (!regularTable) {
      return;
    }
    if (regularTable.dataset.dblclickAttached === 'true') {
      return;
    }
    regularTable.dataset.dblclickAttached = 'true';
    regularTable.addEventListener('dblclick', (event) => {
      const target = event.target as Element | null;
      if (!target) {
        return;
      }
      const cell = target.closest('td');
      if (!cell) {
        return;
      }
      const row = target.closest('tr');
      if (!row) {
        return;
      }
      const metas: PerspectiveCellMeta[]  = [...row.getElementsByTagName('td')].map(td=>(
        {...(regularTable.getMeta?.(td) ?? {}), current: td === cell}
      ))
      onRowDoubleClick(metas, event as MouseEvent);
    });
  };

  const createRowButtonElement = (
    config: RowButtonConfig,
    buttonIndex: number,
    disabled: boolean,
  ): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.perspectiveRowButton = String(buttonIndex);
    if (config.title) {
      button.title = config.title;
      button.setAttribute('aria-label', config.title);
    } else if (config.label) {
      button.setAttribute('aria-label', config.label);
    }
    if (config.className) {
      button.className = config.className;
    }
    button.disabled = disabled;
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.gap = '4px';
    button.style.cursor = disabled ? 'default' : 'pointer';
    button.style.padding = '2px 6px';
    button.style.margin = '0 2px';
    button.style.border = 'none';
    button.style.background = 'transparent';
    if (config.icon) {
      const iconContainer = document.createElement('span');
      iconContainer.dataset.rowButtonIcon = 'true';
      iconContainer.innerHTML = config.icon;
      button.appendChild(iconContainer);
    }
    if (config.label) {
      const label = document.createElement('span');
      label.textContent = config.label;
      button.appendChild(label);
    }
    return button;
  };

  const decorateRowButtons = (
    regularTable: RegularTableElement,
    rowButtons: RowButtonConfig[],
  ) => {
    if (rowButtons.length === 0) {
      return;
    }
    const cells = regularTable.querySelectorAll<HTMLTableCellElement>('td');
    for (const cell of cells) {
      const cellMeta = regularTable.getMeta?.(cell);
      const columnName = cellMeta?.column_header?.[0];
      if (!columnName) {
        continue;
      }
      const matchingButtons = rowButtons
        .map((config, index) => ({
          config,
          index,
        }))
        .filter(({ config }) => config.column === columnName);
      if (matchingButtons.length === 0) {
        continue;
      }
      const row = cell.closest('tr') as HTMLTableRowElement | null;
      if (!row) {
        continue;
      }
      const rowMetas = getRowMetas(regularTable, row);
      // Perspective reuses DOM cells during virtual scrolling, so a simple `decorated` flag is not enough; the button container needs to be rebuilt.
      let container = cell.querySelector<HTMLElement>(
        ':scope > [data-perspective-row-buttons="true"]',
      );
      if (!container) {
        container = document.createElement('div');
        container.dataset.perspectiveRowButtons = 'true';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '2px';
        container.style.width = '100%';
        cell.replaceChildren(container);
      } else {
        container.replaceChildren();
      }
      for (const { config, index } of matchingButtons) {
        const visible = config.visible?.(rowMetas) ?? true;
        if (!visible) {
          continue;
        }
        const disabled = config.disabled?.(rowMetas) ?? false;
        const button = createRowButtonElement(config, index, disabled);
        container.appendChild(button);
      }
    }
  };


  const attachRowButtons = (
    viewer: PerspectiveViewerElement,
    rowButtons: RowButtonConfig[],
  ) => {
    if (rowButtons.length === 0) {
      return;
    }
    const datagrid = viewer.getElementsByTagName(
      'perspective-viewer-datagrid',
    )[0];
    const regularTable = datagrid?.shadowRoot?.querySelector(
      'regular-table',
    ) as RegularTableElement | null;
    if (!regularTable) {
      return;
    }
    decorateRowButtons(regularTable, rowButtons);
    // We update the current configuration. This is important if the props have changed but the listener has already been set up.
    (
      regularTable as RegularTableElement & {
        __rowButtons?: RowButtonConfig[];
      }
    ).__rowButtons = rowButtons;
    if (regularTable.dataset.rowButtonsAttached === 'true') {
      return;
    }
    regularTable.dataset.rowButtonsAttached = 'true';
    regularTable.addEventListener('click', (event) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>(
        'button[data-perspective-row-button]',
      );
      if (!button) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) {
        return;
      }
      const buttonIndex = Number(button.dataset.perspectiveRowButton);
      if (!Number.isInteger(buttonIndex)) {
        return;
      }
      const currentButtons = (
        regularTable as RegularTableElement & {
          __rowButtons?: RowButtonConfig[];
        }
      ).__rowButtons;
      const config = currentButtons?.[buttonIndex];
      if (!config) {
        return;
      }
      const row = button.closest('tr') as HTMLTableRowElement | null;
      const cell = button.closest('td') as HTMLTableCellElement | null;
      if (!row || !cell) {
        return;
      }
      const rowMetas = getRowMetas(regularTable, row);
      const cellMeta = regularTable.getMeta?.(cell) ?? {};
      config.onClick(rowMetas, event as MouseEvent, cellMeta);
    });

    const observer = new MutationObserver(() => {
      const currentButtons = (
        regularTable as RegularTableElement & {
          __rowButtons?: RowButtonConfig[];
        }
      ).__rowButtons;

      if (currentButtons) {
        decorateRowButtons(regularTable, currentButtons);
      }
    });

    observer.observe(regularTable, {
      childList: true,
      subtree: true,
    });
  };

  const loadCsvToViewer = async (csv: string, title?: string | null) => {
    const token = ++loadTokenRef.current;

    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!workerRef.current) {
      workerRef.current = await perspective.worker();
    }

    if (token !== loadTokenRef.current || viewerRef.current !== viewer) return;

    const prevTable = tableRef.current; // csv = 'abc,bca,drt\n123,dew,456';

    const table = await workerRef.current.table(csv, {
      format: 'csv',
    });

    if (token !== loadTokenRef.current || viewerRef.current !== viewer) {
      await safeDeleteTable(table as PerspectiveTable);
      return;
    }

    tableRef.current = table as PerspectiveTable;
    await viewer.load(table);

    if (token !== loadTokenRef.current || viewerRef.current !== viewer) {
      await safeDeleteTable(table as PerspectiveTable);
      return;
    }

    await viewer.restore({
      plugin: 'Datagrid',
      settings: settings,
      title: title ?? 'no data',
      plugin_config: {
        editable: datagrid_editable,
        edit_mode: datagrid_edit_mode,
      },
    });

    hidePerspectiveThemeControl(viewer); // const themeElements = viewer.shadowRoot?.querySelectorAll('#theme_icon, #theme'); for (const themeElement of themeElements ?? []) {  //(themeElement as HTMLElement).style.display = 'none'; (themeElement as HTMLElement).remove(); }

    if (rowButtons) {
      attachRowButtons(viewer, rowButtons);
    }

    if(onRowDoubleClick) {
      attachRowDoubleClickHandler(viewer, onRowDoubleClick);
    }
    const elements = viewer.getElementsByTagName('perspective-viewer-datagrid');
    if( elements && elements.length > 0 ){
      const tds = elements[0].shadowRoot?.querySelectorAll('regular-table > table td, regular-table > table th');
      if (tds && elements.length > 0) {
        for (const td of tds) {
          (td as HTMLElement).style.boxShadow = '1px 0px var(--psp-inactive--border-color, #8b868045)'; //style.boxShadow = '1px 0px var(--inactive--border-color, #8b868045)';
        }
      }
      
    }

    await safeDeleteTable(prevTable); // await prevTable?.delete?.();
  };

  useEffect(() => {
    let cancelled = false;

    const run = async (csv?: string | null) => {
      const viewer = viewerRef.current;
      if (!viewer || initializedRef.current) {
        return;
      }
      setError(null);
      setStatus('Loading data...');
      try {
        const currentCsv = csv ?? '_\n'; // const response = await fetch('/mock/customers.csv'); if (!response.ok) { // noinspection ExceptionCaughtLocallyJS throw new Error(`Failed to load data: ${response.status}`); } const csv = await response.text();
        const currentTitle = csv ? title: null;
        if (cancelled) return;
        await loadCsvToViewer(currentCsv, currentTitle);
        setStatus(null);
        initializedRef.current = true;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        setError(message);
      }
    };

    void run(csv);

    return () => {
      cancelled = true; // if (initializedRef.current) {}

      loadTokenRef.current += 1;

      const viewer = viewerRef.current;
      const table = tableRef.current;
      viewerRef.current = null;
      tableRef.current = null;
      initializedRef.current = false;

      void (async () => {
        try {
          await viewer?.delete?.();
          await safeDeleteTable(table);
        } catch (e) {
          console.warn('Perspective cleanup failed', e);
        }
      })();
    };
  }, []);

  useEffect(() => {
    if (!requestId) return;
    if (dataLoadingState !== SqlPartType.none) return;
    if (lastAppliedRequestIdRef.current === requestId) return; // if (!initializedRef.current) return;

    lastAppliedRequestIdRef.current = requestId;

    if (!csv?.trim()) {
      setError(null);
      setStatus('No data');
      return;
    }
    const run = async () => {
      try {
        await loadCsvToViewer(csv, title);
        setStatus(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        setError(message);
        setStatus(null);
      }
    };

    void run();
  }, [csv, requestId, dataLoadingState, title]);

  return (
    <>
      {!error && status && <div style={{ marginBottom: 12 }}>{status}</div>}
      {error && <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>}
      <perspective-viewer
        ref={(node) => {
          if(node) {
            node.setAttribute('theme', isDark ? 'Pro Dark' : 'Pro Light');
            const viewer = node as PerspectiveViewerElement;
            hidePerspectiveThemeControl(viewer);
            viewerRef.current = node as PerspectiveViewerElement | null;
          } else {
            viewerRef.current = null;
          }
        }}
        style={{
          width: !error && !status ? '100%' : '0',
          height: !error && !status ? '100%' : '0',
        }}
      />
    </>
  );
}
