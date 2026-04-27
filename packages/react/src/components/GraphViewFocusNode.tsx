import { useEffect, useMemo, useRef, useState, type JSX, useCallback, RefObject } from 'react';
import type { GlobalNode } from '@pondpilot/flowscope-core';
import { ChevronDown } from 'lucide-react';

import { PANEL_STYLES } from '../constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@pondpilot/flowscope-app/src/components/ui/dropdown-menu';
import { Checkbox } from '@pondpilot/flowscope-app/src/components/ui/checkbox';
import { cn } from '@pondpilot/flowscope-app/src/lib/utils';
import { GraphViewFocusNodeProps } from '../types';

export function GraphViewFocusNode({
  analysisResult,
  focusNodeId,
  selectedNodeId,
  onSelectNode,
  closeRequestKey,
  showColumnEdges,
}: GraphViewFocusNodeProps): JSX.Element {
  const [openFocusNodes, setOpenFocusNodes] = useState(false);
  const [openSelectNodes, setOpenSelectNodes] = useState(false);
  const [onlyTables, setOnlyTables] = useState(false);
  const focusNodeNamesListRef = useRef<HTMLDivElement>(null);
  const columnsListRef = useRef<HTMLDivElement>(null);

  const internalFocusNodeId = useMemo((): string | undefined => {
    if ( selectedNodeId ) {
      if( selectedNodeId == focusNodeId ) {
        selectedNodeId = undefined;
        return focusNodeId;
      }
      const edge = analysisResult.globalLineage?.edges.find(edge => edge.to === selectedNodeId && edge.type == 'ownership');
      console.log(edge?.from);
      return edge?.from;
    } else if ( focusNodeId ) {
      return focusNodeId;
    }
    return undefined;
  }, [analysisResult, focusNodeId, selectedNodeId]);


  const focusedNode = useMemo((): GlobalNode | undefined => {
    return internalFocusNodeId ? analysisResult.globalLineage?.nodes.find((node) => node.id === internalFocusNodeId) : undefined;
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
    if (!focusedNode.cachedChildren) {
      const ownershipEdgeIds = analysisResult.globalLineage.edges
        .filter((e) => e.from == focusedNode.id && e.type == 'ownership')
        .map((e) => e.to);
      focusedNode.cachedChildren = analysisResult.globalLineage.nodes
        .filter((node) => ownershipEdgeIds.includes(node.id))
        .sort((a, b) => a.label.localeCompare(b.label));
      focusedNode.cachedChildren.forEach((node) => (node.cachedParent = focusedNode));
    }
    return focusedNode.cachedChildren;
  }, [analysisResult, internalFocusNodeId]);

  const selectedNode = useMemo((): GlobalNode | undefined => {
    if( !selectedNodeId || !selectableColumns ) {
      return undefined;
    }
    return selectableColumns.find((node) => node.id == selectedNodeId);
  }, [analysisResult, internalFocusNodeId, selectedNodeId]);

  useEffect(() => {
    setOpenFocusNodes(false);
    setOpenSelectNodes(false);
  }, [closeRequestKey]);

  const scrollIntoView = useCallback(
    (refList:  RefObject<HTMLDivElement | null>, nodeId: string) => {
      return window.setTimeout(() => {
          const selectedNodeElement = refList.current?.querySelector<HTMLElement>(
            `[data-node-id="${CSS.escape(nodeId)}"]`
          );
          selectedNodeElement?.scrollIntoView({
            block: 'center',
          });
        }, 0)
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

  const getCanonicalName = useCallback(
    (node: GlobalNode| undefined) => {
      return node ? `${(node.canonicalName.schema ? `${node.canonicalName.schema}.` : '')}${node.canonicalName.name} (${node.type})`: null;
    },
    []
  );

  return (
    <>
      <div className={`${PANEL_STYLES.container} px-1.5 transition-all duration-200`}>
        <DropdownMenu open={openFocusNodes} onOpenChange={setOpenFocusNodes}>
          <DropdownMenuTrigger asChild className="max-w-[34 0px]">
            <button
              className={cn(
                'flex items-center gap-2 h-7 px-3 rounded-full transition-all duration-200 text-sm font-medium',
                'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              )}
            >
              <span className="truncate">
                {getCanonicalName(focusedNode) ?? 'Focus on Table or CTE'}
              </span>
              <ChevronDown className="size-4 opacity-50 shrink-0" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="w-80 p-0 flex flex-col gap-1" align="start">
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
                    onSelectNode(node.id, true);
                  }}
                >
                  <span
                    className={cn('flex-1 truncate text-sm', node.id === internalFocusNodeId && 'font-bold')}
                  >
                    {getCanonicalName(node)}
                  </span>
                </div>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      { showColumnEdges && (
        <div className={`${PANEL_STYLES.container} px-1.5 transition-all duration-200`}>
          <DropdownMenu open={openSelectNodes} onOpenChange={setOpenSelectNodes}>
            <DropdownMenuTrigger asChild className="max-w-[300px]">
              <button
                className={cn(
                  'flex items-center gap-2 h-7 px-3 rounded-full transition-all duration-200 text-sm font-medium',
                  'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
              <span className="truncate">
                {selectedNode ? selectedNode.label : 'Select Column'}
              </span>
                <ChevronDown className="size-4 opacity-50 shrink-0" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-80 p-0 flex flex-col gap-1" align="start">
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
                        onSelectNode(node.id, false);
                      }}
                    >
                    <span
                      className={cn(
                        'flex-1 truncate text-sm',
                        node.id === selectedNodeId && 'font-bold'
                      )}
                    >
                      {`${node.label} (${node.type})`}
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
    </>
  );
}
