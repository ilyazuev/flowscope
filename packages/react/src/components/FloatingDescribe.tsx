import { useState, useRef, useEffect } from 'react';
import { Check, CopyPlus, Loader2 } from 'lucide-react';
import { type WindowManagerApi } from './floating-window';
import { SqlView } from './SqlView';
import { Input } from '@pondpilot/flowscope-app/src/components/ui/input';
import { ToolbarButton } from './ToolbarButton';
import { toast } from 'sonner';
import {
  DataDescribePayload,
  DataDescribePayloadResponse,
} from '@pondpilot/flowscope-app/src/lib/backend-adapter';
import { useProject } from '@pondpilot/flowscope-app/src/lib/project-store';
import { devLineageDataDescribe } from '@pondpilot/flowscope-app/src/lib/utils_backend';

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

function FloatingDescribe({
  isDark,
  tableName,
  schema,
  columnName,
}: {
  isDark: boolean;
  tableName: string;
  schema?: string;
  columnName?: string;
}) {
  const { currentProject } = useProject();
  const [result, setResult] = useState<DataDescribePayloadResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const tableFullName = `${schema ? `${schema}.` : ''}${tableName}`;

  useEffect(() => {
    let cancelled = false;

    async function loadDescription() {
      if (!currentProject) {
        throw new Error('Project not found.');
      }

      setIsLoading(true);
      setError(null);
      setResult(null);
      const requestId = ++requestIdRef.current;

      try {
        const dataDescribePayload: DataDescribePayload = {
          schema,
          tableName,
          columnName,
          database: currentProject.database,
          userName: currentProject.userName,
        };
        const response = await devLineageDataDescribe(dataDescribePayload);
        if (cancelled || requestIdRef.current !== requestId) {
          return;
        }

        setResult(response);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Failed to describe object');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDescription();

    return () => {
      cancelled = true;
    };
  }, [tableName, schema, columnName]);

  if (isLoading) {
    return <LoadingState isDark={isDark} tableFullName={tableFullName} />;
  }

  if (error) {
    return <span>{error}</span>;
  }

  if (!result?.script) {
    return <span>No description found</span>;
  }

  let columnSpan: { start: number; end: number } | undefined;

  if (columnName) {
    const start = result.script.indexOf(`"${columnName}"`);

    if (start !== -1) {
      columnSpan = {
        start,
        end: start + columnName.length + 2,
      };
    }
  }

  return (
    <div className="h-full w-full min-h-0">
      <SqlView
        className="h-full w-full"
        isDark={isDark}
        editable={true}
        lineWrapping={false}
        value={result.script}
        highlightedSpan={columnSpan}
        extraToolbarElements={
          result.columnNames ? <CopyDescribedColumns columnNames={result.columnNames} /> : undefined
        }
      />
    </div>
  );
}

export const openDescribeWindow = (
  manager: Pick<WindowManagerApi, 'openWindow'>,
  isDark: boolean,
  tableName: string,
  database?: string,
  schema?: string,
  columnName?: string
) => {
  const tableFullName = `${schema ? `${schema}.` : ''}${tableName}`;
  manager.openWindow({
    id: `describeWindow-${database ?? ''}-${tableFullName}${columnName ? `.${columnName}` : ''}`,
    title: `${database ? `${database}. ` : ''}Describe object ${tableFullName}`,
    content: (
      <FloatingDescribe
        isDark={isDark}
        tableName={tableName}
        schema={schema}
        columnName={columnName}
      />
    ),
  });
};
