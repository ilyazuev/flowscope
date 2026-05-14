import * as React from 'react';

export type WindowId = string;

export type WindowCallbacks = {
  onOpen?: (id: WindowId) => void;
  onClose?: (id: WindowId) => void;
  onActivate?: (id: WindowId) => void;
  onFocus?: (id: WindowId) => void;
};

export type WindowDefinition = WindowCallbacks & {
  id: WindowId;
  title: string;
  content: React.ReactNode;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  contentClassName?: string;
};

export type WindowItem = WindowCallbacks & {
  id: WindowId;
  title: string;
  content: React.ReactNode;
  open: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  zIndex: number;
  className?: string;
  contentClassName?: string;
};

export type ResizeDirection =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw';

export type WindowScaleDirection = 'expand' | 'shrink';

export type WindowScaleAnchor = {
  clientX: number;
  clientY: number;
  offsetFromRight: number;
  offsetFromTop: number;
};

export type DragState =
  | {
      type: 'drag';
      id: WindowId;
      pointerId: number;
      startPointerX: number;
      startPointerY: number;
      startX: number;
      startY: number;
      width: number;
      height: number;
      element: HTMLElement | null;
      latestX: number;
      latestY: number;
    }
  | {
      type: 'resize';
      id: WindowId;
      pointerId: number;
      direction: ResizeDirection;
      startPointerX: number;
      startPointerY: number;
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
    }
  | null;

export type ResolvedTheme = 'light' | 'dark';

export type UseWindowManagerOptions = {
  initialWindows?: WindowDefinition[];
  theme: ResolvedTheme;
};

export type UpdateWindowPatch = Partial<
  Pick<
    WindowDefinition,
    'title' | 'content' | 'width' | 'height' | 'minWidth' | 'minHeight' | 'className' | 'contentClassName'
  >
>;

export type WindowManagerApi = {
  windows: WindowItem[];
  topmostId?: WindowId;
  openWindow: (windowDef: WindowDefinition) => void;
  updateWindow: (id: WindowId, patch: UpdateWindowPatch) => void;
  closeWindow: (id: WindowId) => void;
  closeTopmost: () => void;
  closeAllWindows: () => void;
  bringToFront: (id: WindowId) => void;
  replaceWindows: (windows: WindowDefinition[]) => void;
  scaleWindow: (id: WindowId, direction: WindowScaleDirection, anchor?: WindowScaleAnchor) => void;
  startDrag: (id: WindowId, event: React.PointerEvent<HTMLDivElement>) => void;
  startResize: (
    id: WindowId,
    direction: ResizeDirection,
    event: React.PointerEvent<HTMLDivElement>
  ) => void;
};

export type FloatingWindowsProps = {
  manager: WindowManagerApi;
  theme: ResolvedTheme;
};

export type FloatingWindowProps = {
  item: WindowItem;
  isTopmost: boolean;
  isDark: boolean;
  onActivate: (id: WindowId) => void;
  onClose: (id: WindowId) => void;
  onScale: (id: WindowId, direction: WindowScaleDirection, anchor?: WindowScaleAnchor) => void;
  onDragStart: (id: WindowId, event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (
    id: WindowId,
    direction: ResizeDirection,
    event: React.PointerEvent<HTMLDivElement>
  ) => void;
};