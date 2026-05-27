import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { Node as FlowNode } from '@xyflow/react';

/**
 * Delay before focusing on a selected node after navigation.
 * Required because ReactFlow needs time to render nodes before we can
 * query their positions for viewport calculations.
 */
const NODE_FOCUS_DELAY_MS = 50; //100;

/**
 * Delay between moving the parent node into the viewport and querying
 * the selected column DOM element. This gives React Flow time to render
 * nodes when onlyRenderVisibleElements is enabled.
 */
const COLUMN_FOCUS_RENDER_DELAY_MS = 80;

const VIEWPORT_PADDING_PX = 52;
const FALLBACK_NODE_WIDTH = 220;
const FALLBACK_NODE_HEIGHT = 120;
const OPTIMAL_ZOOM = 0.8;

interface UseNodeFocusOptions {
  /** Node ID to focus on */
  focusNodeId?: string;
  /** Selected child node/column ID that should be visible inside focusNodeId */
  selectedNodeId?: string;
  /** Callback when focus has been applied */
  onFocusApplied?: () => void;
  /** Duration of the viewport animation in ms */
  duration?: number;
  focusNodeRequestKey?: number;
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function getNodeSize(node: FlowNode | undefined): { width: number; height: number } {
  if (!node) {
    return { width: FALLBACK_NODE_WIDTH, height: FALLBACK_NODE_HEIGHT };
  }

  const styleWidth = typeof node.style?.width === 'number' ? node.style.width : undefined;
  const styleHeight = typeof node.style?.height === 'number' ? node.style.height : undefined;

  return {
    width: node.measured?.width ?? node.width ?? styleWidth ?? FALLBACK_NODE_WIDTH,
    height: node.measured?.height ?? node.height ?? styleHeight ?? FALLBACK_NODE_HEIGHT,
  };
}

function getFlowPaneRect(): DOMRect | undefined {
  return document.querySelector('.react-flow')?.getBoundingClientRect();
}

function getNodeElement(nodeId: string): HTMLElement | null {
  return document.querySelector(
    `.react-flow__node[data-id="${cssEscape(nodeId)}"]`
  ) as HTMLElement | null;
}

function getColumnElement(nodeId: string, selectedNodeId: string): HTMLElement | null {
  return getNodeElement(nodeId)?.querySelector(
    `[data-column-id="${cssEscape(selectedNodeId)}"]`
  ) as HTMLElement | null;
}

function getNodeCenter(node: FlowNode): { x: number; y: number } {
  const { width, height } = getNodeSize(node);

  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
  };
}

function getViewportForPoint(
  paneRect: DOMRect,
  point: { x: number; y: number },
  zoom: number
): { x: number; y: number; zoom: number } {
  return {
    x: paneRect.width / 2 - point.x * zoom,
    y: paneRect.height / 2 - point.y * zoom,
    zoom,
  };
}

function getViewportForNodeTop(
  paneRect: DOMRect,
  node: FlowNode,
  zoom: number
): { x: number; y: number; zoom: number } {
  const nodeCenter = getNodeCenter(node);

  return {
    x: paneRect.width / 2 - nodeCenter.x * zoom,
    y: VIEWPORT_PADDING_PX - node.position.y * zoom,
    zoom,
  };
}

function getViewportForNode(
  paneRect: DOMRect,
  node: FlowNode,
  zoom: number
): { x: number; y: number; zoom: number } {
  const { height } = getNodeSize(node);

  if (height * zoom > paneRect.height - VIEWPORT_PADDING_PX * 2) {
    return getViewportForNodeTop(paneRect, node, zoom);
  }

  return getViewportForPoint(paneRect, getNodeCenter(node), zoom);
}

/**
 * Converts the rendered column center from screen coordinates to flow coordinates.
 *
 * We intentionally do not derive this from node.data.columns indexes because the rendered
 * table can have dynamic header height, expanded/collapsed state, virtualized rows, and
 * future layout changes. DOM measurement is the source of truth once the parent node is
 * visible and rendered.
 */
function getRenderedColumnCenter(
  nodeId: string,
  selectedNodeId: string,
  viewport: { x: number; y: number; zoom: number }
): { x: number; y: number } | undefined {
  const columnElement = getColumnElement(nodeId, selectedNodeId);
  if (!columnElement) {
    return undefined;
  }

  const paneRect = getFlowPaneRect();
  if (!paneRect) {
    return undefined;
  }

  const columnRect = columnElement.getBoundingClientRect();

  const screenX = columnRect.left + columnRect.width / 2 - paneRect.left;
  const screenY = columnRect.top + columnRect.height / 2 - paneRect.top;

  return {
    x: (screenX - viewport.x) / viewport.zoom,
    y: (screenY - viewport.y) / viewport.zoom,
  };
}

/**
 * Hook to handle programmatic node focusing in ReactFlow.
 *
 * Important: this deliberately preserves the current zoom. ReactFlow's fitView()
 * changes zoom, so focusing is implemented via setViewport() with the existing
 * viewport.zoom.
 *
 * Behavior:
 * - without selectedNodeId: center the node at the current zoom;
 * - if the node is taller than the visible pane at the current zoom: keep the
 *   node title/top visible instead of centering on the invisible middle;
 * - with selectedNodeId: two-step focus:
 *   1. move the parent node into the viewport at the current zoom;
 *   2. after React Flow renders the node DOM, center on the selected column DOM row.
 *
 * Must be used within a ReactFlow component.
 */
export function useNodeFocus({
  focusNodeId,
  selectedNodeId,
  onFocusApplied,
  duration = 150, // 500
  focusNodeRequestKey,
}: UseNodeFocusOptions): void {
  const { getNode, getViewport, setViewport } = useReactFlow();
  const prevFocusRef = useRef<string | undefined>(undefined);
  const prevSelectedRef = useRef<string | undefined>(undefined);
  const prevFocusNodeRequestKey = useRef<number | undefined>(undefined);

  useEffect(() => {
    const shouldApplyFocus =
      focusNodeId &&
      (focusNodeId !== prevFocusRef.current ||
        selectedNodeId !== prevSelectedRef.current ||
        focusNodeRequestKey !== prevFocusNodeRequestKey.current);

    if (!shouldApplyFocus) {
      if (!focusNodeId) {
        prevFocusRef.current = undefined;
        prevSelectedRef.current = undefined;
      }
      return;
    }

    let columnFocusTimer: ReturnType<typeof setTimeout> | undefined;

    const nodeFocusTimer = setTimeout(() => {
      const node = getNode(focusNodeId);
      const paneRect = getFlowPaneRect();

      if (!node || !paneRect || paneRect.width <= 0 || paneRect.height <= 0) {
        onFocusApplied?.();
        return;
      }

      const initialViewport = getViewport();
      const zoom = Math.max(initialViewport.zoom, OPTIMAL_ZOOM);

      // Step 1: bring the parent node into the viewport without changing zoom.
      setViewport(getViewportForNode(paneRect, node, zoom), { duration });

      if (!selectedNodeId) {
        onFocusApplied?.();
        return;
      }

      // Step 2: after the parent node becomes rendered, use the actual column DOM row
      // as the source of truth and center it without changing zoom.
      columnFocusTimer = setTimeout(() => {
        const latestPaneRect = getFlowPaneRect();
        const latestViewport = getViewport();
        const columnCenter = getRenderedColumnCenter(focusNodeId, selectedNodeId, latestViewport);

        if (latestPaneRect && columnCenter) {
          setViewport(getViewportForPoint(latestPaneRect, columnCenter, latestViewport.zoom), {
            duration,
          });
        }

        onFocusApplied?.();
      }, Math.max(COLUMN_FOCUS_RENDER_DELAY_MS, duration));

    }, NODE_FOCUS_DELAY_MS);

    prevFocusRef.current = focusNodeId;
    prevSelectedRef.current = selectedNodeId;
    prevFocusNodeRequestKey.current = focusNodeRequestKey;

    return () => {
      clearTimeout(nodeFocusTimer);
      if (columnFocusTimer) {
        clearTimeout(columnFocusTimer);
      }
    };
  }, [
    focusNodeId,
    selectedNodeId,
    focusNodeRequestKey,
    getNode,
    getViewport,
    setViewport,
    onFocusApplied,
    duration,
  ]);
}
