import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CopyPlus, Loader2 } from 'lucide-react';
import { type WindowManagerApi } from './floating-window';
import { SqlView } from './SqlView';
import { Input } from '@pondpilot/flowscope-app/src/components/ui/input';
import { ToolbarButton } from './ToolbarButton';
import { toast } from 'sonner';
import {
  DataDescribePayload,
  DataDescribeType,
  SqlPartType,
} from '@pondpilot/flowscope-app/src/lib/backend-adapter';
import { useProject } from '@pondpilot/flowscope-app/src/lib/project-store';
import { devLineageDataDescribe } from '@pondpilot/flowscope-app/src/lib/utils_backend';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pondpilot/flowscope-app/src/components/ui/tabs';
import {
  DataLoadProvider,
  useSharedDataLoad,
} from '@pondpilot/flowscope-app/src/components/DataLoadContext';
import { DataView, getRowValue } from '@pondpilot/flowscope-app/src/components/DataView';
import { LoadSQL, SchemaPreviewTableData } from './FloatingSQL';
import { resolveTheme, useThemeStore } from '@pondpilot/flowscope-app/src/lib/theme-store';

const EMPTY_NO_COLUMNS_FOUND = '_\nNo columns found';

type DescribeTab = 'Columns' | 'Code' | 'Data';
const VALID_TABS: readonly DescribeTab[] = ['Columns', 'Code', 'Data'];
function isValidTab(tab: string): tab is DescribeTab {
  return VALID_TABS.includes(tab as DescribeTab);
}

function LoadingState({ tableFullName, isDark }: { tableFullName: string; isDark: boolean }) {
  return (
    <div className={isDark ? 'text-neutral-300' : 'text-neutral-600'}>
      <div className="text-sm font-medium flex gap-2 center blink">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching description of {tableFullName}
        ...
      </div>
    </div>
  );
}

function CopyDescribedColumns({ columnNames }: { columnNames: string[] }) {
  const [columnsCopied, setColumnsCopied] = useState(false);
  const inputDescribeCopyColumnsAliasRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Input
        ref={inputDescribeCopyColumnsAliasRef}
        placeholder="Copy columns alias"
        className="h-7 focus-visible:ring-0 text-sm w-45"
      />
      <ToolbarButton
        title={columnsCopied ? 'Copied' : `Copy columns`}
        aria-label={columnsCopied ? 'Copied' : 'Copy columns'}
        onClick={async () => {
          try {
            const alias = inputDescribeCopyColumnsAliasRef.current?.value;
            await navigator.clipboard.writeText(
              columnNames.map((cn) => `${alias ? `${alias}.` : ''}${cn}`).join(', ')
            );
            setColumnsCopied(true);
            window.setTimeout(() => setColumnsCopied(false), 1200);
          } catch (error) {
            setColumnsCopied(false);
            console.error(`Clipboard copy failed`, error);
            toast.error(`Failed to Copy columns`, {
              description: 'Clipboard access is unavailable or blocked by the browser.',
            });
          }
        }}
      >
        {columnsCopied ? <Check className="size-3.5" /> : <CopyPlus className="size-3.5" />}
      </ToolbarButton>
    </>
  );
}

export function FloatingDescribe({
  database,
  userName,
  tableName,
  schema,
  columnName,
}: {
  database?: string;
  userName?: string;
  tableName: string;
  schema?: string;
  columnName?: string;
}) {
  const theme = useThemeStore((state) => state.theme);
  const isDark = resolveTheme(theme) === 'dark';

  const { currentProject } = useProject();
  const innerDatabase = database ?? currentProject?.database;
  const innerUserName = userName ?? currentProject?.userName;
  const [activeTab, setActiveTab] = useState<DescribeTab>('Code');
  const [columnNames, setColumnNames] = useState<string[] | null>(null);

  const [script, setScript] = useState<string | null | undefined>(null);
  const [isCodeLoading, setIsCodeLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const { csv, setCsv, dataLoadingState, setDataLoadingState } = useSharedDataLoad();
  const [errorTable, setErrorTable] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const [loadedCodeKey, setLoadedCodeKey] = useState<string | null>(null);
  const [loadedTableKey, setLoadedTableKey] = useState<string | null>(null);

  const tableFullName = `${schema ? `${schema}.` : ''}${tableName}`;
  const describeKey = useMemo(
    () =>
      [innerDatabase ?? '', innerUserName ?? '', schema ?? '', tableName, columnName ?? ''].join(
        '\u0000'
      ),
    [innerDatabase, innerUserName, schema, tableName, columnName]
  );

  useEffect(() => {
    if (!currentProject) {
      setErrorCode('Project not found.');
      setErrorTable('Project not found.');
      setIsCodeLoading(false);
      setDataLoadingState(SqlPartType.none);
      return;
    }

    let cancelled = false;
    const asCode = activeTab === 'Code';
    const alreadyLoaded = asCode ? loadedCodeKey === describeKey : loadedTableKey === describeKey;

    if (alreadyLoaded) {
      return;
    }

    setColumnNames(null);

    if (asCode) {
      setErrorCode(null);
      setIsCodeLoading(true);
      setScript(null);
    } else {
      setErrorTable(null);
      setDataLoadingState(SqlPartType.sql);
      setCsv(null);
    }

    async function loadDescription() {
      const requestId = ++requestIdRef.current;

      try {
        const dataDescribePayload: DataDescribePayload = {
          schema,
          tableName,
          columnName,
          database: innerDatabase,
          userName: innerUserName,
          describeType: asCode ? DataDescribeType.code : DataDescribeType.table,
        };
        const response = await devLineageDataDescribe(dataDescribePayload);
        if (cancelled || requestIdRef.current !== requestId) {
          return;
        }
        if (asCode) {
          setScript(response?.script);
          setLoadedCodeKey(describeKey);
        } else {
          setCsv(response?.csv ?? EMPTY_NO_COLUMNS_FOUND, tableFullName);
          setLoadedTableKey(describeKey);
        }
        setColumnNames(response?.columnNames ?? null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : 'Failed to describe object';
        if (asCode) {
          setErrorCode(errorMessage);
          setLoadedCodeKey(describeKey);
        } else {
          setCsv(EMPTY_NO_COLUMNS_FOUND, tableFullName);
          setErrorTable(errorMessage);
          setLoadedTableKey(describeKey);
        }
      } finally {
        if (!cancelled) {
          if (asCode) {
            setIsCodeLoading(false);
          } else {
            setDataLoadingState(SqlPartType.none);
          }
        }
      }
    }

    void loadDescription();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    columnName,
    describeKey,
    loadedCodeKey,
    loadedTableKey,
    innerDatabase,
    innerUserName,
    schema,
    setCsv,
    setDataLoadingState,
    tableFullName,
    tableName,
  ]);

  const handleTabChange = useCallback(
    (value: string) => {
      if (isValidTab(value)) {
        setActiveTab(value);
      }
    },
    [setActiveTab]
  );

  let columnSpan: { start: number; end: number } | undefined;

  if (script && columnName) {
    const start = script.indexOf(`"${columnName}"`);
    if (start !== -1) {
      columnSpan = {
        start,
        end: start + columnName.length + 2,
      };
    }
  }

  const table = useMemo(
    (): SchemaPreviewTableData => ({
      schema,
      tableName,
      columns: columnNames?.map((columnName) => ({ name: columnName })),
    }),
    [schema, tableName, columnNames]
  );

  return (
    <div className="h-full w-full min-h-0">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="h-full w-full flex flex-col min-h-0"
      >
        <TabsList className="shrink-0 self-start w-fit justify-start">
          <TabsTrigger value="Code">Code</TabsTrigger>
          <TabsTrigger value="Columns">Columns</TabsTrigger>
          <TabsTrigger value="Data">Data</TabsTrigger>
        </TabsList>
        <TabsContent value="Code" className="flex-1 min-h-0 mt-0 p-0 data-[state=inactive]:hidden">
          <SqlView
            className="h-full w-full"
            isDark={isDark}
            editable
            lineWrapping={false}
            value={script ?? (isCodeLoading ? '' : 'No description found')}
            highlightedSpan={columnSpan}
            extraToolbarElements={
              isCodeLoading ? (
                <LoadingState isDark={isDark} tableFullName={tableFullName} />
              ) : errorCode ? (
                <span>{errorCode}</span>
              ) : columnNames?.length ? (
                <CopyDescribedColumns columnNames={columnNames} />
              ) : undefined
            }
          />
        </TabsContent>
        <TabsContent
          value="Columns"
          className="flex-1 min-h-0 mt-0 p-0 data-[state=inactive]:hidden h-full flex flex-col"
        >
          {dataLoadingState !== SqlPartType.none ? (
            <LoadingState isDark={isDark} tableFullName={tableFullName} />
          ) : errorTable ? (
            <span>{errorTable}</span>
          ) : (
            <div className="shrink-0 flex items-center gap-2 p-1">
              {columnNames?.length && <CopyDescribedColumns columnNames={columnNames} />}
              {!csv && <span>No columns data found</span>}
            </div>
          )}
          <div className="flex-1 min-h-0">
            <DataView
              settings={false}
              datagrid_editable={false}
              datagrid_edit_mode={'SELECT_ROW'}
              rowButtons={
                [
                  {
                    column: '__row_action',
                    label: 'Test',
                    title: 'Test row action',
                    onClick: (row) => {
                      const owner = getRowValue(row, 'OWNER');
                      const objectName = getRowValue(row, 'OBJECT_NAME');
                      const objectType = getRowValue(row, 'OBJECT_TYPE');
                      console.log('Test row action:', owner, objectName, objectType);
                    },
                  },
                ]
              }
            />
          </div>
        </TabsContent>

        <TabsContent
          value="Data"
          className="flex-1 min-h-0 mt-0 p-0 data-[state=inactive]:hidden h-full flex flex-col"
        >
          <LoadSQL
            database={innerDatabase}
            userName={innerUserName}
            title={tableFullName}
            table={table}
            dialect={currentProject?.dialect ?? 'generic'}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const openDescribeWindow = (
  manager: Pick<WindowManagerApi, 'openWindow'>,
  tableName: string,
  database?: string,
  schema?: string,
  columnName?: string
) => {
  const tableFullName = `${schema ? `${schema}.` : ''}${tableName}`;
  const objectFullName = `${tableFullName}${columnName ? `.${columnName}` : ''}`;

  manager.openWindow({
    id: `describeWindow-${database ?? ''}-${objectFullName}`,
    title: `${database ? `${database}. ` : ''}Describe object ${objectFullName}`,
    width: 980,
    height: 680,
    minWidth: 640,
    minHeight: 420,
    content: (
      <DataLoadProvider>
        <FloatingDescribe tableName={tableName} schema={schema} columnName={columnName} />
      </DataLoadProvider>
    ),
  });
};
