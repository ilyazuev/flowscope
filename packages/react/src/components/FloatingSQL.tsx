import { useCallback, useMemo, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
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
import type { SqlParameters } from '@pondpilot/flowscope-app/src/lib/project-store';
import { SqlPartType } from '@pondpilot/flowscope-app/src/lib/backend-adapter';
import type { WindowManagerApi } from './floating-window';
import { Button } from './ui/button';
import { modKey } from '@pondpilot/flowscope-app/src/lib/shortcuts';

export type SchemaPreviewTableData = {
  catalog?: string;
  schema?: string;
  tableName: string;
  columns?: Array<{
    name: string;
  }>;
};

type CachedFloatingParameters = {
  sql: string;
  parameters: SqlParameters;
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

function buildQualifiedTableName(data: SchemaPreviewTableData, dialect: Dialect): string {
  const parts = [/*data.catalog, */data.schema, data.tableName].filter(
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

export function buildSchemaPreviewSql(
  data: SchemaPreviewTableData,
  dialect: Dialect
): string {
  const columns = data.columns?.length
    ? data.columns
      .map((column) => `${quoteIdentifierPart(column.name, dialect)}`)
      .join(', ')
    : '\t*';

  const tableName = buildQualifiedTableName(data, dialect);
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

export function buildSchemaPreviewWindowId(data: SchemaPreviewTableData): string {
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
  windowManager: WindowManagerApi;
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
      <FloatingSQL
        title={title}
        initialSql={buildSchemaPreviewSql(table, dialect)}
        dialect={dialect}
      />
    ),
  });
}

export function FloatingSQL(props: FloatingSQLProps) {
  return (
    <DataLoadProvider>
      <FloatingSQLInner {...props} />
    </DataLoadProvider>
  );
}

function FloatingSQLInner({ title, initialSql, dialect }: FloatingSQLProps) {
  const [sql, setSql] = useState(initialSql);
  const [cachedParameters, setCachedParameters] =
    useState<CachedFloatingParameters | null>(null);

  const theme = useThemeStore((state) => state.theme);
  const isDark = resolveTheme(theme) === 'dark';

  const {
    runExecuteSql,
    isDataLoading,
    needParameters,
    parameters,
    setNeedParameters,
    setDataLoading,
  } = useSharedDataLoad();

  const isRunning = isDataLoading !== SqlPartType.none;

  const parametersForCurrentSql = useMemo(() => {
    if (!cachedParameters || cachedParameters.sql !== sql) {
      return undefined;
    }

    return cachedParameters.parameters;
  }, [cachedParameters, sql]);

  const runSql = useCallback(
    (params?: SqlParameters) => {
      void runExecuteSql(sql, title, params, SqlPartType.sql);
    },
    [runExecuteSql, sql, title]
  );

  const handleRunSql = useCallback(() => {
    runSql(parametersForCurrentSql);
  }, [runSql, parametersForCurrentSql]);

  const handleUseParameters = useCallback(
    (editedParameters: SqlParameters) => {
      setCachedParameters({
        sql,
        parameters: editedParameters,
      });

      runSql(editedParameters);
    },
    [runSql, sql]
  );

  const inputParameters = useMemo(() => {
    if (!parameters) {
      return undefined;
    }

    if (!parametersForCurrentSql) {
      return parameters;
    }

    return Object.fromEntries(
      Object.entries(parameters).map(([key, value]) => [
        key,
        parametersForCurrentSql[key] ?? value,
      ])
    );
  }, [parameters, parametersForCurrentSql]);

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
            onRunSqlShortcut={handleRunSql}
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
          <DataView />
        </ResizablePanel>
      </ResizablePanelGroup>

      {inputParameters && (
        <SqlParametersEditor
          open={needParameters}
          onOpenChange={(open: boolean, ok?: boolean) => {
            setNeedParameters(open);

            if (!ok) {
              setDataLoading(SqlPartType.none);
            }
          }}
          onRunSql={handleUseParameters}
          runSqlName={title}
          inputParameters={inputParameters}
        />
      )}
    </div>
  );
}