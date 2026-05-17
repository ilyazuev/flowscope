import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Expand, Shrink, X } from 'lucide-react';

import type { FloatingWindowProps, ResizeDirection, WindowScaleDirection } from './types';
import { WINDOW_SCALE_STEP } from './constants';

const WINDOW_SHADOWS = {
  light: {
    active:
      '0 28px 80px rgba(15, 23, 42, 0.24), 0 12px 32px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.10)',
    inactive:
      '0 18px 48px rgba(15, 23, 42, 0.16), 0 8px 20px rgba(15, 23, 42, 0.10)',
  },
  dark: {
    active:
      '0 32px 90px rgba(0, 0, 0, 0.72), 0 14px 36px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.08)',
    inactive:
      '0 22px 58px rgba(0, 0, 0, 0.56), 0 10px 24px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(255, 255, 255, 0.05)',
  },
} as const;


function getScaleAnchor(
  item: FloatingWindowProps['item'],
  event: React.MouseEvent<HTMLButtonElement>
) {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    offsetFromRight: item.x + item.width - event.clientX,
    offsetFromTop: event.clientY - item.y,
  };
}

function scaleFromButton(
  item: FloatingWindowProps['item'],
  direction: WindowScaleDirection,
  event: React.MouseEvent<HTMLButtonElement>,
  onScale: FloatingWindowProps['onScale']
) {
  event.stopPropagation();
  onScale(item.id, direction, getScaleAnchor(item, event));
}

function ResizeHandle({
  direction,
  onPointerDown,
}: {
  direction: ResizeDirection;
  onPointerDown: (direction: ResizeDirection, event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const classes: Record<ResizeDirection, string> = {
    n: 'top-0 left-3 right-3 h-1 cursor-ns-resize',
    s: 'bottom-0 left-3 right-3 h-1 cursor-ns-resize',
    e: 'right-0 top-3 bottom-3 w-1 cursor-ew-resize',
    w: 'left-0 top-3 bottom-3 w-1 cursor-ew-resize',
    ne: 'right-0 top-0 h-3 w-3 cursor-nesw-resize',
    nw: 'left-0 top-0 h-3 w-3 cursor-nwse-resize',
    se: 'right-0 bottom-0 h-3 w-3 cursor-nwse-resize',
    sw: 'left-0 bottom-0 h-3 w-3 cursor-nesw-resize',
  };

  return (
    <div
      className={`absolute z-[1] touch-none ${classes[direction]}`}
      onPointerDown={(event) => onPointerDown(direction, event)}
    />
  );
}

export function FloatingWindow({
  item,
  isTopmost,
  isDark,
  onActivate,
  onClose,
  onScale,
  onDragStart,
  onResizeStart,
}: FloatingWindowProps) {
  return (
    <Dialog.Root open={item.open} modal={false}>
      <Dialog.Portal>
        <Dialog.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (!isTopmost) {
              event.preventDefault();
              return;
            }
            event.preventDefault();
          }}
          onPointerDown={() => onActivate(item.id)}
          data-floating-window-id={item.id}
          className="fixed outline-none transition-[box-shadow] duration-200"
          style={{
            left: 0,
            top: 0,
            width: item.width,
            height: item.height,
            zIndex: item.zIndex,
            transform: `translate3d(${item.x}px, ${item.y}px, 0)`,
            willChange: 'transform',
            contain: 'layout style',
            boxShadow: WINDOW_SHADOWS[isDark ? 'dark' : 'light'][isTopmost ? 'active' : 'inactive'],
            borderTopRightRadius: '5%',
            borderTopLeftRadius: '5%',
            borderBottomLeftRadius: '5%',
          }}
          aria-describedby={undefined}
        >
          <div
            className={[
              'relative flex h-full w-full flex-col overflow-hidden rounded-2xl border',
              isDark
                ? 'border-white/10 bg-neutral-900 text-neutral-100'
                : 'border-black/10 bg-white text-neutral-900',
              item.className ?? '',
            ].join(' ')}
          >
            <Dialog.Title asChild>
              <div
                className={[
                  'flex h-11 shrink-0 touch-none select-none items-center justify-between border-b px-3 cursor-move',
                  isDark ? 'border-white/10 bg-neutral-800' : 'border-black/10 bg-neutral-50',
                ].join(' ')}
                onPointerDown={(event) => {
                  const target = event.target as HTMLElement | null;
                  if (target && (target.tagName === 'BUTTON' || target.closest('button'))) {
                    return;
                  }
                  onDragStart(item.id, event);
                }}
              >
                <div
                  className={[
                    'truncate pr-3 text-sm font-medium',
                    isDark ? 'text-neutral-100' : 'text-neutral-900',
                  ].join(' ')}
                >
                  {item.title}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={[
                      'inline-flex h-8 w-8 items-center justify-center rounded-lg transition',
                      'focus:shadow-none focus:border-transparent focus:ring-0 focus:outline-none',
                      isDark
                        ? 'text-neutral-400 hover:bg-white/10 hover:text-white focus:ring-neutral-500'
                        : 'text-neutral-500 hover:bg-black/5 hover:text-neutral-900 focus:ring-neutral-400',
                    ].join(' ')}
                    aria-label={`Shrink ${item.title}`}
                    title={`Shrink window by ${WINDOW_SCALE_STEP*100}%`}
                    onClick={(event) => scaleFromButton(item, 'shrink', event, onScale)}
                  >
                    <Shrink className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    className={[
                      'inline-flex h-8 w-8 items-center justify-center rounded-lg transition',
                      'focus:shadow-none focus:border-transparent focus:ring-0 focus:outline-none',
                      isDark
                        ? 'text-neutral-400 hover:bg-white/10 hover:text-white focus:ring-neutral-500'
                        : 'text-neutral-500 hover:bg-black/5 hover:text-neutral-900 focus:ring-neutral-400',
                    ].join(' ')}
                    aria-label={`Expand ${item.title}`}
                    title={`Expand window by ${WINDOW_SCALE_STEP*100}%`}
                    onClick={(event) => scaleFromButton(item, 'expand', event, onScale)}
                  >
                    <Expand className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    className={[
                      'inline-flex h-8 w-8 items-center justify-center rounded-lg transition',
                      'focus:shadow-none focus:border-transparent focus:ring-0 focus:outline-none',
                      isDark
                        ? 'text-neutral-400 hover:bg-white/10 hover:text-white focus:ring-neutral-500'
                        : 'text-neutral-500 hover:bg-black/5 hover:text-neutral-900 focus:ring-neutral-400',
                    ].join(' ')}
                    aria-label={`Close ${item.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose(item.id);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Dialog.Title>

            <div
              className={[
                item.contentClassName ?? 'min-h-0 flex-1 overflow-auto p-4 text-sm leading-6',
                isDark ? 'text-neutral-200' : 'text-neutral-700',
              ].join(' ')}
            >
              {item.content}
            </div>

            <ResizeHandle direction="n" onPointerDown={(dir, e) => onResizeStart(item.id, dir, e)} />
            <ResizeHandle direction="s" onPointerDown={(dir, e) => onResizeStart(item.id, dir, e)} />
            <ResizeHandle direction="e" onPointerDown={(dir, e) => onResizeStart(item.id, dir, e)} />
            <ResizeHandle direction="w" onPointerDown={(dir, e) => onResizeStart(item.id, dir, e)} />
            <ResizeHandle direction="ne" onPointerDown={(dir, e) => onResizeStart(item.id, dir, e)} />
            <ResizeHandle direction="nw" onPointerDown={(dir, e) => onResizeStart(item.id, dir, e)} />
            <ResizeHandle direction="se" onPointerDown={(dir, e) => onResizeStart(item.id, dir, e)} />
            <ResizeHandle direction="sw" onPointerDown={(dir, e) => onResizeStart(item.id, dir, e)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
