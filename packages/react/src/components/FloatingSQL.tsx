import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, LoaderCircle, Play } from 'lucide-react';
import { SqlView } from './SqlView';
import type { Dialect } from '@pondpilot/flowscope-core';
import { DataView } from '@pondpilot/flowscope-app/src/components/DataView';
import {
  DataLoadProvider,
  useSharedDataLoad,
} from '@pondpilot/flowscope-app/src/components/DataLoadContext';
import { SqlParametersEditor } from '@pondpilot/flowscope-app/src/components/SqlParametersEditor';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@pondpilot/flowscope-app/src/components/ui/resizable';
import { resolveTheme, useThemeStore } from '@pondpilot/flowscope-app/src/lib/theme-store';
import { SqlParameters, useProject } from '@pondpilot/flowscope-app/src/lib/project-store';
import { DataDescribePayload, DataDescribeType, SqlPartType } from '@pondpilot/flowscope-app/src/lib/backend-adapter';
import type { WindowManagerApi } from './floating-window';
import { Button } from './ui/button';
import { modKey } from '@pondpilot/flowscope-app/src/lib/shortcuts';
import { extractKnownSqlParamsInSqlOrder } from '@pondpilot/flowscope-app/src/lib/utils';
import { devLineageDataDescribe } from '@pondpilot/flowscope-app/src/lib/utils_backend';

const DATABASE_OBJECT_NOT_FOUND = "Database object not found";

export type SchemaPreviewTableData = {
  catalog?: string;
  schema?: string;
  tableName: string;
  columns?: Array<{
    name: string;
  }>;
};

interface FloatingSQLProps {
  title: string;
  initialSql: string;
  dialect: Dialect;
}

const DIALECTS_WITH_LIMIT = new Set<Dialect>([
  'postgres',
  'redshift',
  'snowflake',
  'duckdb',
  'sqlite',
  'mysql',
  'bigquery',
  'databricks',
  'hive',
  'clickhouse',
]);

function isSimpleIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(value);
}

function quoteIdentifierPart(identifier: string, dialect: Dialect): string {
  const value = identifier.trim();

  if (!value) {
    return identifier;
  }

  if (isSimpleIdentifier(value)) {
    return value;
  }

  if (dialect === 'mysql') {
    return `\`${value.replace(/`/g, '``')}\``;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function quoteBigQueryPath(parts: string[]): string {
  return `\`${parts.join('.').replace(/`/g, '\\`')}\``;
}

function buildQualifiedTableName(table: SchemaPreviewTableData, dialect: Dialect): string {
  const parts = [/*data.catalog, */table.schema, table.tableName].filter(
    (part): part is string => Boolean(part?.trim())
  );

  if (dialect === 'bigquery') {
    return quoteBigQueryPath(parts);
  }

  return parts.map((part) => quoteIdentifierPart(part, dialect)).join('.');
}

function buildLimitParts(dialect: Dialect): {
  selectPrefix?: string;
  suffix?: string;
} {
  if (dialect === 'mssql') {
    return {
      selectPrefix: 'TOP 500',
    };
  }

  if (DIALECTS_WITH_LIMIT.has(dialect)) {
    return {
      suffix: 'LIMIT 500',
    };
  }

  return {
    suffix: 'FETCH FIRST 500 ROWS ONLY',
  };
}

function buildSchemaPreviewSql(
  table: SchemaPreviewTableData,
  dialect: Dialect
): string {
  const columns = table.columns?.length
    ? table.columns
      .map((column) => `${quoteIdentifierPart(column.name, dialect)}`)
      .join(', ')
    : '\t*';

  const tableName = buildQualifiedTableName(table, dialect);
  const limit = buildLimitParts(dialect);

  const selectLine = limit.selectPrefix
    ? `SELECT ${limit.selectPrefix}`
    : 'SELECT';

  const sql = `${selectLine}
\t${columns}
FROM ${tableName}
WHERE 1 = 1
-- AND -- condition
-- ORDER BY
-- GROUP BY`;

  return limit.suffix
    ? `${sql}
${limit.suffix}`
    : sql;
}

function buildSchemaPreviewWindowId(data: SchemaPreviewTableData): string {
  return [
    'schema-sql-preview',
    data.catalog || 'default-catalog',
    data.schema || 'default-schema',
    data.tableName,
  ]
    .map((part) =>
      String(part)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/gi, '_')
    )
    .join(':');
}

export function openFloatingSQLPreview({
  windowManager,
  table,
  dialect,
}: {
  windowManager: Pick<WindowManagerApi, 'openWindow'>;
  table: SchemaPreviewTableData;
  dialect: Dialect;
}) {
  const title = `Preview: ${[table.catalog, table.schema, table.tableName]
    .filter(Boolean)
    .join('.')}`;
  windowManager.openWindow({
    id: buildSchemaPreviewWindowId(table),
    title,
    width: 980,
    height: 680,
    minWidth: 640,
    minHeight: 420,
    contentClassName: 'min-h-0 flex-1 overflow-hidden p-1 text-sm leading-6',
    content: (
      <LoadSQL
        title={title}
        table={table}
        dialect={dialect}
      />
    ),
  });
}

interface LoadSQLProps {
  title: string;
  table: SchemaPreviewTableData;
  dialect: Dialect;
}

function LoadSQL({ title, table, dialect }: LoadSQLProps) {
  const { currentProject } = useProject();
  const [currentTable, setCurrentTable] = useState<SchemaPreviewTableData>(table);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if(error || (currentTable.columns?.length ?? 0) > 0 ) {
      return;
    }
    async function loadDescription() {
      try {
        if (!currentProject) {
          // noinspection ExceptionCaughtLocallyJS
          throw new Error('Project not found.');
        }
        const dataDescribePayload: DataDescribePayload = {
          schema: currentTable.schema,
          tableName: currentTable.tableName,
          database: currentProject.database,
          userName: currentProject.userName,
          describeType: DataDescribeType.columns,
        };
        const response = await devLineageDataDescribe(dataDescribePayload);
        if (cancelled) {
          return;
        }
        if( response?.columnNames) {
          setCurrentTable((prev) => ({
            ...prev,
            columns: response.columnNames?.map(name=>({name}))
          }));
        } else {
          setError(DATABASE_OBJECT_NOT_FOUND);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : DATABASE_OBJECT_NOT_FOUND);
      }
    }
    void loadDescription();
    return () => {
      cancelled = true;
    };
  }, [currentTable]);

  return (currentTable.columns?.length ?? 0) > 0 ? (
    <FloatingSQL
      title={title}
      initialSql={buildSchemaPreviewSql(currentTable, dialect)}
      dialect={dialect}
    />
  ) : error ? (
    <span className="text-red-500 text-xs">{error}</span>
  ) : (
    <div className="flex p-1 gap-1">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      <span className="text-xs">Search object in database...</span>
    </div>
  );
}

function FloatingSQL(props: FloatingSQLProps) {
  return (
    <DataLoadProvider>
      <FloatingSQLInner {...props} />
    </DataLoadProvider>
  );
}

function FloatingSQLInner({ title, initialSql, dialect }: FloatingSQLProps) {
  const [sql, setSql] = useState(initialSql);
  const cachedParameters = useRef<SqlParameters | null>(null);
  const foundInSqlParameters = useRef<SqlParameters | null>(null);

  const theme = useThemeStore((state) => state.theme);
  const isDark = resolveTheme(theme) === 'dark';

  const {
    runExecuteSql,
    dataLoadingState,
    needParameters,
    setNeedParameters,
    setDataLoadingState,
  } = useSharedDataLoad();

  const isRunning = dataLoadingState !== SqlPartType.none;

  const needParametersForSql = (
    sql: string,
    editedParameters?: SqlParameters,
  ): boolean => {
    if (editedParameters) {
      return false;
    }
    foundInSqlParameters.current = extractKnownSqlParamsInSqlOrder(sql, cachedParameters.current, dialect);
    if ( !foundInSqlParameters.current || Object.keys(foundInSqlParameters.current).length === 0) {
      return false;
    }
    setNeedParameters(true);
    return true;
  };

  const runSql = useCallback(
    (editedParameters?: SqlParameters) => {
      if ( !needParametersForSql(sql, editedParameters ) ) {
        void runExecuteSql(sql, title, editedParameters, SqlPartType.sql);
      }
    },
    [runExecuteSql, sql, title]
  );

  const handleRunSql = useCallback(() => {
    runSql();
  }, [runSql]);

  const handleUseParameters = useCallback(
    (editedParameters: SqlParameters) => {
      if( !cachedParameters.current ) {
        cachedParameters.current = {};
      }
      for (const key of Object.keys(editedParameters)) {
        if( !cachedParameters.current[key] ) {
          cachedParameters.current[key] = editedParameters[key];
        }
      }
      runSql(editedParameters);
    },
    [runSql, sql]
  );

  const sqlViewShortcuts = useMemo(
    () => [
      {
        key: 'Mod-Enter',
        action: handleRunSql,
      },
    ],
    [handleRunSql]
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <ResizablePanelGroup direction="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={50} minSize={20}>
          <SqlView
            value={sql}
            onChange={setSql}
            editable
            dialect={dialect}
            isDark={isDark}
            className="h-full text-sm"
            shortcuts={sqlViewShortcuts}
            extraToolbarElements={
              <Button
                type="button"
                size="sm"
                disabled={isRunning}
                onClick={handleRunSql}
                className="h-8 gap-1.5 rounded-full bg-brand-blue-500 px-3 font-medium text-white hover:bg-brand-blue-700"
              >
                {isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}

                <span>Run Sql</span>

                <kbd className="ml-2 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  <span className="text-xs">{modKey()}</span>↵
                </kbd>
              </Button>
            }
          />
        </ResizablePanel>

        <ResizableHandle withHandleHoriz />

        <ResizablePanel defaultSize={50} minSize={20}>
          <DataView settings={true} />
        </ResizablePanel>
      </ResizablePanelGroup>

      {foundInSqlParameters.current && Object.keys(foundInSqlParameters.current).length > 0 && (
        <SqlParametersEditor
          open={needParameters}
          isDark={isDark}
          onOpenChange={(open: boolean, ok?: boolean) => {
            setNeedParameters(open);

            if (!ok) {
              setDataLoadingState(SqlPartType.none);
            }
          }}
          onRunSql={handleUseParameters}
          runSqlName={title}
          inputParameters={foundInSqlParameters.current}
        />
      )}
    </div>
  );
}