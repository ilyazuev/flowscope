import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, CopyPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SqlViewSelection } from '@pondpilot/flowscope-react';
import { SqlView, ToolbarButton, useLineageState, useFloatingWindows, type WindowManagerApi, } from '@pondpilot/flowscope-react';
import { useThemeStore, resolveTheme } from '@/lib/theme-store';
import { cn, extractKnownSqlParamsInSqlOrder } from '@/lib/utils';
import { Project, ProjectFile, RunMode, SqlParameters } from '@/lib/project-store';
import { useProject } from '@/lib/project-store';
import { useBackend } from '@/lib/backend-context';
import type { GlobalShortcut } from '@/hooks';
import { useAnalysis, useDebounce, useFileNavigation, useGlobalShortcuts } from '@/hooks';
import type { SqlViewMode } from './EditorToolbar';
import { EditorToolbar } from './EditorToolbar';
import { ErrorBoundary } from './ErrorBoundary';
import { DEFAULT_FILE_NAMES } from '@/lib/constants';
import { useSharedDataLoad } from '@/components/DataLoadContext.tsx';
import { useAnalysisStore } from '@/lib/analysis-store.ts';
import { useDataDescribe } from '@/hooks/useDataDescribe.ts';
import { SqlParametersEditor } from '@/components/SqlParametersEditor.tsx';
import { SqlPartType } from '@/lib/backend-adapter.ts';
import { Input } from '@/components/ui/input.tsx';


// Fallback component shown when SqlView encounters an error
function SqlViewFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/5 p-4">
      <AlertCircle className="h-8 w-8 text-destructive mb-2" />
      <p className="text-sm font-medium">Failed to render SQL editor</p>
      <p className="text-xs mt-1">Try reloading the page</p>
    </div>
  );
}

interface EditorAreaProps {
  backendReady: boolean;
  className?: string;
  fileSelectorOpen: boolean;
  onFileSelectorOpenChange: (open: boolean) => void;
  onRevealInLineage: (focusNodeId: string, selectedNodeId?: string) => void;
}

export function EditorArea({
  backendReady,
  className,
  fileSelectorOpen,
  onFileSelectorOpenChange,
  onRevealInLineage,
}: EditorAreaProps) {
  const {
    currentProject,
    activeProjectId,
    updateFile,
    updateFileParameters,
    createFile,
    setRunMode,
    isReadOnly,
  } = useProject();

  const windowManager = useFloatingWindows();
  const theme = useThemeStore((s) => s.theme);
  const isDark = resolveTheme(theme) === 'dark';

  const activeFile = currentProject?.files.find((f) => f.id === currentProject.activeFileId);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Track previous values to detect changes (null means initial mount)
  const previousSchema = useRef<string | null>(null);
  const previousHideCTEs = useRef<boolean | null>(null);

  const runSqlName = useRef<string | null>(null);

  const { hideCTEs, highlightedSpan, result } = useLineageState();

  // SQL view mode toggle: 'template' shows original templated SQL, 'resolved' shows compiled SQL
  const [sqlViewMode, setSqlViewMode] = useState<SqlViewMode>('template');


  const [revealInLineageError, setRevealInLineageError] = useState<string | null>(null);


  // Reset view mode to 'template' when active file changes
  useEffect(() => {
    setSqlViewMode('template');
  }, [currentProject?.activeFileId]);

  // Use backend adapter for analysis when available
  const { adapter } = useBackend();
  const { isAnalyzing, error, runAnalysis, setError } = useAnalysis(backendReady, { adapter });
  const {
    isDataLoading,
    setDataLoading,
    dataLoadingError,
    setDataLoadingError,
    runExecuteSql,
    parameters,
    setParameters,
    needParameters,
    setNeedParameters,
  } = useSharedDataLoad();

  const { dataDescribingError, runDataDescribe, setDataDescribingError, dataDescriptionScript } =
    useDataDescribe();

  const { getResult } = useAnalysisStore();

  const sqlViewRef = useRef<{ getSelection: () => SqlViewSelection | undefined }>(null);

  // Show error toast when error occurs
  useEffect(() => {
    if (error) {
      toast.error('Analysis Error', {
        description: error,
        duration: 5000,
      });
      setError(null);
    }
  }, [error, setError]);

  // Show error toast when error occurs
  useEffect(() => {
    if (dataLoadingError) {
      toast.error('Data Loading Error', {
        description: dataLoadingError,
        duration: 5000,
      });
    }
  }, [dataLoadingError, setDataLoadingError]);

  // Show error toast when error occurs
  useEffect(() => {
    if (dataDescribingError) {
      toast.error('Data Loading Error', {
        description: dataDescribingError,
        duration: 5000,
      });
      setDataDescribingError(null);
    }
  }, [dataDescribingError, setDataDescribingError]);

  useEffect(() => {
    if (revealInLineageError) {
      toast.error('Reveal in Lineage Error', {
        description: revealInLineageError,
        duration: 5000,
      });
      setRevealInLineageError(null);
    }
  }, [revealInLineageError, setRevealInLineageError]);

  // Debounce schema SQL to prevent rapid re-analysis during editing
  const debouncedSchemaSQL = useDebounce(currentProject?.schemaSQL ?? '', 300);

  useFileNavigation();

  useEffect(() => {
    if (isReadOnly) {
      return;
    }

    if (currentProject && currentProject.files.length === 0) {
      createFile(DEFAULT_FILE_NAMES.SCRATCHPAD);
    }
  }, [currentProject, createFile, isReadOnly]);

  // Focus the editor when active file changes (e.g., new file created)
  useEffect(() => {
    if (activeFile && editorContainerRef.current) {
      requestAnimationFrame(() => {
        const cmContent = editorContainerRef.current?.querySelector('.cm-content') as HTMLElement;
        cmContent?.focus();
      });
    }
  }, [activeFile?.id]);

  // Auto-trigger re-analysis when schema or hideCTEs changes.
  // Consolidated into a single effect to prevent duplicate analyses when both change.
  // activeFile.content is intentionally omitted to prevent re-analysis on keystrokes.
  useEffect(() => {
    if (!backendReady || !currentProject || !activeFile) {
      return;
    }

    const schemaChanged =
      previousSchema.current !== null && previousSchema.current !== debouncedSchemaSQL;
    const hideCTEsChanged =
      previousHideCTEs.current !== null && previousHideCTEs.current !== hideCTEs;

    previousSchema.current = debouncedSchemaSQL;
    previousHideCTEs.current = hideCTEs;

    if (schemaChanged || hideCTEsChanged) {
      runAnalysis(activeFile.content, activeFile.path).catch((err) => {
        const reason = schemaChanged ? 'schema change' : 'CTE toggle';
        console.error(`Auto-analysis after ${reason} failed:`, err);
        setError(err instanceof Error ? err.message : `Failed to re-run analysis after ${reason}`);
      });
    }
    // Note: currentProject is used in the guard but excluded from deps because activeFile
    // (derived from currentProject) already captures project changes via activeFile.id
  }, [
    backendReady,
    debouncedSchemaSQL,
    hideCTEs,
    activeFile?.id,
    activeFile?.name,
    runAnalysis,
    setError,
  ]);

  // Compute resolved SQL from analysis result for the current file
  // Concatenates resolvedSql from all statements that came from the active file
  // Size limit prevents browser crashes with very large results
  const MAX_RESOLVED_SQL_SIZE = 10 * 1024 * 1024; // 10MB

  // Use path for matching since analysis uses paths as sourceName to avoid basename collisions.
  // For files without a path (e.g., scratchpad), fall back to name.
  const resolvedSql = useMemo(() => {
    const filePath = activeFile?.path || activeFile?.name;
    if (!result?.statements || !filePath) return null;

    const resolvedParts = result.statements
      .filter((stmt) => stmt.sourceName === filePath && stmt.resolvedSql)
      .map((stmt) => stmt.resolvedSql!);

    if (resolvedParts.length === 0) return null;

    const joined = resolvedParts.join('\n\n');
    if (joined.length > MAX_RESOLVED_SQL_SIZE) {
      return (
        joined.slice(0, MAX_RESOLVED_SQL_SIZE) + '\n\n-- [Truncated: resolved SQL exceeds 10MB]'
      );
    }
    return joined;
  }, [result, activeFile?.path, activeFile?.name]);

  // Determine if we should show the toggle (only in dbt/jinja mode)
  const showSqlViewToggle = currentProject?.templateMode !== 'raw';

  // Content to display in the editor based on view mode
  const displayContent = useMemo(() => {
    if (sqlViewMode === 'resolved' && resolvedSql) {
      return resolvedSql;
    }
    return activeFile?.content ?? '';
  }, [sqlViewMode, resolvedSql, activeFile?.content]);

  const clearErrors = useCallback(() => {
    setError(null);
    setDataLoadingError(null);
    setDataDescribingError(null);
    setRevealInLineageError(null);
  }, [setError, setDataLoadingError, setDataDescribingError]);

  const handleAnalyze = useCallback(() => {
    clearErrors();
    if (activeFile) {
      void runAnalysis(activeFile.content, activeFile.path);
    }
  }, [activeFile, runAnalysis, clearErrors]);

  const handleAnalyzeActiveOnly = useCallback(() => {
    clearErrors();
    if (activeFile && currentProject) {
      // Temporarily switch to 'current' mode for this run
      const originalMode = currentProject.runMode;
      setRunMode(currentProject.id, 'current');
      runAnalysis(activeFile.content, activeFile.path).finally(() => {
        // Restore original mode after analysis
        setRunMode(currentProject.id, originalMode);
      });
    }
  }, [activeFile, currentProject, runAnalysis, setRunMode, clearErrors]);

  function LoadingState({ tableFullName, isDark }: { tableFullName: string; isDark: boolean }) {
    return (
      <div className={isDark ? 'text-neutral-300' : 'text-neutral-600'}>
        <div className="text-sm font-medium flex gap-2 center">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching description of {tableFullName}
          ...
        </div>
      </div>
    );
  }

  function CopyDescribedColumns({columnNames}: {columnNames: string[]}): JSX.Element {
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
                columnNames.map(cn => `${alias ? `${alias}.` : ''}${cn}`)
                  .join(', '));
              setColumnsCopied(true);
              window.setTimeout(() => setColumnsCopied(false), 1200);
            } catch (error) {
              setColumnsCopied(false);
              console.error(`Clipboard copy failed`, error);
              toast.error(`Failed to Copy columns`, {
                description: 'Clipboard access is unavailable or blocked by the browser.',
              });
            }
          }}>
          {columnsCopied ? (
            <Check className="size-3.5" />
          ) : (
            <CopyPlus className="size-3.5" />
          )}
        </ToolbarButton>
      </>
    );
  }

  const openDescribeWindow = async (
    manager: Pick<WindowManagerApi, 'openWindow' | 'updateWindow' | 'closeWindow'>,
    project: Project,
    tableName: string,
    schema?: string,
    columnName?: string
  ) => {
    const tableFullName = `${schema ? schema + '.' : ''}${tableName}`;
    const windowId = `describeWindow-${tableFullName}`; // Date.now()
    manager.openWindow({
      id: windowId,
      title: `${project.database ? `${project.database}. ` : ''}Describe object ${tableFullName}`,
      content: <LoadingState isDark={isDark} tableFullName={tableFullName} />,
    });
    let columnSpan = undefined;
    const dataDescribePayloadResponse = await runDataDescribe(tableName, schema, columnName);
    if (dataDescribePayloadResponse?.script && columnName) {
      const start = dataDescribePayloadResponse.script.indexOf(`"${columnName}"`);
      if (start != -1) {
        columnSpan = {
          start,
          end: start + columnName.length + 2,
        };
      }
    }
    manager.updateWindow(windowId, {
      content: dataDescribePayloadResponse?.script ? (
        <div className="h-full w-full min-h-0">
          <SqlView
            className="h-full w-full"
            isDark={isDark}
            editable={true}
            lineWrapping={false}
            value={dataDescribePayloadResponse?.script}
            highlightedSpan={columnSpan}
            extraToolbarElements={dataDescribePayloadResponse?.columnNames && (
              <CopyDescribedColumns columnNames={dataDescribePayloadResponse?.columnNames} />
            )}
          />
        </div>
      ) : (
        <span>{'No description found'}</span>
      ),
    });
  };

  const handleRevealInLineage = useCallback(async () => {
    clearErrors();
    if (
      !currentProject ||
      !activeProjectId ||
      !activeFile ||
      !sqlViewRef.current ||
      !activeFile.content
    ) {
      return;
    }
    const selection = sqlViewRef.current.getSelection();
    if (!selection) {
      return;
    }
    const result = getResult(activeProjectId, hideCTEs);
    if (!result) {
      setRevealInLineageError(
        'No Lineage Data: need to parse SQL before reveal object in Lineage.'
      );
      return;
    }
    if (result.statements) {
      for (const statement of result.statements) {
        const activeSourceName = activeFile.path || activeFile.name;
        if (statement.sourceName === activeSourceName || statement.sourceName === activeFile.name) {
          let nodeWithBodySpan = null;
          for (const node of statement.nodes) {
            if (node.spans) {
              for (const span of node.spans) {
                if (span.start <= selection.head && selection.head <= span.end) {
                  if (node.type == 'column') {
                    for (const edge of statement.edges) {
                      if (edge.to == node.id && edge.type == 'ownership') {
                        onRevealInLineage(edge.from, node.id);
                        return;
                      }
                    }
                    setRevealInLineageError('Column not found');
                    return;
                  } else if (node.type == 'output') {
                    nodeWithBodySpan = node;
                  } else {
                    onRevealInLineage(node.id);
                    return;
                  }
                }
              }
            }
            if (
              !nodeWithBodySpan &&
              node.bodySpan &&
              node.bodySpan.start <= selection.head &&
              selection.head <= node.bodySpan.end
            ) {
              nodeWithBodySpan = node;
            }
          }
          if (nodeWithBodySpan) {
            onRevealInLineage(nodeWithBodySpan.id);
            return;
          }
        }
      }
    }
    setRevealInLineageError('Object not found');
  }, [currentProject, activeFile, activeProjectId, clearErrors, onRevealInLineage]);

  const handleRunDescribe = useCallback(async () => {
    clearErrors();
    if (
      !currentProject ||
      !activeProjectId ||
      !activeFile ||
      !sqlViewRef.current ||
      !activeFile.content
    ) {
      return;
    }
    const selection = sqlViewRef.current.getSelection();
    if (!selection) {
      return;
    }
    const result = getResult(activeProjectId, hideCTEs);
    if (!result) {
      setDataDescribingError('No Lineage Data: need to parse SQL before describe database object.');
      return;
    }
    if (result.resolvedSchema) {
      for (const table of result.resolvedSchema.tables) {
        if (table.spans) {
          for (const span of table.spans) {
            if (span.start <= selection.head && selection.head <= span.end) {
              void openDescribeWindow(windowManager, currentProject, table.name, table.schema); // await openDescribeWindow(windowManager, currentProject, 'IZ_TEST_1_ORDER', 'DWHKIT');
              return;
            }
          }
        }
        if (table.columns) {
          for (const column of table.columns) {
            if (column.spans) {
              for (const span of column.spans) {
                if (span.start <= selection.head && selection.head <= span.end) {
                  void openDescribeWindow(
                    windowManager,
                    currentProject,
                    table.name,
                    table.schema,
                    column.name
                  );
                  return;
                }
              }
            }
          }
        }
      }
    }
    setError('No database object found under cursor.');
  }, [
    currentProject,
    activeFile,
    activeProjectId,
    clearErrors,
    setDataDescribingError,
    runDataDescribe,
    dataDescriptionScript,
    windowManager,
  ]);

  const needParametersForSql = (
    activeFile: ProjectFile,
    editedParameters?: SqlParameters,
    sql?: string,
    sqlName?: string
  ): boolean => {
    if (!editedParameters && activeFile.parameters?.valid) {
      const sqlParameters = sql
        ? extractKnownSqlParamsInSqlOrder(sql, activeFile.parameters.parameters)
        : activeFile.parameters.parameters;
      if (sqlParameters) {
        const keys = Object.keys(sqlParameters);
        if (keys.length === 0) {
          return false;
        }
        setNeedParameters(true);
        setParameters(sqlParameters);
        runSqlName.current = sqlName ?? 'SQL';
        return true;
      }
    }
    return false;
  };

  const lastExecuteSql = useRef(true);

  const doExecuteSql = useCallback(
    (executeSql: boolean, editedParameters?: SqlParameters) => {
      clearErrors();
      if (!activeFile || !activeFile.content) {
        return;
      }
      lastExecuteSql.current = executeSql;
      const selection = sqlViewRef.current?.getSelection();
      if (selection && selection.from < selection.to) {
        lastExecuteSql.current = false;
        const sql = activeFile.content.substring(selection.from, selection.to + 1);
        if (!needParametersForSql(activeFile, editedParameters, sql, 'Selection')) {
          void runExecuteSql(sql, activeFile.path, editedParameters, SqlPartType.selection);
        }
        return;
      }
      if (executeSql) {
        if (!needParametersForSql(activeFile, editedParameters)) {
          void runExecuteSql(activeFile.content, activeFile.path, editedParameters);
        }
      } else {
        if (!activeProjectId || !selection) {
          return;
        }
        const result = getResult(activeProjectId, hideCTEs);
        if (!result) {
          setDataLoadingError('No Lineage Data: need to parse SQL before execution.');
          return;
        }
        for (const statement of result.statements) {
          if (activeFile.name === statement.sourceName) {
            for (const node of statement.nodes) {
              if (
                node.type == 'cte' &&
                node.label &&
                node.bodySpan &&
                node.bodySpan.start <= selection.head &&
                selection.head <= node.bodySpan.end
              ) {
                const sql =
                  activeFile.content.substring(0, node.bodySpan.end + 1) +
                  `\n)\nSELECT * FROM ${node.label}`;
                if (
                  !needParametersForSql(activeFile, editedParameters, sql, `CTE: ${node.label}`)
                ) {
                  void runExecuteSql(
                    sql,
                    activeFile.path,
                    editedParameters,
                    SqlPartType.cte,
                    node.label
                  );
                }
                return;
              }
            }
            break;
          }
        }
        setDataLoadingError('No CTE found under cursor.');
      }
    },
    [
      activeFile,
      activeProjectId,
      runExecuteSql,
      getResult,
      hideCTEs,
      setDataLoadingError,
      clearErrors,
    ]
  );

  const handleExecuteSql = useCallback(() => {
    doExecuteSql(true);
  }, [doExecuteSql]);

  const handleExecuteCte = useCallback(() => {
    doExecuteSql(false);
  }, [doExecuteSql]);

  const handleUseParameters = useCallback(
    (editedParameters: SqlParameters) => {
      if (activeFile) {
        if (lastExecuteSql.current) {
          updateFileParameters(activeFile.id, {
            valid: true,
            parameters: editedParameters,
          });
        }
        doExecuteSql(lastExecuteSql.current, editedParameters);
      }
    },
    [activeFile, doExecuteSql]
  );

  // Keyboard shortcuts for running analysis
  const analysisShortcuts = useMemo<GlobalShortcut[]>(
    () => [
      {
        key: 'Enter',
        cmdOrCtrl: true,
        alt: true,
        handler: handleAnalyze,
      },
      {
        key: 'Enter',
        cmdOrCtrl: true,
        alt: true,
        shift: true,
        handler: handleAnalyzeActiveOnly,
      },
      {
        key: 'Enter',
        cmdOrCtrl: true,
        handler: handleExecuteSql,
      },
      {
        key: 'Enter',
        cmdOrCtrl: true,
        shift: true,
        handler: handleExecuteCte,
      },
      {
        key: 'F4',
        allowInInput: true,
        handler: handleRunDescribe,
      },
      {
        key: 'q',
        cmdOrCtrl: true,
        allowInInput: true,
        handler: handleRevealInLineage,
      },
    ],
    [
      handleAnalyze,
      handleAnalyzeActiveOnly,
      handleExecuteSql,
      handleExecuteCte,
      handleRunDescribe,
      handleRevealInLineage,
    ]
  );

  useGlobalShortcuts(analysisShortcuts);

  if (!currentProject || !activeFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/5">
        <Loader2 className="h-6 w-6 animate-spin opacity-50" />
      </div>
    );
  }

  const allFileCount = currentProject.files.filter((f) => f.name.endsWith('.sql')).length;
  const selectedCount = currentProject.selectedFileIds?.length || 0;

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      <EditorToolbar
        runMode={currentProject.dialect == 'oracleBackend' ? 'current' : currentProject.runMode}
        dialect={currentProject.dialect}
        onRunModeChange={(mode: RunMode) => setRunMode(currentProject.id, mode)}
        isAnalyzing={isAnalyzing}
        isDataLoading={isDataLoading}
        backendReady={backendReady}
        onAnalyze={handleAnalyze}
        onExecuteSql={handleExecuteSql}
        onExecuteCte={handleExecuteCte}
        onRunDescribe={handleRunDescribe}
        onRevealInLineage={handleRevealInLineage}
        allFileCount={allFileCount}
        selectedCount={selectedCount}
        fileSelectorOpen={fileSelectorOpen}
        onFileSelectorOpenChange={onFileSelectorOpenChange}
        sqlViewMode={sqlViewMode}
        onSqlViewModeChange={setSqlViewMode}
        showSqlViewToggle={showSqlViewToggle}
        hasResolvedSql={!!resolvedSql}
      />

      <div
        ref={editorContainerRef}
        className="flex-1 overflow-hidden relative"
        data-testid="sql-editor"
      >
        <ErrorBoundary fallback={<SqlViewFallback />}>
          <SqlView
            ref={sqlViewRef}
            dialect={currentProject.dialect}
            value={displayContent}
            onChange={(val) => {
              setParameters();
              updateFile(activeFile.id, val);
            }}
            className="h-full text-sm"
            editable={sqlViewMode === 'template' && !isReadOnly}
            isDark={isDark}
            highlightedSpan={sqlViewMode === 'template' ? highlightedSpan : null}
          />
        </ErrorBoundary>
        {isReadOnly && (
          <div className="absolute top-2 right-5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-muted/80 text-muted-foreground rounded border">
            Read Only
          </div>
        )}
      </div>

      {currentProject && parameters && (
        <SqlParametersEditor
          open={needParameters}
          onOpenChange={(open: boolean, ok?: boolean) => {
            setNeedParameters(open);
            if (!ok) {
              setDataLoading(SqlPartType.none);
            }
          }}
          onRunSql={handleUseParameters}
          runSqlName={runSqlName.current}
          inputParameters={
            activeFile?.parameters?.parameters
              ? Object.fromEntries(
                  Object.entries(parameters).map(([key, value]) => [
                    key,
                    activeFile.parameters?.parameters[key] ?? value,
                  ])
                )
              : parameters
          }
        />
      )}
    </div>
  );
}
