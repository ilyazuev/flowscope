import React, { JSX, useEffect, useMemo, useRef, useState } from 'react';
import { GraphViewFocusNodeProps, type Node as LineageNode } from '../types';
import { PANEL_STYLES } from '../constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@pondpilot/flowscope-app/src/components/ui/dropdown-menu';
import { cn } from '@pondpilot/flowscope-app/src/lib/utils';
import { ChevronDown } from 'lucide-react';

export function GraphViewFocusColumn({
  analysisResult,
  focusNodeId,
  onSelectNode,
  closeRequestKey,
}: GraphViewFocusNodeProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const focusNodeNamesListRef = useRef<HTMLDivElement>(null);

  const focusedNode = useMemo((): LineageNode | undefined => {
    if (!focusNodeId) {
      return undefined;
    }
    return analysisResult.globalLineage?.nodes.find((node) => node.id === focusNodeId);
  }, [analysisResult, focusNodeId]);

  const selectableNodes = useMemo(() => {
    if( !focusedNode ) {
      return [];
    }
    if( !focusedNode.cachedChildren ) {
      const ownershipEdgeIds = analysisResult.globalLineage.edges.filter(e=>e.from == focusedNode.id && e.type == 'ownership').map(e=>e.to);
      focusedNode.cachedChildren = analysisResult.globalLineage.nodes
        .filter((node) => ownershipEdgeIds.includes(node.id))
        .sort((a, b) => a.label.localeCompare(b.label))
      focusedNode.cachedChildren.forEach((node) => node.cachedParent = focusedNode);
    }
    return focusedNode.cachedChildren;
  }, [analysisResult, focusNodeId]);

  useEffect(() => {
    setOpen(false);
  }, [closeRequestKey]);

  useEffect(() => {
    if (!open || !focusNodeId) {
      return;
    }
    const timer = window.setTimeout(() => {
      const selectedNodeElement = focusNodeNamesListRef.current?.querySelector<HTMLElement>(
        `[data-node-id="${CSS.escape(focusNodeId)}"]`
      );
      selectedNodeElement?.scrollIntoView({
        block: 'center',
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, focusNodeId]);

  return (
    <div className={`${PANEL_STYLES.container} px-1.5 transition-all duration-200`}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild className="max-w-[300px]">
          <button
            className={cn(
              'flex items-center gap-2 h-7 px-3 rounded-full transition-all duration-200 text-sm font-medium',
              'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            )}
          >
            <span className="truncate">
              {focusedNode ? `${focusedNode.label} (${focusedNode.type})` : 'Focus on Column'}
            </span>
            <ChevronDown className="size-4 opacity-50 shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-80 p-0 flex flex-col gap-1" align="start">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Set focus on Column
            </span>
          </div>

          <div
            className="max-h-[200px] overflow-y-auto outline-hidden flex-1"
            ref={focusNodeNamesListRef}
          >
            {
              selectableNodes && selectableNodes.length
              ? selectableNodes.map((node) => (
                  <div
                    className={cn(
                      'flex items-center gap-2 py-1 px-2 rounded-md cursor-pointer hover:bg-muted/50 group'
                    )}
                    key={node.id}
                    data-node-id={node.id}
                    onClick={() => {
                      setOpen(false);
                      onSelectNode(node.id);
                    }}
                  >
                      <span
                        className={cn('flex-1 truncate text-sm', node.id === focusNodeId && 'font-bold')}
                      >
                        {`${node.label} (${node.type})`}
                      </span>
                  </div>
                ))
              : <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    No Columns
                  </span>
                </div>
            }
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

}