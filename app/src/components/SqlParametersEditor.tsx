import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { SqlParameters } from '@/lib/project-store.tsx';
import { GlobalShortcut, useGlobalShortcuts } from '@/hooks';

interface SqlParametersEditorProps {
  open: boolean;
  onOpenChange: (open: boolean, ok?: boolean) => void;
  inputParameters: SqlParameters;
  onRunSql: (editedParameters: SqlParameters) => void;
  runSqlName?: string | null;
}

export function SqlParametersEditor({
  open,
  onOpenChange,
  inputParameters,
  onRunSql,
  runSqlName,
}: SqlParametersEditorProps) {
  const [editedParameters, setEditedParameters] = useState<SqlParameters>(inputParameters);

  useEffect(() => {
    if (open) {
      setEditedParameters(inputParameters);
    }
  }, [open, inputParameters]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setEditedParameters(inputParameters);
      }
      onOpenChange(newOpen);
    },
    [inputParameters, onOpenChange]
  );

  const handleParameterChange = useCallback((key: string, value: string) => {
    setEditedParameters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const handleSave = useCallback(() => {
    onRunSql(editedParameters);
    onOpenChange(false, true);
  }, [editedParameters, onRunSql, onOpenChange]);

  const handleClose = useCallback(() => {
    setEditedParameters(inputParameters);
    onOpenChange(false);
  }, [inputParameters, onOpenChange]);

  const entries = Object.entries(editedParameters);

  const shortcuts = useMemo<GlobalShortcut[]>(
    () =>
      open
        ? [
          {
            key: 'Enter',
            handler: handleSave,
            allowInInput: true,
          },
        ]
        : [],
    [open, handleSave]
  );

  useGlobalShortcuts(shortcuts);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col z-10000000">
        <DialogHeader>
          <DialogTitle>Variables</DialogTitle>
          <DialogDescription>
            <span>Fill variables to run </span>
            <span className={'font-bold'}>{runSqlName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 border rounded-md overflow-auto p-4">
          <div className="space-y-4">
            {entries.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">No SQL parameters</div>
            ) : (
              entries.map(([key, value]) => (
                <div key={key} className="space-y-1.5">
                  <label
                    htmlFor={`sql-param-${key}`}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    {key}
                  </label>
                  <input
                    id={`sql-param-${key}`}
                    type="text"
                    value={value ?? ''}
                    onChange={(e) => handleParameterChange(key, e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    placeholder={`Enter value for ${key}`}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            <span>Cancel</span>
            <kbd className="ml-4 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">Esc</span>
            </kbd>
          </Button>
          <Button onClick={handleSave}>
            <span>Run SQL</span>
            <kbd className="ml-4 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ↵
            </kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
