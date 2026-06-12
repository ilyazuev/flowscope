import {
  CASCADE_OFFSET,
  DEFAULT_HEIGHT,
  DEFAULT_MIN_HEIGHT,
  DEFAULT_MIN_WIDTH,
  DEFAULT_WIDTH,
  HEADER_HEIGHT,
  MIN_VISIBLE_WINDOW_WIDTH,
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

export function getWindowViewportBounds(width: number) {
  const viewport = getViewportSize();

  const minX = VIEWPORT_MARGIN + MIN_VISIBLE_WINDOW_WIDTH - width;
  const maxX = Math.max(minX, viewport.width - VIEWPORT_MARGIN - MIN_VISIBLE_WINDOW_WIDTH);
  const minY = VIEWPORT_MARGIN;
  const maxY = Math.max(minY, viewport.height - HEADER_HEIGHT);

  return { minX, maxX, minY, maxY };
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
  const bounds = getWindowViewportBounds(width);

  return {
    ...item,
    width,
    height,
    x: clamp(item.x, bounds.minX, bounds.maxX),
    y: clamp(item.y, bounds.minY, bounds.maxY),
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
    contentClassName: params.windowDef.contentClassName,
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
