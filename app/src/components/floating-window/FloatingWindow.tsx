import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import type { FloatingWindowProps, ResizeDirection } from './types';

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
      aria-hidden="true"
    />
  );
}

export function FloatingWindow({
  item,
  isTopmost,
  isDark,
  onActivate,
  onClose,
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
          className="fixed outline-none"
          style={{
            left: item.x,
            top: item.y,
            width: item.width,
            height: item.height,
            zIndex: item.zIndex,
          }}
          aria-describedby={undefined}
        >
          <div
            className={[
              'relative flex h-full w-full flex-col overflow-hidden rounded-2xl border shadow-2xl',
              isDark
                ? 'border-white/10 bg-neutral-900 text-neutral-100'
                : 'border-black/10 bg-white text-neutral-900',
              item.className ?? '',
            ].join(' ')}
          >
            <Dialog.Title asChild>
              <div
                className={[
                  'flex h-11 shrink-0 touch-none select-none items-center justify-between border-b px-3',
                  isDark ? 'border-white/10 bg-neutral-800' : 'border-black/10 bg-neutral-50',
                ].join(' ')}
                onPointerDown={(event) => onDragStart(item.id, event)}
              >
                <div
                  className={[
                    'truncate pr-3 text-sm font-medium',
                    isDark ? 'text-neutral-100' : 'text-neutral-900',
                  ].join(' ')}
                >
                  {item.title}
                </div>

                <Dialog.Close asChild>
                  <button
                    type="button"
                    className={[
                      'inline-flex h-8 w-8 items-center justify-center rounded-lg transition focus:outline-none focus:ring-2',
                      isDark
                        ? 'text-neutral-400 hover:bg-white/10 hover:text-white focus:ring-neutral-500'
                        : 'text-neutral-500 hover:bg-black/5 hover:text-neutral-900 focus:ring-neutral-400',
                    ].join(' ')}
                    aria-label={`Close ${item.title}`}
                    onClick={() => onClose(item.id)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </Dialog.Title>

            <div
              className={[
                'min-h-0 flex-1 overflow-auto p-4 text-sm leading-6',
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
