import {
  CASCADE_OFFSET,
  DEFAULT_HEIGHT,
  DEFAULT_MIN_HEIGHT,
  DEFAULT_MIN_WIDTH,
  DEFAULT_WIDTH,
  HEADER_HEIGHT,
  VIEWPORT_MARGIN,
} from './constants';
import type { WindowDefinition, WindowItem } from './types';

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function clampWindowToViewport(item: WindowItem): WindowItem {
  const viewport = getViewportSize();
  const width = clamp(
    item.width,
    item.minWidth,
    Math.max(item.minWidth, viewport.width - VIEWPORT_MARGIN * 2)
  );
  const height = clamp(
    item.height,
    item.minHeight,
    Math.max(item.minHeight, viewport.height - VIEWPORT_MARGIN * 2)
  );

  const minX = -(width - 120);
  const maxX = viewport.width - 120;
  const minY = VIEWPORT_MARGIN;
  const maxY = viewport.height - HEADER_HEIGHT;

  return {
    ...item,
    width,
    height,
    x: clamp(item.x, minX, maxX),
    y: clamp(item.y, minY, maxY),
  };
}

export function createWindow(params: {
  windowDef: WindowDefinition;
  index: number;
  zIndex: number;
}): WindowItem {
  const viewport = getViewportSize();
  const minWidth = params.windowDef.minWidth ?? DEFAULT_MIN_WIDTH;
  const minHeight = params.windowDef.minHeight ?? DEFAULT_MIN_HEIGHT;
  const width = Math.min(
    Math.max(params.windowDef.width ?? DEFAULT_WIDTH, minWidth),
    viewport.width - VIEWPORT_MARGIN * 2
  );
  const height = Math.min(
    Math.max(params.windowDef.height ?? DEFAULT_HEIGHT, minHeight),
    viewport.height - VIEWPORT_MARGIN * 2
  );
  const baseX = Math.max(VIEWPORT_MARGIN, Math.round((viewport.width - width) / 2));
  const baseY = Math.max(VIEWPORT_MARGIN, Math.round((viewport.height - height) / 2));

  return clampWindowToViewport({
    id: params.windowDef.id,
    title: params.windowDef.title,
    content: params.windowDef.content,
    className: params.windowDef.className,
    onOpen: params.windowDef.onOpen,
    onClose: params.windowDef.onClose,
    onActivate: params.windowDef.onActivate,
    onFocus: params.windowDef.onFocus,
    open: true,
    width,
    height,
    minWidth,
    minHeight,
    x: baseX + params.index * CASCADE_OFFSET,
    y: baseY + params.index * CASCADE_OFFSET,
    zIndex: params.zIndex,
  });
}
