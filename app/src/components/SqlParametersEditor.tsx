import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { SqlParameters } from '@/lib/backend-adapter.ts';

interface SqlParametersEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputParameters: SqlParameters;
  onRunSql: (editedParameters: SqlParameters) => void;
}

export function SqlParametersEditor({
  open,
  onOpenChange,
  inputParameters,
  onRunSql,
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
    onOpenChange(false);
  }, [editedParameters, onRunSql, onOpenChange]);

  const handleClose = useCallback(() => {
    setEditedParameters(inputParameters);
    onOpenChange(false);
  }, [inputParameters, onOpenChange]);

  const entries = Object.entries(editedParameters);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Variables</DialogTitle>
          <DialogDescription>Fill variables to run SQL</DialogDescription>
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
            Cancel
          </Button>
          <Button onClick={handleSave}>Run SQL</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
