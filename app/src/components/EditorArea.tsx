import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { openSchemaExplorer, SqlViewSelection, WindowManagerApi } from '@pondpilot/flowscope-react';
import {
  SqlView,
  useLineageState,
  useFloatingWindows,
  openDescribeWindow,
  buildExecutableSqlForCte,
  findCteAtPosition,
  openFloatingSQLPreview,
  acquireBodyWaitCursor
} from '@pondpilot/flowscope-react';
import { useThemeStore, resolveTheme } from '@/lib/theme-store';
import { cn, extractKnownSqlParamsInSqlOrder } from '@/lib/utils';
import { backendParsed, Dialect, ProjectFile, RunMode, SqlParameters } from '@/lib/project-store';
import { useProject } from '@/lib/project-store';
import { useBackend } from '@/lib/backend-context';
import type { GlobalShortcut } from '@/hooks';
import { useAnalysis, useDebounce, useFileNavigation, useGlobalShortcuts } from '@/hooks';
import type { SqlViewMode } from './EditorToolbar';
import { EditorToolbar } from './EditorToolbar';
import { ErrorBoundary } from './ErrorBoundary';
import { FileControlsToolbar, type FileControlsToolbarRef, } from './FileControlsToolbar';
import { DEFAULT_FILE_NAMES } from '@/lib/constants';
import { useSharedDataLoad } from '@/components/DataLoadContext.tsx';
import { useAnalysisStore } from '@/lib/analysis-store.ts';
import { SqlParametersEditor } from '@/components/SqlParametersEditor.tsx';
import { CredentialsPayload, ObjectTypes, SqlPartType, TablesPayload } from '@/lib/backend-adapter.ts';
import { AnalysisRunResult } from '@/hooks/useAnalysis.ts';
import { devLineageLoadSchemes, devLineageLoadTables } from '@/lib/utils_backend.tsx';

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

type AnalysisSnapshot = {
  projectId: string | null;
  filesBySourceName: Record<string, string>;
  schemaSQL: string;
  dialect?: Dialect;
  hideCTEs: boolean;
  templateMode: string;
  runMode: RunMode;
};

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
  const [sqlExecutionError, setSqlExecutionError] = useState<string | null>(null);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot | null>(null);

  const createAnalysisSnapshot = useCallback(
    (run: AnalysisRunResult): AnalysisSnapshot => ({
      projectId: activeProjectId,
      filesBySourceName: Object.fromEntries(
        run.files.map((file) => [file.name, file.content])
      ),
      schemaSQL: run.schemaSQL,
      dialect: run.dialect,
      hideCTEs: run.hideCTEs,
      templateMode: run.templateMode,
      runMode: run.runMode,
    }),
    [activeProjectId]
  );


  // Reset view mode to 'template' when active file changes
  useEffect(() => {
    setSqlViewMode('template');
  }, [currentProject?.activeFileId]);

  // Use backend adapter for analysis when available
  const { adapter } = useBackend();
  const { isAnalyzing, error, runAnalysis, setError } = useAnalysis(backendReady, { adapter });
  const {
    dataLoadingState,
    setDataLoadingState,
    runExecuteSql,
    parameters,
    setParameters,
    needParameters,
    setNeedParameters,
  } = useSharedDataLoad();

  const { getResult } = useAnalysisStore();

  const sqlViewRef = useRef<{
    getSelection: () => SqlViewSelection | undefined;
    focus: () => void;
  }>(null);

  const focusSqlView = useCallback(() => {
    requestAnimationFrame(() => {
      sqlViewRef.current?.focus();
    });
  }, []);

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
    if (sqlExecutionError) {
      toast.error('SQL Execution Error', {
        description: sqlExecutionError,
        duration: 5000,
      });
      setSqlExecutionError(null);
    }
  }, [sqlExecutionError, setSqlExecutionError]);

  // Show error toast when error occurs
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
      runAnalysis(activeFile.content, activeFile.path)
        .then((run)=>{
          if (run) {
            setAnalysisSnapshot(createAnalysisSnapshot(run));
          }
        })
        .catch((err) => {
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
    createAnalysisSnapshot,
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


  const currentSourceName = activeFile ? activeFile.path || activeFile.name : null;

  const analyzedActiveFileText =
    analysisSnapshot && currentSourceName
      ? analysisSnapshot.filesBySourceName[currentSourceName]
      : undefined;

  const analyzedFilesChanged =
    !!analysisSnapshot &&
    !!currentProject &&
    currentProject.files.some((file) => {
      const sourceName = file.path || file.name;
      const analyzedText = analysisSnapshot.filesBySourceName[sourceName];

      // The file was not included in the previous analysis run.
      // On its own, it does not invalidate the result until it becomes the active file.
      if (analyzedText === undefined) {
        return false;
      }

      return analyzedText !== file.content;
    });

  const analyzedFileDeleted =
    !!analysisSnapshot &&
    !!currentProject &&
    Object.keys(analysisSnapshot.filesBySourceName).some(
      (sourceName) =>
        !currentProject.files.some((file) => (file.path || file.name) === sourceName)
    );

  const activeFileWasNotAnalyzed =
    !!analysisSnapshot &&
    !!activeFile &&
    analyzedActiveFileText === undefined;

  const isGraphOutOfSync =
    !!analysisSnapshot &&
    !!result &&
    !!currentProject &&
    !!activeFile &&
    sqlViewMode === 'template' &&
    (
      analysisSnapshot.projectId !== activeProjectId ||
      analysisSnapshot.schemaSQL !== (currentProject.schemaSQL ?? '') ||
      analysisSnapshot.dialect !== currentProject.dialect ||
      analysisSnapshot.hideCTEs !== hideCTEs ||
      analysisSnapshot.templateMode !== currentProject.templateMode ||
      analyzedFilesChanged ||
      analyzedFileDeleted ||
      activeFileWasNotAnalyzed
    );

  const clearErrors = useCallback(() => {
    setError(null);
    setSqlExecutionError(null);
    setRevealInLineageError(null);
  }, [setError, setRevealInLineageError, setSqlExecutionError]);

  const handleAnalyze = useCallback(() => {
    clearErrors();
    if (!activeFile) {
      return;
    }
    void runAnalysis(activeFile.content, activeFile.path).then((run) => {
      if(run) {
        setAnalysisSnapshot(createAnalysisSnapshot(run));
      }
    });
  }, [activeFile, runAnalysis, clearErrors, createAnalysisSnapshot]);

  const handleAnalyzeActiveOnly = useCallback(() => {
    clearErrors();
    if (!activeFile) {
      return;
    }
    runAnalysis(activeFile.content, activeFile.path, {runModeOverride: 'current'})
      .then((run)=>{
        if(run) {
          setAnalysisSnapshot(createAnalysisSnapshot(run));
        }
      });
  }, [activeFile, runAnalysis, clearErrors, createAnalysisSnapshot]);

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
    if (isGraphOutOfSync) {
      setRevealInLineageError('Graph is stale. Re-run analysis before using navigation.');
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
    const buffer: {
      start: number;
      end: number;
      focusNodeId: string;
      selectedNodeId?: string;
    }[] = [];
    if (result.statements) {
      for (const statement of result.statements) {
        const activeSourceName = activeFile.path || activeFile.name;
        if (statement.sourceName === activeSourceName || statement.sourceName === activeFile.name) {
          for (const node of statement.nodes) {
            if (node.spans) {
              for (const span of node.spans) {
                if (span.start <= selection.head && selection.head <= span.end) {
                  if (node.type == 'column') {
                    for (const edge of statement.edges) {
                      if (edge.to == node.id && edge.type == 'ownership') {
                        buffer.push({
                          start: span.start,
                          end: span.end,
                          focusNodeId: edge.from,
                          selectedNodeId: node.id,
                        });
                      }
                    }
                  } else {
                    buffer.push({
                      start: span.start,
                      end: span.end,
                      focusNodeId: node.id,
                    });
                  }
                }
              }
            }
            if (
              node.bodySpan &&
              node.bodySpan.start <= selection.head &&
              selection.head <= node.bodySpan.end
            ) {
              buffer.push({
                start: node.bodySpan.start,
                end: node.bodySpan.end,
                focusNodeId: node.id,
              });
            }
          }
          if( buffer.length > 0 ) {
            const sorted = buffer.map(b=>({
              ...b,
              diff: b.end - b.start,
            })).sort((a, b) => a.diff - b.diff);
            const target = sorted[0];
            if (target.selectedNodeId) {
              acquireBodyWaitCursor(2000);
            }
            onRevealInLineage(target.focusNodeId, target.selectedNodeId);
            return;
          }
        }
      }
    }
    setRevealInLineageError('Object not found');
  }, [currentProject, activeFile, activeProjectId, clearErrors, onRevealInLineage, isGraphOutOfSync, getResult, hideCTEs,]);

  const handleOpenSchemaExplorer = useCallback(async () => {
    clearErrors();
    if (
      !currentProject ||
      !backendParsed(currentProject.dialect)
    ) {
      return;
    }
    console.log("OpenSchemaExplorer");
    // const credentialsPayload: CredentialsPayload = {
    //   database: currentProject.database,
    //   userName: currentProject.userName,
    // };
    // const schemesPayloadResponse = await devLineageLoadSchemes(credentialsPayload);
    // console.log(schemesPayloadResponse.schemes);
    // const tablesPayload: TablesPayload = {
    //   database: currentProject.database,
    //   userName: currentProject.userName,
    //   //pattern: '*IDAF*',
    //   //regExp: false,
    //   pattern: '^IDAF_DS.*$',
    //   regExp: true,
    //   objectTypes: ['TABLE', 'VIEW'],
    // };
    // const tablesPayloadResponse = await devLineageLoadTables(tablesPayload);
    // console.log(tablesPayloadResponse.csv);
    void openSchemaExplorer(
      windowManager, isDark, currentProject.database, currentProject.userName);
  }, [currentProject]);

  const handleRunAction = useCallback((action: 'RunDescribe' | 'RunSqlPreview') => {
    clearErrors();
    if (
      !currentProject ||
      !backendParsed(currentProject.dialect) ||
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
    const openActionWindow = (
      windowManager: Pick<WindowManagerApi, 'openWindow'>,
      isDark: boolean,
      dialect: Dialect,
      tableName: string,
      database?: string,
      schema?: string,
      columns?: Array<{
        name: string;
      }>,
      columnName?: string,
    ) => {
      if( action == 'RunDescribe' ) {
        void openDescribeWindow(
          windowManager, isDark, tableName, database, schema, columnName);
      } else if( action == 'RunSqlPreview' ) {
        openFloatingSQLPreview({
          windowManager,
          dialect,
          table: {
            catalog: database,
            schema,
            tableName,
            columns
          }
        });
      }
    } // const actionMessage = action == 'RunDescribe' ? 'describing objects' : 'preview sql'; if (isGraphOutOfSync) { setError(`Graph is stale. Re-run analysis before ${actionMessage}.`); return; }
    const result = getResult(activeProjectId, hideCTEs); // if (!result) { setError(`No Lineage Data: need to parse SQL before ${actionMessage}.`); return; }
    if (result?.resolvedSchema) {
      for (const table of result.resolvedSchema.tables) {
        if (table.spans) {
          for (const span of table.spans) {
            if (span.start <= selection.head && selection.head <= span.end) {
              void openActionWindow(windowManager, isDark,
                currentProject.dialect, table.name, currentProject.database, table.schema,
                action == 'RunSqlPreview' ? table.columns : undefined
              );
              return;
            }
          }
        }
        if (table.columns) {
          for (const column of table.columns) {
            if (column.spans) {
              for (const span of column.spans) {
                if (span.start <= selection.head && selection.head <= span.end) {
                  void openActionWindow(windowManager, isDark,
                    currentProject.dialect, table.name, currentProject.database, table.schema,
                    action == 'RunSqlPreview' ? table.columns : undefined,
                    column.name);
                  return;
                }
              }
            }
          }
        }
      }
    }
    const buffer: string[] = [];
    for (let i = selection.head; i >= 0 ; i--) {
      const ch = displayContent[i];
      if( /[A-Za-z0-9_.]/.test(ch) ) {
        buffer.unshift(ch);
      } else {
        break;
      }
    }
    for (let i = selection.head + 1; i < displayContent.length ; i++) {
      const ch = displayContent[i];
      if( /[A-Za-z0-9_.]/.test(ch) ) {
        buffer.push(ch);
      } else {
        break;
      }
    }
    if( buffer.length == 0 ) {
      setError('No database object found under cursor.');
    }
    const text = buffer.join('');
    const parts = text.split('.');
    void openActionWindow(windowManager, isDark, currentProject.dialect,
      parts.length == 1 ? parts[0] : parts[1],
      currentProject.database,
      parts.length == 1 ? undefined : parts[0], undefined);

  }, [
    currentProject,
    activeFile,
    activeProjectId,
    clearErrors,
    windowManager,
    isDark,
    isGraphOutOfSync,
    getResult,
    hideCTEs,
    setError,
  ]);

  const needParametersForSql = (
    activeFile: ProjectFile,
    editedParameters?: SqlParameters,
    sql?: string,
    sqlName?: string
  ): boolean => {
    if (editedParameters) {
      return false;
    }

    const sqlParameters = extractKnownSqlParamsInSqlOrder(
      sql ?? activeFile.content,
      activeFile.parameters?.parameters,
      currentProject?.dialect
    );

    const keys = Object.keys(sqlParameters);
    if (keys.length === 0) {
      return false;
    }

    setNeedParameters(true);
    setParameters(sqlParameters);
    runSqlName.current = sqlName ?? 'SQL';
    return true;
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
        if (!selection) {
          return;
        }

        const cte = findCteAtPosition(activeFile.content, selection.head);
        if (!cte) {
          setSqlExecutionError('No CTE found under cursor.');
          return;
        }

        const sql = buildExecutableSqlForCte(activeFile.content, cte);
        if (!needParametersForSql(activeFile, editedParameters, sql, `CTE: ${cte.name}`)) {
          void runExecuteSql(
            sql,
            activeFile.path,
            editedParameters,
            SqlPartType.cte,
            cte.name
          );
        }
      }
    },
    [
      activeFile,
      currentProject?.dialect,
      runExecuteSql,
      setSqlExecutionError,
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
    [activeFile, doExecuteSql, updateFileParameters]
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
        shift: true,
        handler: handleExecuteCte,
      },
      {
        key: 'F4',
        allowInInput: true,
        handler: () => handleRunAction('RunDescribe'),
      },
      {
        key: 'q',
        shift: true,
        cmdOrCtrl: true,
        allowInInput: true,
        handler: () => handleRunAction('RunSqlPreview'),
      },
      {
        key: 'q',
        cmdOrCtrl: true,
        allowInInput: true,
        handler: handleRevealInLineage,
      },
      {
        key: 'r',
        cmdOrCtrl: true,
        alt: true,
        allowInInput: true,
        handler: handleOpenSchemaExplorer,
      },
    ],
    [
      handleAnalyze,
      handleAnalyzeActiveOnly,
      handleExecuteCte,
      handleRevealInLineage,
    ]
  );

  useGlobalShortcuts(analysisShortcuts);

  const fileControlsToolbarRef = useRef<FileControlsToolbarRef>(null);
  const fileControlsToolbar = !isReadOnly ? (
    <FileControlsToolbar ref={fileControlsToolbarRef} />
  ) : undefined;

  const sqlViewShortcuts = useMemo(
    () => [
      {
        key: 'Mod-Enter',
        action: handleExecuteSql,
      },
      ...(fileControlsToolbar
        ? [
          {
            key: 'Mod-s',
            action: () => fileControlsToolbarRef.current?.save(),
          },
        ]
        : []),
    ],
    [handleExecuteSql, fileControlsToolbar]
  );


  if (!currentProject || !activeFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/5">
        <Loader2 className="h-6 w-6 animate-spin opacity-50" />
      </div>
    );
  }

  const allFileCount = currentProject.files.filter((f) => f.name.endsWith('.sql')).length;
  const selectedCount = currentProject.selectedFileIds?.length || 0;

  const graphSyncWarning = isGraphOutOfSync ? (
    <div
      className="ml-1 flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
      title="SQL files changed after the last successful analysis. Re-run analysis to enable text ↔ graph navigation."
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
      <span>Graph out of sync — re-run analysis</span>
    </div>
  ) : undefined;

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      <EditorToolbar
        runMode={backendParsed(currentProject.dialect) ? 'current' : currentProject.runMode}
        dialect={currentProject.dialect}
        onRunModeChange={(mode: RunMode) => setRunMode(currentProject.id, mode)}
        isAnalyzing={isAnalyzing}
        dataLoadingState={dataLoadingState}
        backendReady={backendReady}
        onAnalyze={handleAnalyze}
        onExecuteSql={handleExecuteSql}
        onExecuteCte={handleExecuteCte}
        onRunDescribe={() => handleRunAction('RunDescribe')}
        onRunSqlPreview={() => handleRunAction('RunSqlPreview')}
        onRevealInLineage={handleRevealInLineage}
        onOpenSchemaExplorer={handleOpenSchemaExplorer}
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
            shortcuts={sqlViewShortcuts}
            preToolbarElements={fileControlsToolbar}
            extraToolbarElements={graphSyncWarning}
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
          isDark={isDark}
          onOpenChange={(open: boolean, ok?: boolean) => {
            setNeedParameters(open);
            if (!open) {
              focusSqlView();
            }
            if (!ok) {
              setDataLoadingState(SqlPartType.none);
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
