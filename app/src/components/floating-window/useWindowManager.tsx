import {
  DEFAULT_MIN_HEIGHT,
  DEFAULT_MIN_WIDTH,
  INITIAL_Z_INDEX,
} from './constants';
import type {
  DragState,
  ResizeDirection,
  UpdateWindowPatch,
  UseWindowManagerOptions,
  WindowDefinition,
  WindowId,
  WindowItem,
  WindowManagerApi,
} from './types';
import { clampWindowToViewport, createWindow } from './utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function useGlobalEscape(onEscape: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onEscape();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onEscape]);
}

function useDisableSelectionWhileDragging(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return;

    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isActive]);
}

export function useWindowManager(options: UseWindowManagerOptions): WindowManagerApi {
  const { initialWindows = [] } = options;
  const nextZRef = useRef(INITIAL_Z_INDEX);
  const dragStateRef = useRef<DragState>(null);
  const [interactionActive, setInteractionActive] = useState(false);

  const [windows, setWindows] = useState<WindowItem[]>(() => {
    const items = initialWindows.map((windowDef, index) =>
      createWindow({
        windowDef,
        index,
        zIndex: INITIAL_Z_INDEX + index,
      })
    );

    nextZRef.current = INITIAL_Z_INDEX + items.length;
    return items;
  });

  const topmostId = useMemo(() => {
    return windows
      .filter((item) => item.open)
      .sort((a, b) => b.zIndex - a.zIndex)[0]?.id;
  }, [windows]);

  const bringToFront = useCallback((id: WindowId) => {
    setWindows((prev) => {
      const target = prev.find((item) => item.id === id && item.open);
      if (!target) return prev;

      const nextZ = ++nextZRef.current;
      target.onActivate?.(id);
      target.onFocus?.(id);

      return prev.map((item) => (item.id === id ? { ...item, zIndex: nextZ } : item));
    });
  }, []);

  const closeWindow = useCallback((id: WindowId) => {
    setWindows((prev) =>
      prev.map((item) => {
        if (item.id !== id || !item.open) return item;
        item.onClose?.(id);
        return { ...item, open: false };
      })
    );
  }, []);

  const closeTopmost = useCallback(() => {
    setWindows((prev) => {
      const target = [...prev]
        .filter((item) => item.open)
        .sort((a, b) => b.zIndex - a.zIndex)[0];

      if (!target) return prev;
      target.onClose?.(target.id);
      return prev.map((item) => (item.id === target.id ? { ...item, open: false } : item));
    });
  }, []);

  const closeAllWindows = useCallback(() => {
    setWindows((prev) =>
      prev.map((item) => {
        if (item.open) item.onClose?.(item.id);
        return { ...item, open: false };
      })
    );
  }, []);

  const updateWindow = useCallback((id: WindowId, patch: UpdateWindowPatch) => {
    setWindows((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const nextItem: WindowItem = {
          ...item,
          title: patch.title ?? item.title,
          content: patch.content ?? item.content,
          width: patch.width ?? item.width,
          height: patch.height ?? item.height,
          minWidth: patch.minWidth ?? item.minWidth,
          minHeight: patch.minHeight ?? item.minHeight,
          className: patch.className ?? item.className,
        };

        return clampWindowToViewport(nextItem);
      })
    );
  }, []);

  const openWindow = useCallback((windowDef: WindowDefinition) => {
    setWindows((prev) => {
      const existingOpen = prev.find((item) => item.id === windowDef.id && item.open);
      const nextZ = ++nextZRef.current;

      if (existingOpen) {
        windowDef.onOpen?.(windowDef.id);
        windowDef.onActivate?.(windowDef.id);
        windowDef.onFocus?.(windowDef.id);

        return prev.map((item) =>
          item.id === windowDef.id
            ? {
                ...createWindow({
                  windowDef,
                  index: 0,
                  zIndex: nextZ,
                }),
                open: true,
              }
            : item
        );
      }

      const existingClosed = prev.find((item) => item.id === windowDef.id);
      const nextWindow = createWindow({
        windowDef,
        index: prev.filter((item) => item.open).length,
        zIndex: nextZ,
      });

      nextWindow.onOpen?.(nextWindow.id);
      nextWindow.onActivate?.(nextWindow.id);
      nextWindow.onFocus?.(nextWindow.id);

      if (existingClosed) {
        return prev.map((item) => (item.id === windowDef.id ? nextWindow : item));
      }

      return [...prev, nextWindow];
    });
  }, []);

  const replaceWindows = useCallback((windowDefs: WindowDefinition[]) => {
    const nextWindows = windowDefs.map((windowDef, index) =>
      createWindow({
        windowDef,
        index,
        zIndex: INITIAL_Z_INDEX + index,
      })
    );

    nextZRef.current = INITIAL_Z_INDEX + nextWindows.length;
    setWindows(nextWindows);
  }, []);

  useGlobalEscape(closeTopmost);
  useDisableSelectionWhileDragging(interactionActive);

  const startDrag = useCallback((id: WindowId, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const item = windows.find((windowItem) => windowItem.id === id && windowItem.open);
    if (!item) return;

    bringToFront(id);
    dragStateRef.current = {
      type: 'drag',
      id,
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: item.x,
      startY: item.y,
    };

    setInteractionActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [bringToFront, windows]);

  const startResize = useCallback(
    (id: WindowId, direction: ResizeDirection, event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      const item = windows.find((windowItem) => windowItem.id === id && windowItem.open);
      if (!item) return;

      bringToFront(id);
      dragStateRef.current = {
        type: 'resize',
        id,
        direction,
        pointerId: event.pointerId,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startX: item.x,
        startY: item.y,
        startWidth: item.width,
        startHeight: item.height,
      };

      setInteractionActive(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [bringToFront, windows]
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const dx = event.clientX - state.startPointerX;
      const dy = event.clientY - state.startPointerY;

      setWindows((prev) =>
        prev.map((item) => {
          if (item.id !== state.id || !item.open) return item;

          if (state.type === 'drag') {
            return clampWindowToViewport({
              ...item,
              x: state.startX + dx,
              y: state.startY + dy,
            });
          }

          let nextX = state.startX;
          let nextY = state.startY;
          let nextWidth = state.startWidth;
          let nextHeight = state.startHeight;

          const includesEast = state.direction.includes('e');
          const includesWest = state.direction.includes('w');
          const includesSouth = state.direction.includes('s');
          const includesNorth = state.direction.includes('n');

          if (includesEast) nextWidth = state.startWidth + dx;
          if (includesSouth) nextHeight = state.startHeight + dy;

          if (includesWest) {
            nextWidth = state.startWidth - dx;
            nextX = state.startX + dx;

            if (nextWidth < item.minWidth) {
              const deficit = item.minWidth - nextWidth;
              nextWidth = item.minWidth;
              nextX -= deficit;
            }
          }

          if (includesNorth) {
            nextHeight = state.startHeight - dy;
            nextY = state.startY + dy;

            if (nextHeight < item.minHeight) {
              const deficit = item.minHeight - nextHeight;
              nextHeight = item.minHeight;
              nextY -= deficit;
            }
          }

          return clampWindowToViewport({
            ...item,
            x: nextX,
            y: nextY,
            width: Math.max(item.minWidth ?? DEFAULT_MIN_WIDTH, nextWidth),
            height: Math.max(item.minHeight ?? DEFAULT_MIN_HEIGHT, nextHeight),
          });
        })
      );
    };

    const stopInteraction = () => {
      dragStateRef.current = null;
      setInteractionActive(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopInteraction);
    window.addEventListener('pointercancel', stopInteraction);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopInteraction);
      window.removeEventListener('pointercancel', stopInteraction);
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      setWindows((prev) => prev.map((item) => clampWindowToViewport(item)));
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return {
    windows,
    topmostId,
    openWindow,
    updateWindow,
    closeWindow,
    closeTopmost,
    closeAllWindows,
    bringToFront,
    replaceWindows,
    startDrag,
    startResize,
  };
}