import { useEffect, useMemo, useRef, useState, type JSX, useCallback, RefObject } from 'react';
import type { GlobalNode } from '@pondpilot/flowscope-core';
import { ChevronDown, Focus, Scan } from 'lucide-react';

import { PANEL_STYLES } from '../constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@pondpilot/flowscope-app/src/components/ui/dropdown-menu';
import { Checkbox } from '@pondpilot/flowscope-app/src/components/ui/checkbox';
import { cn } from '@pondpilot/flowscope-app/src/lib/utils';
import { GraphViewFocusNodeProps } from '../types';
import {
  GraphTooltip,
  GraphTooltipArrow,
  GraphTooltipContent,
  GraphTooltipPortal,
  GraphTooltipProvider,
  GraphTooltipTrigger,
} from './ui/graph-tooltip';

export function GraphViewFocusNode({
  analysisResult,
  focusNodeId,
  selectedNodeId,
  onSelectNode,
  closeRequestKey,
  showColumnEdges,
  focusSelectMode = 'none',
  onFocusSelectModeChange,
}: GraphViewFocusNodeProps): JSX.Element {
  const [openFocusNodes, setOpenFocusNodes] = useState(false);
  const [openSelectNodes, setOpenSelectNodes] = useState(false);
  const [openHistoryNodes, setOpenHistoryNodes] = useState(false);
  const [historyNodes, setHistoryNodes] = useState<GlobalNode[]>([]);
  const [onlyTables, setOnlyTables] = useState(false);
  const focusNodeNamesListRef = useRef<HTMLDivElement>(null);
  const columnsListRef = useRef<HTMLDivElement>(null);
  const cache = useRef<
    Record<
      string,
      {
        cachedParent?: GlobalNode;
        cachedChildren?: GlobalNode[];
      }
    >
  >({});

  const addHistory = useCallback((node?: GlobalNode) => {
    if (!node) {
      return;
    }
    const index = historyNodes.indexOf(node, 0);
    if (index == 0) {
      return;
    } else if (index > -1) {
      historyNodes.splice(index, 1);
    } else if (historyNodes.length > 10) {
      historyNodes.pop();
    }
    if (historyNodes[0] == cache.current[node.id]?.cachedParent) {
      historyNodes.shift();
    }
    historyNodes.unshift(node);
    setHistoryNodes(historyNodes);
  }, []);

  if (selectedNodeId == focusNodeId) {
    selectedNodeId = undefined;
  }

  const internalFocusNodeId = useMemo((): string | undefined => {
    if (selectedNodeId) {
      const edge = analysisResult.globalLineage?.edges.find(
        (edge) => edge.to === selectedNodeId && edge.type == 'ownership'
      );
      return edge?.from;
    } else if (focusNodeId) {
      return focusNodeId;
    }
    return undefined;
  }, [analysisResult, focusNodeId, selectedNodeId]);

  const focusedNode = useMemo((): GlobalNode | undefined => {
    if (internalFocusNodeId) {
      const node = analysisResult.globalLineage?.nodes.find(
        (node) => node.id === internalFocusNodeId
      );
      addHistory(node);
      return node;
    }
    return undefined;
  }, [analysisResult, internalFocusNodeId]);

  const selectableNodes = useMemo(() => {
    return analysisResult.globalLineage.nodes
      .filter((node) => (onlyTables ? node.type === 'table' : node.type !== 'column'))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [analysisResult, onlyTables]);

  const selectableColumns = useMemo(() => {
    if (!focusedNode) {
      return [];
    }
    let cacheNode = cache.current[focusedNode.id];
    if (!cacheNode) {
      cacheNode = cache.current[focusedNode.id] = {};
    }
    if (!cacheNode.cachedChildren) {
      const ownershipEdgeIds = analysisResult.globalLineage.edges
        .filter((e) => e.from == focusedNode.id && e.type == 'ownership')
        .map((e) => e.to);
      cacheNode.cachedChildren = analysisResult.globalLineage.nodes
        .filter((node) => ownershipEdgeIds.includes(node.id))
        .sort((a, b) => a.label.localeCompare(b.label));
      cacheNode.cachedChildren.forEach((node) => {
        let cacheChildNode = cache.current[node.id];
        if (!cacheChildNode) {
          cacheChildNode = cache.current[node.id] = {};
        }
        cacheChildNode.cachedParent = focusedNode;
      });
    }
    return cacheNode.cachedChildren;
  }, [analysisResult, internalFocusNodeId]);

  const selectedNode = useMemo((): GlobalNode | undefined => {
    if (!selectedNodeId || !selectableColumns) {
      return undefined;
    }
    const node = selectableColumns.find((node) => node.id == selectedNodeId);
    addHistory(node);
    return node;
  }, [analysisResult, internalFocusNodeId, selectedNodeId]);

  useEffect(() => {
    setOpenFocusNodes(false);
    setOpenSelectNodes(false);
    setOpenHistoryNodes(false);
  }, [closeRequestKey]);

  const scrollIntoView = useCallback(
    (refList: RefObject<HTMLDivElement | null>, nodeId: string) => {
      return window.setTimeout(() => {
        const selectedNodeElement = refList.current?.querySelector<HTMLElement>(
          `[data-node-id="${CSS.escape(nodeId)}"]`
        );
        selectedNodeElement?.scrollIntoView({
          block: 'center',
        });
      }, 0);
    },
    []
  );

  useEffect(() => {
    if (!openFocusNodes || !internalFocusNodeId) {
      return;
    }
    const timer = scrollIntoView(focusNodeNamesListRef, internalFocusNodeId);
    return () => window.clearTimeout(timer);
  }, [openFocusNodes, internalFocusNodeId]);

  useEffect(() => {
    if (!openSelectNodes || !selectedNodeId) {
      return;
    }
    const timer = scrollIntoView(columnsListRef, selectedNodeId);
    return () => window.clearTimeout(timer);
  }, [openSelectNodes, selectedNodeId]);

  const getCanonicalName = useCallback((node: GlobalNode | undefined) => {
    return node
      ? `${node.canonicalName.schema ? `${node.canonicalName.schema}.` : ''}${node.canonicalName.name} (${node.type})`
      : null;
  }, []);

  function ToolbarDivider(): JSX.Element {
    return <div className="self-center mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />;
  }

  return (
    <>
      <ToolbarDivider />
      <div className={`${PANEL_STYLES.container} px-1.5 transition-all duration-200`}>
        <DropdownMenu open={openFocusNodes} onOpenChange={setOpenFocusNodes}>
          <DropdownMenuTrigger
            asChild
            className="max-w-[34 0px]"
            disabled={focusSelectMode != 'none'}
          >
            <button
              className={cn(
                'flex items-center gap-2 h-7 px-3 rounded-full transition-all duration-200 text-sm font-medium',
                (focusSelectMode != 'none'
                  ? 'text-gray-400'
                  : 'text-orange-600 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-100'
                )
              )}
            >
              <span className="truncate">
                {getCanonicalName(focusedNode) ?? 'Focus on Table or CTE'}
              </span>
              <ChevronDown className="size-4 opacity-50 shrink-0" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="max-w-[450px] p-0 flex flex-col gap-1" align="start">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Set focus on Table or CTE
              </span>
            </div>

            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <Checkbox
                id="focusNodeOnlyTables"
                checked={onlyTables}
                onCheckedChange={(checked) => setOnlyTables(checked === true)}
                className="shrink-0 border-muted-foreground"
              />
              <label htmlFor="focusNodeOnlyTables">only tables</label>
            </div>

            <div
              className="max-h-[200px] overflow-y-auto outline-hidden flex-1"
              ref={focusNodeNamesListRef}
            >
              {selectableNodes.map((node) => (
                <div
                  className={cn(
                    'flex items-center gap-2 py-1 px-2 rounded-md cursor-pointer hover:bg-muted/50 group'
                  )}
                  key={node.id}
                  data-node-id={node.id}
                  onClick={() => {
                    setOpenFocusNodes(false);
                    onSelectNode(node.id, true, node.id == internalFocusNodeId, selectedNodeId);
                  }}
                >
                  <span
                    className={cn(
                      'flex-1 truncate text-sm',
                      node.id === internalFocusNodeId && 'font-bold'
                    )}
                  >
                    {getCanonicalName(node)}
                  </span>
                </div>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showColumnEdges && (
        <div className={`${PANEL_STYLES.container} px-1.5 transition-all duration-200`}>
          <DropdownMenu open={openSelectNodes} onOpenChange={setOpenSelectNodes}>
            <DropdownMenuTrigger
              asChild
              className="max-w-[300px]"
              disabled={focusSelectMode != 'none'}
            >
              <button
                className={cn(
                  'flex items-center gap-2 h-7 px-3 rounded-full transition-all duration-200 text-sm font-medium',
                  (focusSelectMode != 'none'
                    ? 'text-gray-400'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  )
                )}
              >
                <span className="truncate">
                  {selectedNode ? selectedNode.label : 'Select Column'}
                </span>
                <ChevronDown className="size-4 opacity-50 shrink-0" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="max-w-[200px] p-0 flex flex-col gap-1" align="start">
              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Select Column
                </span>
              </div>

              <div
                className="max-h-[200px] overflow-y-auto outline-hidden flex-1"
                ref={columnsListRef}
              >
                {selectableColumns && selectableColumns.length ? (
                  selectableColumns.map((node) => (
                    <div
                      className={cn(
                        'flex items-center gap-2 py-1 px-2 rounded-md cursor-pointer hover:bg-muted/50 group'
                      )}
                      key={node.id}
                      data-node-id={node.id}
                      onClick={() => {
                        setOpenSelectNodes(false);
                        onSelectNode(node.id, false, false);
                      }}
                    >
                      <span
                        className={cn(
                          'flex-1 truncate text-sm',
                          node.id === selectedNodeId && 'font-bold'
                        )}
                      >
                        {node.label}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      No Columns
                    </span>
                  </div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <GraphTooltipProvider>
        <GraphTooltip delayDuration={300}>
          <GraphTooltipTrigger asChild>
            <button
              onClick={() =>
                internalFocusNodeId
                  ? onSelectNode(internalFocusNodeId, true, true, selectedNodeId)
                  : undefined
              }
              className={cn(
                'self-center flex size-6 items-center justify-center rounded-full transition-colors duration-200',
                internalFocusNodeId
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                  : 'text-slate-400' //  hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700
              )}
              aria-label={'Focus on Table or CTE'}
              aria-pressed={!!internalFocusNodeId}
              type="button"
            >
              <Scan className="size-3.5" strokeWidth={internalFocusNodeId ? 2.5 : 1.5} />
            </button>
          </GraphTooltipTrigger>
          <GraphTooltipPortal>
            <GraphTooltipContent side="bottom">
              <p>Focus on Table or CTE</p>
              <GraphTooltipArrow />
            </GraphTooltipContent>
          </GraphTooltipPortal>
        </GraphTooltip>
      </GraphTooltipProvider>
      <GraphTooltipProvider>
        <GraphTooltip delayDuration={300}>
          <GraphTooltipTrigger asChild>
            <button
              onClick={() => {
                if (internalFocusNodeId && selectedNodeId) {
                  onFocusSelectModeChange?.(
                    focusSelectMode == 'none'
                      ? 'column'
                      : focusSelectMode == 'column'
                        ? 'table'
                        : 'none',
                    internalFocusNodeId,
                    selectedNodeId
                  );
                }
              }}
              className={cn(
                'self-center flex size-6 items-center justify-center rounded-full transition-colors duration-200',
                internalFocusNodeId && selectedNodeId
                  ? `bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 ${focusSelectMode == 'none' 
                    ? 'text-slate-700' : focusSelectMode == 'column' ? 'text-red-600' : 'text-orange-500'}`
                  : 'text-slate-400'
              )}
              aria-label={'Filter focus and selection'}
              aria-pressed={!!internalFocusNodeId}
              type="button"
            >
              <Focus
                className="size-3.5"
                strokeWidth={internalFocusNodeId ? 2.5 : 1.5}
              />
            </button>
          </GraphTooltipTrigger>
          <GraphTooltipPortal>
            <GraphTooltipContent side="bottom">
              <p>Filter focused and selected</p>
              <GraphTooltipArrow />
            </GraphTooltipContent>
          </GraphTooltipPortal>
        </GraphTooltip>
      </GraphTooltipProvider>
      <div className={`${PANEL_STYLES.container} px-1.5 transition-all duration-200`}>
        <DropdownMenu open={openHistoryNodes} onOpenChange={setOpenHistoryNodes}>
          <DropdownMenuTrigger asChild className="max-w-[300px]">
            <button
              className={cn(
                'flex items-center gap-2 h-7 px-3 rounded-full transition-all duration-200 text-sm font-medium',
                'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              )}
            >
              <span className="truncate">Recent</span>
              <ChevronDown className="size-4 opacity-50 shrink-0" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="max-w-[450px] p-0 flex flex-col gap-1" align="start">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
              <ul className="pl-4 list-disc text-sm font-medium text-slate-900 dark:text-slate-100">
                <li>Focus last table/CTE</li>
                <li>Select last column (without focusing).</li>
              </ul>
            </div>

            <div
              className="max-h-[200px] overflow-y-auto outline-hidden flex-1"
              ref={columnsListRef}
            >
              {historyNodes && historyNodes.length ? (
                historyNodes.map((node) => (
                  <div
                    className={cn(
                      'flex items-center gap-2 py-1 px-2 rounded-md cursor-pointer hover:bg-muted/50 group'
                    )}
                    key={node.id}
                    data-node-id={node.id}
                    onClick={() => {
                      setOpenHistoryNodes(false);
                      if (cache.current[node.id]?.cachedParent) {
                        onSelectNode(node.id, false, false);
                      } else {
                        onSelectNode(node.id, true, true);
                      }
                    }}
                  >
                    <span className={'flex-1 truncate text-sm'}>
                      {`${node.type == 'column' ? `${node.label} - ${getCanonicalName(cache.current[node.id]?.cachedParent)}` : getCanonicalName(node)}`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Empty History
                  </span>
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
